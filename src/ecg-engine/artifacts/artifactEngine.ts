/**
 * Biophysical & Electrode-Level Artifact Engine (Strictly Separated from Clean Physiological ECG)
 *
 * Supports:
 * 1. Baseline Drift (`DRIFT_NONE` | `DRIFT_SMALL` ~0.20 mV | `DRIFT_LARGE` ~0.40 mV)
 * 2. EMG High-Frequency Muscle Tremor Noise (`NONE` | `SMALL` | `LARGE`) with Electrode Targeting:
 *    - `ALL`: Global across all electrodes
 *    - `RA`, `LA`, `LL`: Injected at the exploring electrode potential layer BEFORE WCT & LeadDerivation,
 *      so limb leads, augmented leads, and V1-V6 (via WCT = (RA+LA+LL)/3) reflect exact Einthoven/Goldberger/Wilson algebra!
 *    - `RL`: Modeled explicitly as `REFERENCE_CONTACT_ARTIFACT` (Driven-Right-Leg / reference ground contact degradation
 *      causing common-mode rejection degradation across all leads; explicitly documented as an educational approximation).
 * 3. AC Mains Hum (`NONE` | `SMALL` | `LARGE`, `50 Hz` | `60 Hz`) with the same `ALL | RA | LA | LL | RL` targeting.
 *
 * Hard invariant:
 * When all artifacts are OFF, `final` ECG points are strictly equal (`===`) in value to `clean` ECG.
 */

import { RandomSource } from '../core/random';
import {
  ElectrodePotentials,
  LEAD_NAMES,
  LeadName,
  TwelveLeadSignals,
} from '../core/types';
import { deriveInstantaneousLeads } from '../leads/leadDerivation';
import {
  ArtifactConfig,
  ArtifactTarget,
  normalizeArtifactConfig,
} from '../scenario/types';

export type ArtifactScope =
  | 'GLOBAL'
  | 'ELECTRODE_POTENTIAL_LAYER'
  | 'REFERENCE_CONTACT_ARTIFACT';

export function describeArtifactTargetMechanism(target: ArtifactTarget): {
  scope: ArtifactScope;
  affectedLeadsSummary: string;
  mechanismNote: string;
} {
  switch (target) {
    case 'RA':
      return {
        scope: 'ELECTRODE_POTENTIAL_LAYER',
        affectedLeadsSummary:
          'Strong in I (-1.0x), II (-1.0x), aVR (+1.0x = 1.5x VR); moderate in aVL, aVF (-0.5x) & V1–V6 (-0.33x via WCT); spared in III (0x)',
        mechanismNote:
          'Injected into RA electrode potential before WCT & LeadDerivation.',
      };
    case 'LA':
      return {
        scope: 'ELECTRODE_POTENTIAL_LAYER',
        affectedLeadsSummary:
          'Strong in I (+1.0x), III (-1.0x), aVL (+1.0x = 1.5x VL); moderate in aVR, aVF (-0.5x) & V1–V6 (-0.33x via WCT); spared in II (0x)',
        mechanismNote:
          'Injected into LA electrode potential before WCT & LeadDerivation.',
      };
    case 'LL':
      return {
        scope: 'ELECTRODE_POTENTIAL_LAYER',
        affectedLeadsSummary:
          'Strong in II (+1.0x), III (+1.0x), aVF (+1.0x = 1.5x VF); moderate in aVR, aVL (-0.5x) & V1–V6 (-0.33x via WCT); spared in I (0x)',
        mechanismNote:
          'Injected into LL electrode potential before WCT & LeadDerivation.',
      };
    case 'RL':
      return {
        scope: 'REFERENCE_CONTACT_ARTIFACT',
        affectedLeadsSummary:
          'Widespread common-mode interference across all 12 leads (I–aVF, V1–V6)',
        mechanismNote:
          'REFERENCE_CONTACT_ARTIFACT: Educational approximation of right-leg reference / DRL contact failure reducing common-mode rejection.',
      };
    case 'ALL':
    default:
      return {
        scope: 'GLOBAL',
        affectedLeadsSummary: 'All 12 leads (I, II, III, aVR, aVL, aVF, V1–V6)',
        mechanismNote: 'Global artifact distributed across all recording channels.',
      };
  }
}

const LEAD_SENSITIVITY_WEIGHTS: Record<
  LeadName,
  { mains: number; wander: number; emg: number; phaseOffsetRad: number }
