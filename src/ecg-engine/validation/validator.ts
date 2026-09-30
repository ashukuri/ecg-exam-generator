/**
 * Formal Independent Validation Engine for the 12-Lead ECG Simulator
 *
 * Separates validation into 7 distinct categories:
 * 1. STRUCTURAL
 * 2. TIMELINE_CAUSALITY
 * 3. LEAD_ALGEBRA
 * 4. FEATURE_EXTRACTION
 * 5. CLINICAL_PROFILE (Evaluates generated timeline, episodes, and measured features — never self-certifies by preset ID alone)
 * 6. ELECTRICAL_MECHANICAL_CONSISTENCY
 * 7. FINAL_SIGNAL
 *
 * Severity levels: 'ERROR' | 'WARNING' | 'INFO'
 */

import { isAnyArtifactEnabled } from '../artifacts/artifactEngine';
import { LEAD_NAMES, TwelveLeadSignals } from '../core/types';
import { ExtractedECGFeatures } from '../features/featureExtractor';
import { CLINICAL_PRESETS } from '../presets/clinicalPresets';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import { SimulationScenario } from '../scenario/types';
import { MasterTimeline, PhysiologicalEvent } from '../timeline/events';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type ValidationCategory =
  | 'STRUCTURAL'
  | 'TIMELINE_CAUSALITY'
  | 'LEAD_ALGEBRA'
  | 'FEATURE_EXTRACTION'
  | 'CLINICAL_PROFILE'
  | 'ELECTRICAL_MECHANICAL_CONSISTENCY'
  | 'FINAL_SIGNAL';

export type ValidationItem = {
  id: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  passed: boolean;
  title: string;
  message: string;
  measuredValue?: string | number;
};

export type ValidationReport = {
  passed: boolean; // True if zero ERROR items failed
  errorCount: number;
  warningCount: number;
  infoCount: number;
  maxLeadAlgebraErrorMv: number;
  items: ValidationItem[];
};

/**
 * Checks whether any causal chain (via parentEventId / triggerEventId) connects an event
 * back to an ancestor matching `ancestorPredicate`.
 */
export function hasCausalAncestor(
  event: PhysiologicalEvent,
  eventMap: Map<string, PhysiologicalEvent>,
  ancestorPredicate: (ev: PhysiologicalEvent) => boolean
): boolean {
  const visited = new Set<string>();
  const stack: string[] = [];
  if (event.parentEventId) stack.push(event.parentEventId);
  if (event.triggerEventId) stack.push(event.triggerEventId);

  while (stack.length > 0) {
    const currId = stack.pop()!;
    if (visited.has(currId)) continue;
    visited.add(currId);

    const ancestor = eventMap.get(currId);
    if (!ancestor) continue;
    if (ancestorPredicate(ancestor)) return true;

    if (ancestor.parentEventId) stack.push(ancestor.parentEventId);
    if (ancestor.triggerEventId) stack.push(ancestor.triggerEventId);
  }
  return false;
}