> = {
  I: { mains: 0.9, wander: 0.75, emg: 1.15, phaseOffsetRad: 0.1 },
  II: { mains: 1.05, wander: 1.0, emg: 1.1, phaseOffsetRad: 0.4 },
  III: { mains: 0.95, wander: 0.9, emg: 1.05, phaseOffsetRad: 0.8 },
  aVR: { mains: 0.85, wander: 0.8, emg: 1.0, phaseOffsetRad: 1.2 },
  aVL: { mains: 0.85, wander: 0.8, emg: 1.05, phaseOffsetRad: 1.6 },
  aVF: { mains: 0.95, wander: 0.95, emg: 1.0, phaseOffsetRad: 2.0 },
  V1: { mains: 0.75, wander: 0.85, emg: 0.7, phaseOffsetRad: 0.3 },
  V2: { mains: 0.8, wander: 0.9, emg: 0.7, phaseOffsetRad: 0.6 },
  V3: { mains: 0.85, wander: 0.95, emg: 0.75, phaseOffsetRad: 0.9 },
  V4: { mains: 0.9, wander: 1.0, emg: 0.8, phaseOffsetRad: 1.2 },
  V5: { mains: 0.85, wander: 0.9, emg: 0.85, phaseOffsetRad: 1.5 },
  V6: { mains: 0.8, wander: 0.85, emg: 0.85, phaseOffsetRad: 1.8 },
};

export function isAnyArtifactEnabled(rawArtifacts: ArtifactConfig): boolean {
  const artifacts = normalizeArtifactConfig(rawArtifacts);
  return Boolean(
    (artifacts.mainsHumEnabled && artifacts.mainsAmplitudeMv > 0) ||
      (artifacts.baselineWanderEnabled &&
        artifacts.baselineWanderAmplitudeMv > 0) ||
      (artifacts.emgNoiseEnabled && artifacts.emgNoiseAmplitudeMv > 0)
  );
}

export function applyArtifactsToTwelveLeadECG(
  clean: TwelveLeadSignals,
  rawArtifacts: ArtifactConfig,
  rng: RandomSource
): TwelveLeadSignals {
  const artifacts = normalizeArtifactConfig(rawArtifacts);

  // Hard invariant: If all artifacts are OFF, return an exact value copy of clean
  if (!isAnyArtifactEnabled(artifacts)) {
    const identicalCopy = {} as TwelveLeadSignals;
    for (const lead of LEAD_NAMES) {
      identicalCopy[lead] = clean[lead].map((pt) => ({ t: pt.t, v: pt.v }));
    }
    return identicalCopy;
  }

  const numSamples = clean.I.length;
  const artifactRng = rng.fork('artifact_engine');

  // Initialize output arrays with clean signal copies
  const finalSignals = {} as TwelveLeadSignals;
  for (const lead of LEAD_NAMES) {
    finalSignals[lead] = clean[lead].map((pt) => ({ t: pt.t, v: pt.v }));
  }

  // 1. Baseline Drift (DRIFT_SMALL ~0.20 mV, DRIFT_LARGE ~0.40 mV)
  if (
    artifacts.baselineWanderEnabled &&
    artifacts.baselineWanderAmplitudeMv > 0
  ) {
    const fWander = artifacts.baselineWanderFrequencyHz || 0.22;
    for (const lead of LEAD_NAMES) {
      const leadRng = artifactRng.fork(`wander_${lead}`);
      const weights = LEAD_SENSITIVITY_WEIGHTS[lead];
      const phase1 = leadRng.nextRange(0, 2 * Math.PI);
      const phase2 = leadRng.nextRange(0, 2 * Math.PI);
      const pts = finalSignals[lead];
      for (let i = 0; i < numSamples; i++) {
        const tSec = pts[i]!.t / 1000;
        const wander =
          0.72 * Math.sin(2 * Math.PI * fWander * tSec + phase1) +
          0.28 * Math.sin(2 * Math.PI * (fWander * 2.13) * tSec + phase2);
        pts[i]!.v +=
          artifacts.baselineWanderAmplitudeMv * weights.wander * wander;
      }
    }
  }

  // 2. Electrode-Level & Global EMG Noise
  if (artifacts.emgNoiseEnabled && artifacts.emgNoiseAmplitudeMv > 0) {
    const emgTargets = artifacts.emgTargets ?? ['ALL'];
    const isAllOrRl =
      emgTargets.includes('ALL') || emgTargets.includes('RL');
    const limbTargets = emgTargets.filter(
      (t): t is 'RA' | 'LA' | 'LL' => t === 'RA' || t === 'LA' || t === 'LL'
    );

    if (isAllOrRl) {
      const rlMultiplier = emgTargets.includes('RL') && !emgTargets.includes('ALL') ? 0.92 : 1.0;
      for (const lead of LEAD_NAMES) {
        const leadRng = artifactRng.fork(`emg_global_${lead}`);
        const weights = LEAD_SENSITIVITY_WEIGHTS[lead];
        let prevEmg = 0;
        const pts = finalSignals[lead];
        for (let i = 0; i < numSamples; i++) {
          const rawG = leadRng.nextGaussian();
          const filtered = 0.45 * prevEmg + 0.55 * rawG;
          prevEmg = filtered;
          pts[i]!.v +=
            artifacts.emgNoiseAmplitudeMv *
            weights.emg *
            rlMultiplier *
            filtered;
        }
      }
    }

    if (limbTargets.length > 0 && !emgTargets.includes('ALL')) {
      // Inject EMG directly into the targeted limb electrode potentials (RA, LA, LL)
      // and propagate via deriveInstantaneousLeads (Einthoven, Goldberger, and WCT -> V1..V6)
      const raRng = artifactRng.fork('emg_elec_RA');
      const laRng = artifactRng.fork('emg_elec_LA');
      const llRng = artifactRng.fork('emg_elec_LL');
      let prevRa = 0;
      let prevLa = 0;
      let prevLl = 0;
      const hasRa = limbTargets.includes('RA');
      const hasLa = limbTargets.includes('LA');
      const hasLl = limbTargets.includes('LL');

      for (let i = 0; i < numSamples; i++) {
        let dRa = 0;
        let dLa = 0;
        let dLl = 0;
        if (hasRa) {
          prevRa = 0.45 * prevRa + 0.55 * raRng.nextGaussian();
          dRa = artifacts.emgNoiseAmplitudeMv * prevRa;
        }
        if (hasLa) {
          prevLa = 0.45 * prevLa + 0.55 * laRng.nextGaussian();
          dLa = artifacts.emgNoiseAmplitudeMv * prevLa;
        }
        if (hasLl) {
          prevLl = 0.45 * prevLl + 0.55 * llRng.nextGaussian();
          dLl = artifacts.emgNoiseAmplitudeMv * prevLl;
        }
        const deltaPotentials: ElectrodePotentials = {
          RA: dRa,
          LA: dLa,
          LL: dLl,
          C1: 0,
          C2: 0,
          C3: 0,
          C4: 0,
          C5: 0,
          C6: 0,
        };
        const deltaLeads = deriveInstantaneousLeads(deltaPotentials);
        for (const lead of LEAD_NAMES) {
          finalSignals[lead][i]!.v += deltaLeads[lead];
        }
      }
    }
  }

  // 3. Electrode-Level & Global AC Mains Hum (50 / 60 Hz)
  if (artifacts.mainsHumEnabled && artifacts.mainsAmplitudeMv > 0) {
    const fMains = artifacts.mainsFrequencyHz === 60 ? 60 : 50;
    const acTargets = artifacts.acTargets ?? ['ALL'];
    const isAllOrRl =
      acTargets.includes('ALL') || acTargets.includes('RL');
    const limbTargets = acTargets.filter(
      (t): t is 'RA' | 'LA' | 'LL' => t === 'RA' || t === 'LA' || t === 'LL'
    );

    if (isAllOrRl) {
      // RL contact failure (REFERENCE_CONTACT_ARTIFACT) or ALL creates common-mode AC hum across all leads
      const rlBoost =
        acTargets.includes('RL') && !acTargets.includes('ALL') ? 1.15 : 1.0;
      for (const lead of LEAD_NAMES) {
        const weights = LEAD_SENSITIVITY_WEIGHTS[lead];
        const pts = finalSignals[lead];
        for (let i = 0; i < numSamples; i++) {
          const tSec = pts[i]!.t / 1000;
          pts[i]!.v +=
            artifacts.mainsAmplitudeMv *
            weights.mains *
            rlBoost *
            Math.sin(2 * Math.PI * fMains * tSec + weights.phaseOffsetRad * 0.2);
        }
      }
    }

    if (limbTargets.length > 0 && !acTargets.includes('ALL')) {
      const hasRa = limbTargets.includes('RA');
      const hasLa = limbTargets.includes('LA');
      const hasLl = limbTargets.includes('LL');

      for (let i = 0; i < numSamples; i++) {
        const tSec = finalSignals.I[i]!.t / 1000;
        const dRa = hasRa
          ? artifacts.mainsAmplitudeMv *
            Math.sin(2 * Math.PI * fMains * tSec + 0.15)
          : 0;
        const dLa = hasLa
          ? artifacts.mainsAmplitudeMv *
            Math.sin(2 * Math.PI * fMains * tSec + 0.85)
          : 0;
        const dLl = hasLl
          ? artifacts.mainsAmplitudeMv *
            Math.sin(2 * Math.PI * fMains * tSec + 1.55)
          : 0;

        const deltaPotentials: ElectrodePotentials = {
          RA: dRa,
          LA: dLa,
          LL: dLl,
          C1: 0,
          C2: 0,
          C3: 0,
          C4: 0,
          C5: 0,
          C6: 0,
        };
        const deltaLeads = deriveInstantaneousLeads(deltaPotentials);
        for (const lead of LEAD_NAMES) {
          finalSignals[lead][i]!.v += deltaLeads[lead];
        }
      }
    }
  }

  return finalSignals;
}