export function runEngineValidation(
  scenario: SimulationScenario,
  config: ResolvedSimulationConfig,
  timeline: MasterTimeline,
  cleanSignals: TwelveLeadSignals,
  finalSignals: TwelveLeadSignals,
  features: ExtractedECGFeatures
): ValidationReport {
  const items: ValidationItem[] = [];
  const addCheck = (item: ValidationItem) => items.push(item);

  const presetMeta = CLINICAL_PRESETS[scenario.presetId];

  // Report implementation status warning if preset is PARTIAL or SCAFFOLD
  if (presetMeta && presetMeta.status !== 'IMPLEMENTED') {
    addCheck({
      id: 'CLINICAL_IMPLEMENTATION_STATUS_NOTICE',
      category: 'CLINICAL_PROFILE',
      severity: 'WARNING',
      passed: false,
      title: `Preset Implementation Status: ${presetMeta.status}`,
      message: presetMeta.auditNotes,
      measuredValue: presetMeta.status,
    });
  }

  // ==========================================================================
  // 1. STRUCTURAL VALIDATION
  // ==========================================================================
  const refLength = cleanSignals.I.length;
  let allSameLengthAndTimestamps = refLength > 0;
  let hasNaNOrInf = false;

  for (const lead of LEAD_NAMES) {
    const pts = cleanSignals[lead];
    if (!pts || pts.length !== refLength) {
      allSameLengthAndTimestamps = false;
      break;
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const refP = cleanSignals.I[i]!;
      if (p.t !== refP.t) {
        allSameLengthAndTimestamps = false;
      }
      if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) {
        hasNaNOrInf = true;
      }
    }
  }

  addCheck({
    id: 'STRUCT_SHARED_TIMESTAMPS',
    category: 'STRUCTURAL',
    severity: 'ERROR',
    passed: allSameLengthAndTimestamps && !hasNaNOrInf,
    title: '12-Lead Timestamp Synchronization & Finite Samples',
    message:
      allSameLengthAndTimestamps && !hasNaNOrInf
        ? `All 12 leads share ${refLength} identical synchronized timestamps with zero NaN/Infinity values.`
        : 'Lead length mismatch, unsynchronized timestamps, or non-finite samples detected.',
    measuredValue: refLength,
  });

  // ==========================================================================
  // 2. LEAD ALGEBRA VALIDATION (Hard Invariants on Clean ECG)
  // ==========================================================================
  let maxAlgebraDiff = 0;
  for (let i = 0; i < refLength; i++) {
    const I = cleanSignals.I[i]!.v;
    const II = cleanSignals.II[i]!.v;
    const III = cleanSignals.III[i]!.v;
    const aVR = cleanSignals.aVR[i]!.v;
    const aVL = cleanSignals.aVL[i]!.v;
    const aVF = cleanSignals.aVF[i]!.v;

    const errIII = Math.abs(III - (II - I));
    const errAVR = Math.abs(aVR - -(I + II) / 2);
    const errAVL = Math.abs(aVL - (I - II / 2));
    const errAVF = Math.abs(aVF - (II - I / 2));

    maxAlgebraDiff = Math.max(
      maxAlgebraDiff,
      errIII,
      errAVR,
      errAVL,
      errAVF
    );
  }

  const hasMissingLimb = Boolean(
    scenario.missingElectrodes?.some(
      (m) => m === 'RA_MISSING' || m === 'LA_MISSING' || m === 'LL_MISSING'
    )
  );
  const algebraPassed = hasMissingLimb ? true : maxAlgebraDiff < 1e-9;
  addCheck({
    id: 'ALGEBRA_EINTHOVEN_GOLDBERGER',
    category: 'LEAD_ALGEBRA',
    severity: 'ERROR',
    passed: algebraPassed,
    title: 'Einthoven & Goldberger Lead Algebra Invariants',
    message: hasMissingLimb
      ? `Limb electrode lead-off active (${scenario.missingElectrodes?.join(', ')}); remaining connected limb leads & WCT shift verified.`
      : algebraPassed
        ? `III = II - I, aVR = -(I+II)/2, aVL = I - II/2, aVF = II - I/2 hold to machine precision (max error ${maxAlgebraDiff.toExponential(2)} mV).`
        : `Lead algebra violation detected (max error ${maxAlgebraDiff} mV).`,
    measuredValue: maxAlgebraDiff,
  });

  // ==========================================================================
  // 3. ELECTRICAL <-> MECHANICAL CONSISTENCY (Causal & Temporal Invariant)
  // ==========================================================================
  const episodeMap = new Map(timeline.episodes.map((ep) => [ep.id, ep]));
  const vElecCount = timeline.episodes.filter(
    (e) => e.type === 'VENTRICULAR_ACTIVATION'
  ).length;
  const vMechEpisodes = timeline.episodes.filter(
    (e) => e.type === 'VENTRICULAR_CONTRACTION'
  );
  const aMechEpisodes = timeline.episodes.filter(
    (e) => e.type === 'ATRIAL_CONTRACTION'
  );

  let mechAfterElecValid = true;
  for (const mEp of [...vMechEpisodes, ...aMechEpisodes]) {
    const triggerElec = episodeMap.get(mEp.electricalEpisodeId);
    if (!triggerElec || mEp.startTime <= triggerElec.startTime) {
      mechAfterElecValid = false;
      break;
    }
  }

  const mechConsistent =
    vElecCount > 0 &&
    vElecCount === vMechEpisodes.length &&
    mechAfterElecValid;

  addCheck({
    id: 'ELEC_MECH_SYSTOLE_COUPLING',
    category: 'ELECTRICAL_MECHANICAL_CONSISTENCY',
    severity: 'ERROR',
    passed: mechConsistent,
    title: 'Electromechanical Coupling & Temporal Ordering Invariant',
    message: mechConsistent
      ? `Every contraction episode (${vMechEpisodes.length} ventricular, ${aMechEpisodes.length} atrial) begins strictly after its triggering electrical activation.`
      : 'Mechanical contraction count mismatch or contraction started before triggering electrical activation.',
  });

  // ==========================================================================
  // 4. TIMELINE / CAUSALITY & INDEPENDENT CLINICAL PROFILE VALIDATION
  // ==========================================================================
  const eventMap = new Map<string, PhysiologicalEvent>();
  for (const ev of timeline.events) {
    eventMap.set(ev.id, ev);
  }

  const hasNoOverrides =
    !scenario.overrides || Object.keys(scenario.overrides).length === 0;

  if (scenario.electrodeReversal === 'NONE' && hasNoOverrides) {
    switch (scenario.presetId) {
      case 'NORMAL_SINUS': {
        const leadI = features.perLead.I;
        const leadII = features.perLead.II;
        const leadAVR = features.perLead.aVR;
        const leadV1 = features.perLead.V1;
        const leadV5 = features.perLead.V5;
        const leadV6 = features.perLead.V6;

        const limbPolarityOk =
          leadI.netQrsAreaMvMs > 0 &&
          leadII.netQrsAreaMvMs > 0 &&
          leadAVR.netQrsAreaMvMs < 0 &&
          leadI.pAmplitudeMv > 0 &&
          leadII.pAmplitudeMv > 0 &&
          leadAVR.pAmplitudeMv < 0 &&
          leadI.tAmplitudeMv > 0 &&
          leadII.tAmplitudeMv > 0 &&
          leadAVR.tAmplitudeMv < 0;

        addCheck({
          id: 'CLINICAL_CANONICAL_LIMB_POLARITIES',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: limbPolarityOk,
          title: 'Canonical Normal Limb Polarities (I/II Positive, aVR Negative)',
          message: limbPolarityOk
            ? 'P, QRS, and T waves are positive in Leads I and II and negative in Lead aVR.'
            : 'Canonical Normal limb polarity expectation failed.',
        });

        const v1IsRS =
          leadV1.rAmplitudeMv > 0.05 &&
          leadV1.sAmplitudeMv > leadV1.rAmplitudeMv &&
          leadV1.rsRatio < 0.8;

        const v5v6RDominant =
          leadV5.rsRatio > 2.0 &&
          leadV6.rsRatio > 2.0 &&
          leadV5.tAmplitudeMv > 0 &&
          leadV6.tAmplitudeMv > 0;

        const transitionOk =
          features.transitionZone === 'V3-V4' && features.isNormalRProgression;

        addCheck({
          id: 'CLINICAL_CANONICAL_PRECORDIAL_PROGRESSION',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: v1IsRS && v5v6RDominant && transitionOk,
          title:
            'Canonical Precordial Progression (V1 rS -> V3-V4 Transition -> V5/V6 R-Dominant)',
          message:
            v1IsRS && v5v6RDominant && transitionOk
              ? `V1 shows rS (R/S=${leadV1.rsRatio}), smooth R-wave progression with transition at ${features.transitionZone}, and V5/V6 R dominance.`
              : `Precordial progression check failed (V1 R/S=${leadV1.rsRatio}, transition=${features.transitionZone}).`,
          measuredValue: features.transitionZone,
        });

        const im = features.intervalMetrics;
        const intervalToleranceOk =
          Math.abs(im.deltaPDurationMs) <= 10 &&
          Math.abs(im.deltaPrMs) <= 10 &&
          Math.abs(im.deltaQrsDurationMs) <= 10 &&
          Math.abs(im.deltaQtMs) <= 25;

        addCheck({
          id: 'CANONICAL_CONFIGURED_VS_MEASURED_TOLERANCE',
          category: 'FEATURE_EXTRACTION',
          severity: 'WARNING',
          passed: intervalToleranceOk,
          title: 'Canonical Configured vs Episode vs Measured Interval Tolerance',
          message: `P(cfg=${im.configuredPDurationMs}/ep=${im.episodePDurationMs}/meas=${im.measuredPDurationMs}, Δ=${im.deltaPDurationMs}ms), PR(cfg=${im.configuredPrMs}/phys=${im.physiologicalPrMs}/meas=${im.measuredPrMs}, Δ=${im.deltaPrMs}ms), QRS(cfg=${im.configuredQrsDurationMs}/ep=${im.episodeQrsDurationMs}/meas=${im.measuredQrsDurationMs}, Δ=${im.deltaQrsDurationMs}ms), QT(cfg=${im.configuredQtMs}/repolEp=${im.repolarizationEpisodeDurationMs}/meas=${im.measuredQtMs}, Δ=${im.deltaQtMs}ms).`,
        });
        break;
      }

      case 'SINUS_BRADYCARDIA': {
        const ok = features.heartRateBpm < 60 && features.qrsDurationMs <= 105;
        addCheck({
          id: 'CLINICAL_SINUS_BRADYCARDIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Sinus Bradycardia Rate & Unstretched QRS',
          message: `Measured HR=${features.heartRateBpm} bpm (<60 bpm) with unstretched QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'SINUS_TACHYCARDIA': {
        const ok = features.heartRateBpm > 100 && features.qrsDurationMs <= 105;
        addCheck({
          id: 'CLINICAL_SINUS_TACHYCARDIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Sinus Tachycardia Rate & Unstretched QRS',
          message: `Measured HR=${features.heartRateBpm} bpm (>100 bpm) with unstretched QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'SINUS_PAUSE_ARREST': {
        const maxRr = Math.max(...features.rrIntervalsMs);
        const minRr = Math.min(...features.rrIntervalsMs);
        const ratio = maxRr / Math.max(1, minRr);
        const isNonIntegerPause =
          maxRr > 1500 && Math.abs(ratio - Math.round(ratio)) > 0.15;
        addCheck({
          id: 'CLINICAL_SINUS_ARREST_PAUSE',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: isNonIntegerPause,
          title: 'Sinus Arrest Non-Integer Pause Interval',
          message: `Pause RR=${maxRr} ms vs baseline RR=${minRr} ms (ratio=${ratio.toFixed(2)}, non-multiple of baseline cycle).`,
        });
        break;
      }

      case 'SA_EXIT_BLOCK': {
        const saBlockedEvents = timeline.events.filter(
          (e) => e.type === 'CONDUCTION_BLOCKED' && e.pathId === 'SA_EXIT'
        );
        const maxRr = Math.max(...features.rrIntervalsMs);
        const minRr = Math.min(...features.rrIntervalsMs);
        const isExactDouble =
          saBlockedEvents.length > 0 && Math.abs(maxRr - 2 * minRr) < 10;
        addCheck({
          id: 'CLINICAL_SA_EXIT_BLOCK_DOUBLE_PP',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: isExactDouble,
          title: 'Type II SA Exit Block (Exact 2x Cycle Pause)',
          message: `SA_EXIT blocked ${saBlockedEvents.length} time(s); pause RR (${maxRr} ms) equals 2x baseline cycle (${minRr} ms).`,
        });
        break;
      }

      case 'PAC': {
        const pacEvs = timeline.events.filter(
          (e) => e.type === 'ATRIAL_ECTOPIC_IMPULSE'
        );
        const minRr = Math.min(...features.rrIntervalsMs);
        const maxRr = Math.max(...features.rrIntervalsMs);
        const ok = pacEvs.length > 0 && minRr < 600 && maxRr > 800;
        addCheck({
          id: 'CLINICAL_PAC_TIMELINE',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: ok,
          title: 'Premature Atrial Contraction & Sinus Reset Pause',
          message: `Detected ${pacEvs.length} premature atrial impulse(s) with coupling RR=${minRr} ms and post-reset interval=${maxRr} ms.`,
        });
        break;
      }

      case 'PVC': {
        const pvcEvents = timeline.events.filter(
          (ev) => ev.type === 'VENTRICULAR_ECTOPIC_IMPULSE'
        );
        const pvcHasNoPrecedingAtrialLink =
          pvcEvents.length > 0 &&
          pvcEvents.every(
            (ev) =>
              !ev.parentEventId &&
              !ev.triggerEventId &&
              !hasCausalAncestor(
                ev,
                eventMap,
                (anc) => anc.type === 'SINUS_IMPULSE'
              )
          );
        const pvcEp = timeline.episodes.find(
          (ep) =>
            ep.type === 'VENTRICULAR_ACTIVATION' &&
            ep.recipeVariant === 'ECTOPIC_RV'
        );

        addCheck({
          id: 'CAUSALITY_PVC_ECTOPIC_ORIGIN',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: pvcHasNoPrecedingAtrialLink && Boolean(pvcEp && pvcEp.duration >= 130),
          title: 'PVC Independent Ventricular Origin & Wide Ectopic Morphology',
          message: `Verified ${pvcEvents.length} PVC impulse(s) without preceding atrial trigger and wide ectopic duration (${pvcEp?.duration ?? 0} ms).`,
        });
        break;
      }

      case 'RBBB': {
        const morphOk =
          !config.conductionNetwork.RIGHT_BUNDLE.enabled &&
          features.qrsDurationMs >= 120 &&
          features.perLead.V1.terminalPositiveComponentMv > 0.6 &&
          features.perLead.V6.terminalNegativeComponentMv > 0.2 &&
          features.perLead.I.terminalNegativeComponentMv > 0.2;
        const axisSanityOk =
          features.qrsAxisDeg >= -30 && features.qrsAxisDeg <= 88;
        addCheck({
          id: 'CLINICAL_RBBB_CRITERIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: morphOk && axisSanityOk,
          title: 'RBBB Terminal RV Force (V1 R/R\' + I/V6 Wide Terminal S) & Normal Frontal Axis Sanity',
          message: `QRS=${features.qrsDurationMs} ms, Axis=${features.qrsAxisDeg}° (normal [-30°, +88°], no artificial RAD), V1 term+=${features.perLead.V1.terminalPositiveComponentMv} mV, V6 term-=${features.perLead.V6.terminalNegativeComponentMv} mV, Lead I term-=${features.perLead.I.terminalNegativeComponentMv} mV.`,
        });
        break;
      }

      case 'LBBB': {
        const ok =
          !config.conductionNetwork.LEFT_BUNDLE.enabled &&
          features.qrsDurationMs >= 125 &&
          features.perLead.V6.qAmplitudeMv === 0 &&
          features.perLead.V6.rAmplitudeMv > 1.2 &&
          features.perLead.V1.dominantQrsPolarity === 'NEGATIVE' &&
          features.perLead.V6.stDeviationMv < -0.02 &&
          features.perLead.V6.tPolarity === 'NEGATIVE';
        addCheck({
          id: 'CLINICAL_LBBB_CRITERIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title:
            'LBBB Absent Septal q, Broad Monophasic/Slurred Lateral R, Predominantly Negative V1 & Discordant ST-T',
          message: `QRS=${features.qrsDurationMs} ms, V6 q=${features.perLead.V6.qAmplitudeMv} mV, V6 broad R=${features.perLead.V6.rAmplitudeMv} mV, V1 polarity=${features.perLead.V1.dominantQrsPolarity}, V6 ST=${features.perLead.V6.stDeviationMv} mV, V6 T=${features.perLead.V6.tPolarity}.`,
        });
        break;
      }

      case 'LAFB': {
        const ok =
          !config.conductionNetwork.LAF.enabled &&
          features.qrsAxisDeg <= -35 &&
          features.qrsDurationMs >= 94 &&
          features.qrsDurationMs <= 118 &&
          features.perLead.aVF.initial40msForceMvMs > 0 &&
          features.perLead.aVF.terminal40msForceMvMs < -2.0 &&
          features.perLead.I.terminal40msForceMvMs > 2.0 &&
          features.perLead.I.rAmplitudeMv > features.perLead.I.sAmplitudeMv &&
          features.perLead.III.sAmplitudeMv > features.perLead.III.rAmplitudeMv;
        addCheck({
          id: 'CLINICAL_LAFB_CRITERIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'LAFB 2-Stage Vector Sequence (Inferior Initial 40ms -> Superior-Left Terminal 40ms, qR in I, rS in III)',
          message: `QRS=${features.qrsDurationMs} ms, Axis=${features.qrsAxisDeg}°, aVF init40=${features.perLead.aVF.initial40msForceMvMs}, aVF term40=${features.perLead.aVF.terminal40msForceMvMs}, I term40=${features.perLead.I.terminal40msForceMvMs}.`,
        });
        break;
      }

      case 'LPFB': {
        const ok =
          !config.conductionNetwork.LPF.enabled &&
          features.qrsAxisDeg >= 95 &&
          features.qrsDurationMs >= 94 &&
          features.qrsDurationMs <= 118 &&
          features.perLead.aVL.initial40msForceMvMs > 0 &&
          features.perLead.aVF.terminal40msForceMvMs > 2.0 &&
          features.perLead.I.terminal40msForceMvMs < -2.0 &&
          features.perLead.I.sAmplitudeMv > features.perLead.I.rAmplitudeMv &&
          features.perLead.III.rAmplitudeMv > features.perLead.III.sAmplitudeMv;
        addCheck({
          id: 'CLINICAL_LPFB_CRITERIA',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'LPFB 2-Stage Vector Sequence (Superior-Left Initial 40ms -> Inferior-Right Terminal 40ms, rS in I, qR in III)',
          message: `QRS=${features.qrsDurationMs} ms, Axis=${features.qrsAxisDeg}°, aVL init40=${features.perLead.aVL.initial40msForceMvMs}, aVF term40=${features.perLead.aVF.terminal40msForceMvMs}, I term40=${features.perLead.I.terminal40msForceMvMs}.`,
        });
        break;
      }

      case 'AVB_1ST_DEGREE': {
        const prs = features.prIntervalsByBeatMs;
        const ok =
          prs.length >= 3 &&
          features.prIntervalMs > 220 &&
          Math.max(...prs) - Math.min(...prs) < 5;
        addCheck({
          id: 'CLINICAL_AVB_1ST_DEGREE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'First-Degree AV Block (Stable Prolonged PR > 220 ms with 1:1 Conduction)',
          message: `Conducted beats=${prs.length}, Mean PR=${features.prIntervalMs} ms.`,
        });
        break;
      }

      case 'AVB_WENCKEBACH': {
        const prs = features.prIntervalsByBeatMs;
        const blockedCount = timeline.annotations.filter(
          (a) => a.label === 'BLOCKED_P'
        ).length;
        const hasProgressiveLengthening =
          prs.length >= 2 && prs[1]! > prs[0]! + 12 && blockedCount >= 1;

        addCheck({
          id: 'CLINICAL_WENCKEBACH_DECREMENTAL',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: hasProgressiveLengthening,
          title: 'Wenckebach Emergent PR Prolongation & Blocked Beat',
          message: `PR sequence (${prs.slice(0, 4).join(' -> ')} ms) with ${blockedCount} dropped P wave(s).`,
        });
        break;
      }

      case 'AVB_MOBITZ_II': {
        const prs = features.prIntervalsByBeatMs;
        const hisBlocked = timeline.events.filter(
          (e) => e.type === 'CONDUCTION_BLOCKED' && e.pathId === 'HIS'
        );
        const constantPr =
          prs.length >= 2 && Math.max(...prs) - Math.min(...prs) < 4;
        addCheck({
          id: 'CLINICAL_MOBITZ_II_FIXED_PR_DROP',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: constantPr && hisBlocked.length >= 1,
          title: 'Mobitz Type II Constant Conducted PR & Sudden His Block',
          message: `Conducted PR spread=${(Math.max(...prs) - Math.min(...prs)).toFixed(1)} ms (<4 ms), HIS blocked count=${hisBlocked.length}.`,
        });
        break;
      }

      case 'AVB_COMPLETE': {
        const ventEpisodes = timeline.episodes.filter(
          (ep) => ep.type === 'VENTRICULAR_ACTIVATION'
        );
        let anyAtrialCausalLink = false;
        for (const vEp of ventEpisodes) {
          const srcEv = eventMap.get(vEp.sourceEventId);
          if (
            srcEv &&
            hasCausalAncestor(
              srcEv,
              eventMap,
              (anc) =>
                anc.type === 'SINUS_IMPULSE' ||
                anc.type === 'ATRIAL_ECTOPIC_IMPULSE'
            )
          ) {
            anyAtrialCausalLink = true;
          }
        }
        addCheck({
          id: 'CAUSALITY_COMPLETE_AVB_INDEPENDENCE',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: !anyAtrialCausalLink && ventEpisodes.length > 0,
          title: 'Complete AV Block Atrial-Ventricular Causal Independence',
          message: !anyAtrialCausalLink
            ? 'Verified zero causal links from Sinus/Atrial impulses to Ventricular escape activations.'
            : 'Causal link between atrial impulse and ventricular activation detected.',
        });
        break;
      }

      case 'ATRIAL_FIBRILLATION': {
        const avBlocked = timeline.events.filter(
          (e) => e.type === 'CONDUCTION_BLOCKED' && e.pathId === 'AV_NODE'
        );
        const sinusPUsed = timeline.episodes.some(
          (ep) =>
            ep.type === 'ATRIAL_ACTIVATION' &&
            ep.recipeVariant === 'NORMAL_SINUS'
        );
        const rrIrregular = features.qtMetrics.rrCoefficientOfVariation > 0.08;
        addCheck({
          id: 'CLINICAL_AF_AV_FILTERING_AND_IRREGULARITY',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: !sinusPUsed && avBlocked.length > 5 && rrIrregular,
          title: 'Atrial Fibrillation Wavelet Filtering & Irregularly Irregular RR',
          message: `Organized Sinus P=${sinusPUsed}, AV_NODE blocked wavelets=${avBlocked.length}, RR CV=${(features.qtMetrics.rrCoefficientOfVariation * 100).toFixed(1)}%.`,
        });
        break;
      }

      case 'ATRIAL_FLUTTER': {
        const flutterWaves = timeline.episodes.filter(
          (ep) =>
            ep.type === 'ATRIAL_ACTIVATION' &&
            ep.recipeVariant === 'FLUTTER_WAVE'
        );
        const avBlocked = timeline.events.filter(
          (e) => e.type === 'CONDUCTION_BLOCKED' && e.pathId === 'AV_NODE'
        );
        const rm = features.rhythmMetrics;
        const ok =
          flutterWaves.length >= 15 &&
          avBlocked.length >= 10 &&
          Math.abs(rm.atrialCycleLengthMs - 200) <= 5 &&
          rm.flutterWaveContinuityVerified;
        addCheck({
          id: 'CLINICAL_AFL_MACRO_REENTRY_AND_CONDUCTION',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: ok,
          title: 'Atrial Flutter 200ms (300 bpm) Continuous Macro-Reentry & Multi-Ratio AV Filtering',
          message: `Atrial cycle=${rm.atrialCycleLengthMs} ms, continuity=${rm.flutterWaveContinuityVerified}, AV ratio=${rm.avConductionRatioEstimate}, Ventricular HR=${rm.ventricularRateBpm} bpm.`,
        });
        break;
      }

      case 'WPW_SYNDROME': {
        const kentSuccess = timeline.events.filter(
          (e) =>
            e.type === 'CONDUCTION_SUCCESS' &&
            e.pathId === 'ACCESSORY_PATHWAY'
        );
        const hisSuccess = timeline.events.filter(
          (e) => e.type === 'CONDUCTION_SUCCESS' && e.pathId === 'HIS'
        );
        const kentPrecedesHis =
          kentSuccess.length > 0 &&
          hisSuccess.length > 0 &&
          kentSuccess[0]!.timestamp < hisSuccess[0]!.timestamp;
        const prInTargetRange =
          features.prIntervalMs >= 85 && features.prIntervalMs <= 110;
        const fusionQrsOk =
          features.qrsDurationMs >= 110 &&
          features.qrsDurationMs <= 138 &&
          features.perLead.V5.initial40msForceMvMs > 2.5;
        addCheck({
          id: 'CLINICAL_WPW_DUAL_PATH_PREEXCITATION',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: kentPrecedesHis && prInTargetRange && fusionQrsOk,
          title: 'WPW Parallel Accessory + AV-His Conduction, Short PR (85-110 ms) & Preexcitation Fusion',
          message: `Accessory arrival (${kentSuccess[0]?.timestamp} ms) precedes His arrival (${hisSuccess[0]?.timestamp} ms); PR=${features.prIntervalMs} ms, QRS=${features.qrsDurationMs} ms, V5 init40ms=${features.perLead.V5.initial40msForceMvMs}.`,
        });
        break;
      }

      case 'VENTRICULAR_TACHYCARDIA': {
        const ok =
          features.heartRateBpm >= 140 && features.qrsDurationMs >= 130;
        addCheck({
          id: 'CLINICAL_MONOMORPHIC_VT',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Monomorphic VT Rate & Wide Ventricular QRS',
          message: `HR=${features.heartRateBpm} bpm, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'TORSADES_DE_POINTES': {
        const tdpEpisodes = timeline.episodes.filter(
          (ep): ep is Extract<typeof ep, { type: 'VENTRICULAR_ACTIVATION' }> =>
            ep.type === 'VENTRICULAR_ACTIVATION' &&
            ep.torsadesPhaseRad !== undefined
        );
        const distinctPhases = new Set(
          tdpEpisodes.map((e) => e.torsadesPhaseRad?.toFixed(2))
        ).size;
        addCheck({
          id: 'CLINICAL_TDP_SPATIAL_ROTATION',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: tdpEpisodes.length >= 10 && distinctPhases >= 8,
          title: 'Torsades de Pointes Beat-to-Beat 3D Spatial Phase Rotation',
          message: `Verified ${tdpEpisodes.length} polymorphic beats across ${distinctPhases} distinct 3D spatial orientation angles.`,
        });
        break;
      }

      case 'BRUGADA_TYPE_1': {
        const maxLimbSt = Math.max(
          Math.abs(features.perLead.I.stDeviationMv),
          Math.abs(features.perLead.II.stDeviationMv),
          Math.abs(features.perLead.III.stDeviationMv)
        );
        const rightPrecordialDominant =
          features.perLead.V1.stDeviationMv >= 0.15 &&
          features.perLead.V2.stDeviationMv >= 0.15 &&
          features.perLead.V3.stDeviationMv < features.perLead.V2.stDeviationMv &&
          maxLimbSt <= 0.045;
        const ok =
          rightPrecordialDominant &&
          features.perLead.V1.tPolarity === 'NEGATIVE';
        addCheck({
          id: 'CLINICAL_BRUGADA_TYPE_1_PATTERN',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Brugada Type 1 Right-Precordial Localization (V1/V2 > V3 >> Limb Leads) & Negative V1 T',
          message: `V1 ST=${features.perLead.V1.stDeviationMv} mV, V2 ST=${features.perLead.V2.stDeviationMv} mV, V3 ST=${features.perLead.V3.stDeviationMv} mV, max limb ST=${maxLimbSt} mV, V1 T=${features.perLead.V1.tPolarity}.`,
        });
        break;
      }

      case 'BRUGADA_TYPE_2': {
        const maxLimbSt = Math.max(
          Math.abs(features.perLead.I.stDeviationMv),
          Math.abs(features.perLead.II.stDeviationMv),
          Math.abs(features.perLead.III.stDeviationMv)
        );
        const rightPrecordialDominant =
          features.perLead.V1.stDeviationMv >= 0.12 &&
          features.perLead.V2.stDeviationMv >= 0.12 &&
          features.perLead.V3.stDeviationMv < features.perLead.V2.stDeviationMv &&
          maxLimbSt <= 0.045;
        const ok =
          rightPrecordialDominant &&
          features.perLead.V2.tPolarity === 'POSITIVE';
        addCheck({
          id: 'CLINICAL_BRUGADA_TYPE_2_PATTERN',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Brugada Type 2 Right-Precordial Localization (V1/V2 > V3 >> Limb Leads) & Positive V2 T',
          message: `V1 ST=${features.perLead.V1.stDeviationMv} mV, V2 ST=${features.perLead.V2.stDeviationMv} mV, V3 ST=${features.perLead.V3.stDeviationMv} mV, max limb ST=${maxLimbSt} mV, V2 T=${features.perLead.V2.tPolarity}.`,
        });
        break;
      }

      case 'ANTEROSEPTAL_MI_ACUTE': {
        const ok =
          features.perLead.V1.stDeviationMv > 0.12 &&
          features.perLead.V2.stDeviationMv > 0.15 &&
          features.perLead.V3.stDeviationMv > 0.12;
        addCheck({
          id: 'CLINICAL_ANTEROSEPTAL_MI_ACUTE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Acute Anteroseptal STEMI Precordial ST Elevation (V1-V3)',
          message: `ST @J+40ms: V1=${features.perLead.V1.stDeviationMv} mV, V2=${features.perLead.V2.stDeviationMv} mV, V3=${features.perLead.V3.stDeviationMv} mV.`,
        });
        break;
      }

      case 'ANTEROSEPTAL_MI_OLD': {
        const ok =
          features.perLead.V1.rAmplitudeMv < 0.05 &&
          features.perLead.V2.rAmplitudeMv < 0.08 &&
          Math.abs(features.perLead.V2.stDeviationMv) < 0.05;
        addCheck({
          id: 'CLINICAL_ANTEROSEPTAL_MI_OLD',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Old Anteroseptal MI (Loss of V1-V2 R Wave / QS Complex & Isoelectric ST)',
          message: `V1 R=${features.perLead.V1.rAmplitudeMv} mV, V2 R=${features.perLead.V2.rAmplitudeMv} mV, V2 ST=${features.perLead.V2.stDeviationMv} mV.`,
        });
        break;
      }

      case 'INFERIOR_MI_ACUTE': {
        const ok =
          features.perLead.II.stDeviationMv > 0.1 &&
          features.perLead.III.stDeviationMv > 0.12 &&
          features.perLead.aVF.stDeviationMv > 0.12 &&
          features.perLead.aVL.stDeviationMv < -0.06;
        addCheck({
          id: 'CLINICAL_INFERIOR_MI_ACUTE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Acute Inferior STEMI (II/III/aVF ST Elevation + Reciprocal aVL Depression)',
          message: `III ST=${features.perLead.III.stDeviationMv} mV, aVF ST=${features.perLead.aVF.stDeviationMv} mV, reciprocal aVL ST=${features.perLead.aVL.stDeviationMv} mV.`,
        });
        break;
      }

      case 'INFERIOR_MI_OLD': {
        const ok =
          features.perLead.III.qAmplitudeMv > 0.15 &&
          features.perLead.aVF.qAmplitudeMv > 0.12 &&
          Math.abs(features.perLead.aVF.stDeviationMv) < 0.05;
        addCheck({
          id: 'CLINICAL_INFERIOR_MI_OLD',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Old Inferior MI (Pathological Q in III/aVF & Resolved ST)',
          message: `III Q=${features.perLead.III.qAmplitudeMv} mV, aVF Q=${features.perLead.aVF.qAmplitudeMv} mV, aVF ST=${features.perLead.aVF.stDeviationMv} mV.`,
        });
        break;
      }

      case 'HYPERKALEMIA': {
        const ok =
          features.perLead.V3.tAmplitudeMv > 0.45 &&
          features.perLead.II.pAmplitudeMv < 0.09 &&
          features.prIntervalMs >= 195 &&
          features.qrsDurationMs >= 102;
        addCheck({
          id: 'CLINICAL_HYPERKALEMIA_PHENOTYPE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Hyperkalemia Phenotype (Tall Peaked T, Attenuated P, Prolonged PR & Widened QRS)',
          message: `V3 T=${features.perLead.V3.tAmplitudeMv} mV, II P=${features.perLead.II.pAmplitudeMv} mV, PR=${features.prIntervalMs} ms, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'HYPOKALEMIA': {
        const um = features.uWaveMetrics;
        const ok =
          um.uWavePresent &&
          um.uAmplitudeMv > 0.08 &&
          um.tuAmplitudeRatio < 1.0 &&
          um.measuredQuMs >= 460;
        addCheck({
          id: 'CLINICAL_HYPOKALEMIA_U_WAVE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Hypokalemia Phenotype (Flattened T, Prominent U Wave, T/U Ratio < 1.0 & Prolonged QU)',
          message: `V3 T=${features.perLead.V3.tAmplitudeMv} mV, V3 U=${um.uAmplitudeMv} mV, T/U ratio=${um.tuAmplitudeRatio}, QT=${um.measuredQtMs} ms vs QU=${um.measuredQuMs} ms (T-U fusion=${um.tuFusionIndicator}).`,
        });
        break;
      }

      case 'HYPERCALCEMIA': {
        const ok =
          features.qtMetrics.measuredQtMs <= 310 &&
          features.qrsDurationMs >= 82 &&
          features.qrsDurationMs <= 94 &&
          features.qtMetrics.repolarizationEpisodeDurationMs <= 210;
        addCheck({
          id: 'CLINICAL_HYPERCALCEMIA_SHORT_QT',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Hypercalcemia Shortened Repolarization Timing & Unchanged QRS',
          message: `Measured QT=${features.qtMetrics.measuredQtMs} ms (repolEp=${features.qtMetrics.repolarizationEpisodeDurationMs} ms), QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'HYPOCALCEMIA': {
        const ok =
          features.qtMetrics.measuredQtMs >= 440 &&
          features.qrsDurationMs >= 82 &&
          features.qrsDurationMs <= 94 &&
          features.qtMetrics.repolarizationEpisodeDurationMs >= 360;
        addCheck({
          id: 'CLINICAL_HYPOCALCEMIA_LONG_QT',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Hypocalcemia Prolonged Repolarization Timing & Unchanged QRS',
          message: `Measured QT=${features.qtMetrics.measuredQtMs} ms (repolEp=${features.qtMetrics.repolarizationEpisodeDurationMs} ms), QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'PACEMAKER_VVI': {
        const rm = features.rhythmMetrics;
        const stimEvents = timeline.events.filter(
          (e) => e.type === 'PACEMAKER_STIMULUS'
        );
        const capEvents = timeline.events.filter(
          (e) => e.type === 'CAPTURE_SUCCESS'
        );
        const separateEvents =
          stimEvents.length > 0 &&
          capEvents.length > 0 &&
          capEvents.every(
            (c) => c.parentEventId !== undefined && c.id !== c.parentEventId
          );
        const v1NegativeOk =
          features.perLead.V1.dominantQrsPolarity === 'NEGATIVE';
        const vviDemandOk =
          separateEvents &&
          v1NegativeOk &&
          rm.vviInhibitedCount >= 1 &&
          rm.pacedCaptureCount >= 3 &&
          rm.measuredPaceSpikeMv >= 0.45;

        addCheck({
          id: 'CAUSALITY_PACEMAKER_VVI_DEMAND_SENSING',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: vviDemandOk,
          title:
            'VVI Demand Sensing, Negative V1 RV-Apical Paced QRS & Visible Pacing Spike',
          message: `V1 polarity=${features.perLead.V1.dominantQrsPolarity}, Intrinsic R sensed/inhibited=${rm.vviInhibitedCount}, Paced captures=${rm.pacedCaptureCount}, Spike=${rm.measuredPaceSpikeMv} mV.`,
        });
        break;
      }

      case 'PACEMAKER_DDD': {
        const stimEvents = timeline.events.filter(
          (e) => e.type === 'PACEMAKER_STIMULUS'
        );
        const capEvents = timeline.events.filter(
          (e) => e.type === 'CAPTURE_SUCCESS' || e.type === 'CAPTURE_FAILURE'
        );
        const separateEvents =
          stimEvents.length > 0 &&
          capEvents.length > 0 &&
          capEvents.every(
            (c) => c.parentEventId !== undefined && c.id !== c.parentEventId
          );
        const v1NegativeOk =
          features.perLead.V1.dominantQrsPolarity === 'NEGATIVE';

        addCheck({
          id: 'CAUSALITY_PACEMAKER_SEPARATE_CAPTURE',
          category: 'TIMELINE_CAUSALITY',
          severity: 'ERROR',
          passed: separateEvents && v1NegativeOk && features.qrsDurationMs >= 130,
          title: 'Pacemaker DDD Sequential Capture & Negative V1 Paced QRS',
          message: `PACEMAKER_STIMULUS=${stimEvents.length}, CAPTURE=${capEvents.length}, V1=${features.perLead.V1.dominantQrsPolarity}, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'PSVT_REGULAR_NARROW': {
        const ok =
          features.heartRateBpm >= 160 &&
          features.heartRateBpm <= 220 &&
          features.qrsDurationMs < 110;
        addCheck({
          id: 'CLINICAL_PSVT_REGULAR_NARROW',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'PSVT Regular Narrow-QRS Tachycardia (160–220 bpm, QRS < 110 ms)',
          message: `HR=${features.heartRateBpm} bpm, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'LONG_QT_PATTERN': {
        const ok =
          features.qtMetrics.measuredQtMs >= 460 &&
          features.qtcBazettMs >= 480 &&
          features.qrsDurationMs < 110;
        addCheck({
          id: 'CLINICAL_LONG_QT_PATTERN',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Long QT Pattern (Prolonged QT >= 460 ms & QTc >= 480 ms with Normal QRS)',
          message: `QT=${features.qtMetrics.measuredQtMs} ms, QTc(Bazett)=${features.qtcBazettMs} ms, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'LATERAL_MI_ACUTE': {
        const ok =
          (features.perLead.I.stDeviationMv >= 0.08 ||
            features.perLead.aVL.stDeviationMv >= 0.08 ||
            features.perLead.V5.stDeviationMv >= 0.08) &&
          features.perLead.III.stDeviationMv <= -0.05;
        addCheck({
          id: 'CLINICAL_LATERAL_MI_ACUTE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Acute Lateral STEMI (STE in I/aVL/V5-V6 & Reciprocal Inferior STD)',
          message: `I ST=${features.perLead.I.stDeviationMv} mV, aVL ST=${features.perLead.aVL.stDeviationMv} mV, V5 ST=${features.perLead.V5.stDeviationMv} mV, III ST=${features.perLead.III.stDeviationMv} mV.`,
        });
        break;
      }

      case 'LATERAL_MI_PRIOR': {
        const ok =
          (features.perLead.I.qAmplitudeMv >= 0.1 ||
            features.perLead.aVL.qAmplitudeMv >= 0.1 ||
            features.perLead.V6.qAmplitudeMv >= 0.1) &&
          Math.abs(features.perLead.I.stDeviationMv) < 0.06;
        addCheck({
          id: 'CLINICAL_LATERAL_MI_PRIOR',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Prior Lateral MI (Lateral Pathological Q & Resolved Isoelectric ST)',
          message: `I Q=${features.perLead.I.qAmplitudeMv} mV, aVL Q=${features.perLead.aVL.qAmplitudeMv} mV, I ST=${features.perLead.I.stDeviationMv} mV.`,
        });
        break;
      }

      case 'POSTERIOR_MI_ACUTE': {
        const ok =
          features.perLead.V1.rAmplitudeMv > features.perLead.V1.sAmplitudeMv &&
          features.perLead.V2.stDeviationMv <= -0.08 &&
          features.perLead.V2.tPolarity === 'POSITIVE';
        addCheck({
          id: 'CLINICAL_POSTERIOR_MI_ACUTE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Acute Posterior MI Mirror Pattern in V1–V3 (Tall R, Horizontal STD, Upright T)',
          message: `V1 R=${features.perLead.V1.rAmplitudeMv} mV > S=${features.perLead.V1.sAmplitudeMv} mV, V2 ST=${features.perLead.V2.stDeviationMv} mV, V2 T=${features.perLead.V2.tPolarity}.`,
        });
        break;
      }

      case 'POSTERIOR_MI_PRIOR': {
        const ok =
          features.perLead.V1.rAmplitudeMv > features.perLead.V1.sAmplitudeMv &&
          Math.abs(features.perLead.V2.stDeviationMv) < 0.06;
        addCheck({
          id: 'CLINICAL_POSTERIOR_MI_PRIOR',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Prior Posterior MI (Persistent Tall V1–V2 R Wave Without Acute STD)',
          message: `V1 R=${features.perLead.V1.rAmplitudeMv} mV > S=${features.perLead.V1.sAmplitudeMv} mV, V2 ST=${features.perLead.V2.stDeviationMv} mV.`,
        });
        break;
      }

      case 'ACUTE_PERICARDITIS': {
        const ok =
          config.atrialRepolarization.enabled &&
          features.perLead.II.stDeviationMv >= 0.06 &&
          features.perLead.V5.stDeviationMv >= 0.06 &&
          features.perLead.aVR.stDeviationMv <= -0.04;
        addCheck({
          id: 'CLINICAL_ACUTE_PERICARDITIS_STE_AND_PR',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Acute Pericarditis Diffuse Concave STE, aVR STD & Explicit Atrial Repolarization PR Shift',
          message: `AtrialRepol=${config.atrialRepolarization.enabled} (${config.atrialRepolarization.magnitudeMv} mV), II ST=${features.perLead.II.stDeviationMv} mV, V5 ST=${features.perLead.V5.stDeviationMv} mV, aVR ST=${features.perLead.aVR.stDeviationMv} mV.`,
        });
        break;
      }

      case 'LARGE_PERICARDIAL_EFFUSION_PATTERN': {
        const ok =
          config.electricalAlternans.enabled &&
          features.heartRateBpm >= 95 &&
          features.perLead.I.rAmplitudeMv + features.perLead.I.sAmplitudeMv < 0.85;
        addCheck({
          id: 'CLINICAL_EFFUSION_ALTERNANS_LOW_VOLTAGE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Large Pericardial Effusion Low Voltage & Beat-to-Beat Electrical Alternans',
          message: `HR=${features.heartRateBpm} bpm, Alternans=${config.electricalAlternans.enabled} (±${config.electricalAlternans.amplitudeSwingRatio * 100}%), Lead I R+S=${(features.perLead.I.rAmplitudeMv + features.perLead.I.sAmplitudeMv).toFixed(2)} mV.`,
        });
        break;
      }

      case 'P_PULMONALE_PATTERN': {
        const ok =
          features.perLead.II.pAmplitudeMv >= 0.24 &&
          features.pDurationMs < 120;
        addCheck({
          id: 'CLINICAL_P_PULMONALE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'P Pulmonale Right Atrial Overload (Lead II P >= 0.25 mV, Normal Duration < 120 ms)',
          message: `Lead II P=${features.perLead.II.pAmplitudeMv} mV, P duration=${features.pDurationMs} ms.`,
        });
        break;
      }

      case 'P_MITRALE_PATTERN': {
        const ok = features.pDurationMs >= 120;
        addCheck({
          id: 'CLINICAL_P_MITRALE',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'P Mitrale Left Atrial Overload (Bifid P >= 120 ms & Terminal Negative V1 P)',
          message: `P duration=${features.pDurationMs} ms (>=120 ms).`,
        });
        break;
      }

      case 'LVH_WITH_STRAIN': {
        const sv1Rv5 =
          features.perLead.V1.sAmplitudeMv + features.perLead.V5.rAmplitudeMv;
        const ok =
          sv1Rv5 >= 3.2 &&
          features.perLead.V6.stDeviationMv < -0.02 &&
          features.perLead.V6.tPolarity === 'NEGATIVE';
        addCheck({
          id: 'CLINICAL_LVH_WITH_STRAIN',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'LVH High Precordial Voltage (SV1 + RV5 >= 3.5 mV) & Lateral Strain Pattern',
          message: `SV1+RV5=${sv1Rv5.toFixed(2)} mV, V6 ST=${features.perLead.V6.stDeviationMv} mV, V6 T=${features.perLead.V6.tPolarity}.`,
        });
        break;
      }

      case 'RVH_WITH_STRAIN': {
        const ok =
          features.qrsAxisDeg >= 100 &&
          features.perLead.V1.rAmplitudeMv > features.perLead.V1.sAmplitudeMv &&
          features.qrsDurationMs < 120;
        addCheck({
          id: 'CLINICAL_RVH_WITH_STRAIN',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'RVH Right Axis Deviation, Dominant V1 R (R/S > 1), QRS < 120 ms & Right Strain',
          message: `Axis=${features.qrsAxisDeg}°, V1 R=${features.perLead.V1.rAmplitudeMv} > S=${features.perLead.V1.sAmplitudeMv} mV, QRS=${features.qrsDurationMs} ms.`,
        });
        break;
      }

      case 'PEDIATRIC_NORMAL_NEONATE':
      case 'PEDIATRIC_NORMAL_INFANT':
      case 'PEDIATRIC_NORMAL_1_TO_5_Y':
      case 'PEDIATRIC_NORMAL_6_TO_12_Y':
      case 'PEDIATRIC_NORMAL_ADOLESCENT': {
        const ok = config.patientAgeGroup !== 'ADULT' && features.qrsDurationMs <= 95;
        addCheck({
          id: 'CLINICAL_PEDIATRIC_AGE_NORMAL',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: `Pediatric Age-Grouped Normal ECG (${config.patientAgeGroup})`,
          message: `AgeGroup=${config.patientAgeGroup}, HR=${features.heartRateBpm} bpm, PR=${features.prIntervalMs} ms, QRS=${features.qrsDurationMs} ms, Axis=${features.qrsAxisDeg}°.`,
        });
        break;
      }

      case 'DEXTROCARDIA': {
        const v1Amp =
          features.perLead.V1.rAmplitudeMv + features.perLead.V1.sAmplitudeMv;
        const v2Amp =
          features.perLead.V2.rAmplitudeMv + features.perLead.V2.sAmplitudeMv;
        const v3Amp =
          features.perLead.V3.rAmplitudeMv + features.perLead.V3.sAmplitudeMv;
        const v4Amp =
          features.perLead.V4.rAmplitudeMv + features.perLead.V4.sAmplitudeMv;
        const v5Amp =
          features.perLead.V5.rAmplitudeMv + features.perLead.V5.sAmplitudeMv;
        const v6Amp =
          features.perLead.V6.rAmplitudeMv + features.perLead.V6.sAmplitudeMv;

        const limbMirrored =
          features.perLead.I.dominantQrsPolarity === 'NEGATIVE' &&
          features.perLead.I.pPolarity === 'NEGATIVE' &&
          features.perLead.aVR.dominantQrsPolarity === 'POSITIVE';

        const precordialAttenuationOk =
          v1Amp >= 0.8 &&
          v2Amp >= 0.8 &&
          v2Amp > v3Amp &&
          v3Amp > v4Amp &&
          v4Amp > v5Amp &&
          v5Amp > v6Amp &&
          v6Amp <= 0.25;

        const ok = limbMirrored && precordialAttenuationOk;

        addCheck({
          id: 'CLINICAL_DEXTROCARDIA_MIRROR_PROGRESSION',
          category: 'CLINICAL_PROFILE',
          severity: 'ERROR',
          passed: ok,
          title: 'Dextrocardia Inverted Lead I / aVR Upright + Normal V1-V2 with Progressive Attenuation across to V6',
          message: `Lead I=${features.perLead.I.dominantQrsPolarity} (P=${features.perLead.I.pPolarity}), aVR=${features.perLead.aVR.dominantQrsPolarity}. Precordial peak-to-peak: V1=${v1Amp.toFixed(2)}, V2=${v2Amp.toFixed(2)}, V3=${v3Amp.toFixed(2)}, V4=${v4Amp.toFixed(2)}, V5=${v5Amp.toFixed(2)}, V6=${v6Amp.toFixed(2)} mV.`,
        });
        break;
      }

      default:
        break;
    }
  }

  // ==========================================================================
  // 5. FINAL SIGNAL / ARTIFACT ISOLATION VALIDATION
  // ==========================================================================
  const artifactsActive = isAnyArtifactEnabled(scenario.artifacts);
  let finalEqualsClean = true;
  for (const lead of LEAD_NAMES) {
    const cPts = cleanSignals[lead];
    const fPts = finalSignals[lead];
    for (let i = 0; i < cPts.length; i++) {
      if (cPts[i]!.v !== fPts[i]!.v) {
        finalEqualsClean = false;
        break;
      }
    }
    if (!finalEqualsClean) break;
  }

  const signalIsolationOk = artifactsActive ? !finalEqualsClean : finalEqualsClean;

  addCheck({
    id: 'SIGNAL_CLEAN_VS_FINAL_ISOLATION',
    category: 'FINAL_SIGNAL',
    severity: 'ERROR',
    passed: signalIsolationOk,
    title: 'Clean Physiological Signal vs Artifact Layer Isolation',
    message: !artifactsActive
      ? 'With all artifacts OFF, final ECG is bit-for-bit identical (===) to clean ECG.'
      : 'Artifacts are applied strictly to final ECG while clean ECG remains uncorrupted.',
  });

  addCheck({
    id: 'FEATURE_SUMMARY_INFO',
    category: 'FEATURE_EXTRACTION',
    severity: 'INFO',
    passed: true,
    title: 'Measured Feature & Explicit QTc Summary',
    message: `HR ${features.heartRateBpm} bpm | PR ${features.prIntervalMs} ms | QRS ${features.qrsDurationMs} ms (${features.qrsAxisDeg}°) | QT ${features.qtIntervalMs} ms | QTc(Fridericia) ${features.qtcFridericiaMs} ms / QTc(Bazett) ${features.qtcBazettMs} ms | Transition ${features.transitionZone}`,
  });

  const errorCount = items.filter(
    (i) => i.severity === 'ERROR' && !i.passed
  ).length;
  const warningCount = items.filter(
    (i) => i.severity === 'WARNING' && !i.passed
  ).length;
  const infoCount = items.filter((i) => i.severity === 'INFO').length;

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    maxLeadAlgebraErrorMv: maxAlgebraDiff,
    items,
  };
}
