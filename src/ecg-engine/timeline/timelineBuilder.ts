/**
 * Master Timeline Builder (Rhythm + Conduction + Device Event-Driven Simulation)
 *
 * Drives the Priority Event Queue to produce:
 * 1. PhysiologicalEvents (with parentEventId and triggerEventId causal tracking)
 * 2. PhysiologicalEpisodes (electrical activation/repolarization + mechanical contraction)
 * 3. Surface ECGAnnotations (P, QRS, T, U, ST, PACE_SPIKE, BLOCKED_P)
 */

import { ConductionNetworkRuntime } from '../conduction/conductionEngine';
import { RandomSource } from '../core/random';
import { clamp } from '../core/units';
import { ECTOPIC_LV_QRS_RECIPE } from '../morphology/recipes';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import { EventPriorityQueue } from './eventQueue';
import {
  ECGAnnotation,
  MasterTimeline,
  PhysiologicalEpisode,
  PhysiologicalEvent,
  VentricularActivationEpisode,
} from './events';

export function buildMasterTimeline(
  config: ResolvedSimulationConfig,
  durationMs: number,
  rng: RandomSource
): MasterTimeline {
  const queue = new EventPriorityQueue();
  const conduction = new ConductionNetworkRuntime(config.conductionNetwork);
  const events: PhysiologicalEvent[] = [];
  const episodes: PhysiologicalEpisode[] = [];
  const annotations: ECGAnnotation[] = [];

  const rhythmRng = rng.fork('rhythm_engine');
  let idCounter = 1;
  const nextId = (prefix: string) => `${prefix}_${idCounter++}`;

  // Determine active rhythm sources
  const sinusSource = config.rhythmSources.find(
    (s) => s.type === 'SINUS_NODE' && s.enabled
  );
  const pacSource = config.rhythmSources.find(
    (s) => s.type === 'ATRIAL_ECTOPIC' && s.enabled
  );
  const pvcSource = config.rhythmSources.find(
    (s) => s.type === 'VENTRICULAR_ECTOPIC' && s.enabled
  );
  const ventEscapeSource = config.rhythmSources.find(
    (s) => s.type === 'VENTRICULAR_ESCAPE' && s.enabled
  );
  const juncEscapeSource = config.rhythmSources.find(
    (s) => s.type === 'JUNCTIONAL_ESCAPE' && s.enabled
  );
  const flutterSource = config.rhythmSources.find(
    (s) => s.type === 'ATRIAL_FLUTTER' && s.enabled
  );
  const afSource = config.rhythmSources.find(
    (s) => s.type === 'ATRIAL_FIBRILLATION' && s.enabled
  );
  const vtSource = config.rhythmSources.find(
    (s) => s.type === 'VENTRICULAR_TACHYCARDIA' && s.enabled
  );

  // AV nodal recovery uses its own seeded stream, independent of the number
  // of atrial wavelets generated for the requested recording duration.
  const afConductionRng = afSource ? rng.fork('af_av_filtering') : undefined;

  // Helper to schedule next Sinus Impulse
  let sinusBeatCount = 0;
  const scheduleSinusImpulse = (timeMs: number) => {
    if (!sinusSource || sinusSource.type !== 'SINUS_NODE') return;
    if (timeMs > durationMs) return;

    const cycleMs = 60000 / clamp(sinusSource.rateBpm, 20, 260);
    let actualTime = timeMs;

    // Check Sinus Arrest / Pause window
    if (
      sinusSource.pauseAtMs !== undefined &&
      sinusSource.pauseDurationMs !== undefined
    ) {
      if (
        actualTime >= sinusSource.pauseAtMs &&
        actualTime < sinusSource.pauseAtMs + sinusSource.pauseDurationMs
      ) {
        actualTime = sinusSource.pauseAtMs + sinusSource.pauseDurationMs;
      }
    }

    if (actualTime > durationMs) return;

    queue.enqueue({
      id: nextId('ev_sinus'),
      type: 'SINUS_IMPULSE',
      timestamp: actualTime,
      priority: 10,
      sourceId: sinusSource.id,
      cycleLengthMs: cycleMs,
    });
  };

  // 1. Seed initial Sinus Node impulse if active
  if (sinusSource && sinusSource.type === 'SINUS_NODE') {
    scheduleSinusImpulse(120);
  }

  // 1b. Seed explicit PAC / PVC counts when specified (e.g. Exam Question Generator Mode)
  // Ectopics are scheduled relative to specific preceding sinus beats (coupling interval)
  // to ensure they NEVER overlap or artificially fuse with normal narrow QRS complexes!
  const hasExplicitPacCount = config.pacCount !== undefined;
  const hasExplicitPvcCount = config.pvcCount !== undefined;
  const explicitEctopicByBeat = new Map<number, 'PAC' | 'PVC'>();

  if (hasExplicitPacCount || hasExplicitPvcCount) {
    const ectopicRng = rng.fork('exam_ectopic_placement');
    const targetPac = clamp(Math.round(config.pacCount ?? 0), 0, 15);
    const targetPvc = clamp(Math.round(config.pvcCount ?? 0), 0, 15);
    const ectopicTypes: ('PAC' | 'PVC')[] = [
      ...Array<'PAC'>(targetPac).fill('PAC'),
      ...Array<'PVC'>(targetPvc).fill('PVC'),
    ];
    // Deterministic Fisher-Yates shuffle via seeded PRNG
    for (let i = ectopicTypes.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(ectopicRng.nextRange(0, i + 0.9999)));
      const tmp = ectopicTypes[i]!;
      ectopicTypes[i] = ectopicTypes[j]!;
      ectopicTypes[j] = tmp;
    }

    const totalEctopics = ectopicTypes.length;
    if (totalEctopics > 0) {
      const sinusRate =
        sinusSource && sinusSource.type === 'SINUS_NODE'
          ? sinusSource.rateBpm
          : 75;
      const estimatedBeats = Math.max(
        6,
        Math.floor((durationMs / 60000) * sinusRate)
      );

      // Place the first requested ectopic after the first sinus beat so the fixed
      // 2.5-second exam panels include it. Distribute the remainder across the
      // recording, retaining at least one intervening sinus beat.
      const usableSpan = Math.max(totalEctopics * 2, estimatedBeats - 3);
      const step = usableSpan / (totalEctopics + 1);

      let lastBeat = -1;
      for (let k = 0; k < totalEctopics; k++) {
        let assignedBeat = k === 0 ? 1 : Math.max(
          lastBeat + 2,
          Math.min(
            estimatedBeats - 1,
            Math.round(2 + (k + 0.5) * step)
          )
        );
        while (explicitEctopicByBeat.has(assignedBeat) && assignedBeat < estimatedBeats) {
          assignedBeat += 1;
        }
        lastBeat = assignedBeat;
        explicitEctopicByBeat.set(assignedBeat, ectopicTypes[k]!);
      }
    }
  }

  // 2. Seed independent Ventricular Escape clock (e.g., Complete AV Block)
  if (
    ventEscapeSource &&
    ventEscapeSource.type === 'VENTRICULAR_ESCAPE' &&
    ventEscapeSource.independentClock
  ) {
    const escapeCycleMs =
      60000 / clamp(ventEscapeSource.escapeRateBpm, 20, 120);
    for (let t = 340; t <= durationMs; t += escapeCycleMs) {
      // Strictly NO parentEventId or triggerEventId -> completely independent clock
      queue.enqueue({
        id: nextId('ev_vescape'),
        type: 'ESCAPE_IMPULSE',
        timestamp: t,
        priority: 12,
        sourceId: ventEscapeSource.id,
        escapeFocus: 'VENTRICULAR',
      });
    }
  }

  // 3. Seed Junctional Escape / Rhythm
  if (juncEscapeSource && juncEscapeSource.type === 'JUNCTIONAL_ESCAPE') {
    const juncCycleMs = 60000 / clamp(juncEscapeSource.escapeRateBpm, 25, 150);
    for (let t = 200; t <= durationMs; t += juncCycleMs) {
      queue.enqueue({
        id: nextId('ev_junc'),
        type: 'JUNCTIONAL_IMPULSE',
        timestamp: t,
        priority: 11,
        sourceId: juncEscapeSource.id,
        isEscape: !juncEscapeSource.isPrimaryAccelerated,
      });
    }
  }

  // 4. Seed Atrial Flutter continuous macro-reentrant impulses + per-cycle flutter episodes
  if (flutterSource && flutterSource.type === 'ATRIAL_FLUTTER') {
    const flutterCycleMs = 60000 / clamp(flutterSource.atrialRateBpm, 180, 400);
    episodes.push({
      id: nextId('ep_flutter_bg'),
      type: 'FIBRILLATORY_BACKGROUND',
      startTime: 0,
      duration: durationMs,
      endTime: durationMs,
      sourceEventId: 'FLUTTER_MACRO_CIRCUIT',
      rootImpulseEventId: 'FLUTTER_MACRO_CIRCUIT',
      waveType: 'FLUTTER_SAWTOOTH',
      dominantFreqHz: flutterSource.atrialRateBpm / 60,
      amplitudeMv: 0.16,
    });
    for (let t = 80; t <= durationMs; t += flutterCycleMs) {
      const flImpulse = queue.enqueue({
        id: nextId('ev_flutter_impulse'),
        type: 'ATRIAL_ECTOPIC_IMPULSE',
        timestamp: t,
        priority: 14,
        sourceId: flutterSource.id,
        focusRegion: 'LOW_ATRIA',
      });

      // Emit discrete Flutter Atrial Activation episode for each 200ms macro-reentrant wave
      episodes.push({
        id: nextId('ep_flutter_wave'),
        type: 'ATRIAL_ACTIVATION',
        startTime: t,
        duration: flutterCycleMs,
        endTime: t + flutterCycleMs,
        sourceEventId: flImpulse.id,
        rootImpulseEventId: flImpulse.id,
        recipeVariant: 'FLUTTER_WAVE',
        amplitudeScale: 0.0, // Sawtooth spatial current is carried by FIBRILLATORY_BACKGROUND
        axisOffsetDeg: -90,
      });

      queue.enqueue({
        id: nextId('ev_flutter_av_attempt'),
        type: 'CONDUCTION_ATTEMPT',
        timestamp: t + 25,
        priority: 15,
        parentEventId: flImpulse.id,
        triggerEventId: flImpulse.id,
        pathId: 'AV_NODE',
        fromNode: 'ATRIA',
        toNode: 'HIS',
        originImpulseType: 'FLUTTER',
      });
    }
  }

  // 5. Seed Atrial Fibrillation: high-rate stochastic atrial wavelets bombarding AV_NODE
  // AV_NODE refractory filtering produces blocked attempts and irregularly irregular conducted RR intervals
  if (afSource && afSource.type === 'ATRIAL_FIBRILLATION') {
    episodes.push({
      id: nextId('ep_af_bg'),
      type: 'FIBRILLATORY_BACKGROUND',
      startTime: 0,
      duration: durationMs,
      endTime: durationMs,
      sourceEventId: 'AF_MULTIPLE_WAVELETS',
      rootImpulseEventId: 'AF_MULTIPLE_WAVELETS',
      waveType: 'COARSE_AF',
      dominantFreqHz: afSource.fWaveFrequencyHz,
      amplitudeMv: afSource.fWaveAmplitudeMv,
    });

    // High-frequency chaotic atrial bombardment (~380-520 impulses/min, interval 105-175 ms)
    let tAfWavelet = 90;
    while (tAfWavelet <= durationMs) {
      const afImpulse = queue.enqueue({
        id: nextId('ev_af_wavelet'),
        type: 'ATRIAL_ECTOPIC_IMPULSE',
        timestamp: tAfWavelet,
        priority: 14,
        sourceId: afSource.id,
        focusRegion: 'PULMONARY_VEIN',
      });

      queue.enqueue({
        id: nextId('ev_af_av_attempt'),
        type: 'CONDUCTION_ATTEMPT',
        timestamp: tAfWavelet + 15,
        priority: 15,
        parentEventId: afImpulse.id,
        triggerEventId: afImpulse.id,
        pathId: 'AV_NODE',
        fromNode: 'ATRIA',
        toNode: 'HIS',
        originImpulseType: 'AF',
      });

      const waveletInterval = rhythmRng.nextRange(105, 185);
      tAfWavelet += waveletInterval;
    }
  }

  // 6. Seed Ventricular Tachycardia / Torsades de Pointes
  if (vtSource && vtSource.type === 'VENTRICULAR_TACHYCARDIA') {
    const vtCycleMs = 60000 / clamp(vtSource.rateBpm, 110, 260);
    for (let t = 140; t <= durationMs; t += vtCycleMs) {
      const phaseAngleRad =
        vtSource.polymorphicTwistHz > 0
          ? 2 * Math.PI * vtSource.polymorphicTwistHz * (t / 1000)
          : undefined;
      queue.enqueue({
        id: nextId('ev_vt'),
        type: 'VENTRICULAR_ECTOPIC_IMPULSE',
        timestamp: t,
        priority: 10,
        sourceId: vtSource.id,
        originFocus:
          vtSource.polymorphicTwistHz > 0 ? 'POLYMORPHIC' : 'RV_OUTFLOW',
        phaseAngleRad,
      });
    }
  }

  // 7. Seed Pacemaker Device Engine if enabled
  const vviEscapeCycleMs = 60000 / clamp(config.device.lowerRateBpm, 30, 160);
  const inhibitedVviStimulusIds = new Set<string>();
  let pendingVviStimulusId: string | null = null;
  let pendingVviStimulusTimeMs = Infinity;

  const scheduleNextVviEscape = (fromTimeMs: number) => {
    if (!config.device.enabled || config.device.mode !== 'VVI') return;
    if (pendingVviStimulusId) {
      inhibitedVviStimulusIds.add(pendingVviStimulusId);
    }
    const nextTime = fromTimeMs + vviEscapeCycleMs;
    if (nextTime <= durationMs) {
      const stimId = nextId('ev_pace_v');
      pendingVviStimulusId = stimId;
      pendingVviStimulusTimeMs = nextTime;
      queue.enqueue({
        id: stimId,
        type: 'PACEMAKER_STIMULUS',
        timestamp: nextTime,
        priority: 8,
        chamber: 'VENTRICLE',
        outputMv: config.device.ventricularOutputMv,
        pulseWidthMs: 0.5,
      });
    } else {
      pendingVviStimulusId = null;
      pendingVviStimulusTimeMs = Infinity;
    }
  };

  if (config.device.enabled && config.device.mode !== 'OFF') {
    const paceCycleMs = 60000 / clamp(config.device.lowerRateBpm, 30, 160);
    if (config.device.mode === 'DDD') {
      for (let t = 240; t <= durationMs; t += paceCycleMs) {
        queue.enqueue({
          id: nextId('ev_pace_a'),
          type: 'PACEMAKER_STIMULUS',
          timestamp: t,
          priority: 8,
          chamber: 'ATRIUM',
          outputMv: config.device.atrialOutputMv,
          pulseWidthMs: 0.5,
        });
        queue.enqueue({
          id: nextId('ev_pace_v'),
          type: 'PACEMAKER_STIMULUS',
          timestamp: t + config.device.avDelayMs,
          priority: 8,
          chamber: 'VENTRICLE',
          outputMv: config.device.ventricularOutputMv,
          pulseWidthMs: 0.5,
        });
      }
    } else if (config.device.mode === 'VVI') {
      // Schedule initial VVI escape check at t = 420 ms (if an intrinsic R-wave arrives before 420 ms, it senses & inhibits)
      const initStimId = nextId('ev_pace_v');
      pendingVviStimulusId = initStimId;
      pendingVviStimulusTimeMs = 420;
      queue.enqueue({
        id: initStimId,
        type: 'PACEMAKER_STIMULUS',
        timestamp: 420,
        priority: 8,
        chamber: 'VENTRICLE',
        outputMv: config.device.ventricularOutputMv,
        pulseWidthMs: 0.5,
      });
    }
  }

  // Track which root impulses have already initiated ventricular pre-excitation (for WPW parallel fusion)
  const preexcitedRootImpulseIds = new Set<string>();

  // Helper to emit a Ventricular Activation + Repolarization + Mechanical Contraction Episode
  const emitVentricularActivation = (
    onsetMs: number,
    sourceEvent: PhysiologicalEvent,
    rootEventId: string,
    variantOverride?: VentricularActivationEpisode['recipeVariant'],
    torsadesPhaseRad?: number
  ) => {
    if (onsetMs > durationMs) return;

    let variant: VentricularActivationEpisode['recipeVariant'] =
      variantOverride ?? 'NORMAL_PURKINJE';
    if (!variantOverride) {
      if (config.conductionNetwork.ACCESSORY_PATHWAY.enabled) {
        variant = 'WPW_PREEXCITED';
      } else if (!config.conductionNetwork.RIGHT_BUNDLE.enabled) {
        variant = 'RBBB';
      } else if (!config.conductionNetwork.LEFT_BUNDLE.enabled) {
        variant = 'LBBB';
      } else if (!config.conductionNetwork.LAF.enabled) {
        variant = 'LAFB';
      } else if (!config.conductionNetwork.LPF.enabled) {
        variant = 'LPFB';
      }
    }

    // Demand VVI Sensing: if an intrinsic ventricular activation occurs before the lower-rate timeout,
    // inhibit pending pacing stimulus and reset VVI escape timer to onsetMs + vviEscapeCycleMs!
    if (
      config.device.enabled &&
      config.device.mode === 'VVI' &&
      variant !== 'PACED_RV_APEX' &&
      onsetMs < pendingVviStimulusTimeMs
    ) {
      queue.enqueue({
        id: nextId('ev_vvi_inhibit'),
        type: 'VVI_INHIBIT',
        timestamp: onsetMs,
        priority: 7,
        chamber: 'VENTRICLE',
        sensedEventId: sourceEvent.id,
        nextScheduledEscapeMs: onsetMs + vviEscapeCycleMs,
      });
      annotations.push({
        id: nextId('ann_vvi_sense'),
        label: 'VVI_INHIBIT',
        onsetMs,
        peakMs: onsetMs,
        offsetMs: onsetMs + 10,
        linkedEventId: sourceEvent.id,
        description: `VVI sensed intrinsic R-wave at ${Math.round(onsetMs)} ms -> inhibited stimulus & reset escape timer`,
      });
      scheduleNextVviEscape(onsetMs);
    }

    const isWideEctopic =
      variant === 'ECTOPIC_RV' ||
      variant === 'ECTOPIC_LV' ||
      variant === 'PACED_RV_APEX' ||
      variant === 'ESCAPE_IDIOVENTRICULAR' ||
      variant === 'TORSADES_POLYMORPHIC';

    const qrsDuration = isWideEctopic
      ? Math.max(config.qrsDurationMs, 140)
      : config.qrsDurationMs;

    const qrsEpisodeId = nextId('ep_qrs');
    const qrsEndMs = onsetMs + qrsDuration;

    episodes.push({
      id: qrsEpisodeId,
      type: 'VENTRICULAR_ACTIVATION',
      startTime: onsetMs,
      duration: qrsDuration,
      endTime: qrsEndMs,
      sourceEventId: sourceEvent.id,
      rootImpulseEventId: rootEventId,
      recipeVariant: variant,
      amplitudeScale: config.qrsAmplitudeScale,
      axisTargetDeg: variant === 'ECTOPIC_LV'
        ? ECTOPIC_LV_QRS_RECIPE.referenceAxisDeg
        : config.qrsAxisDeg,
      torsadesPhaseRad,
    });

    annotations.push({
      id: nextId('ann_qrs'),
      label: 'QRS',
      onsetMs,
      peakMs: onsetMs + qrsDuration * 0.48,
      offsetMs: qrsEndMs,
      linkedEpisodeId: qrsEpisodeId,
      linkedEventId: sourceEvent.id,
    });

    // Ventricular Mechanical Systole (simplified educational electromechanical delay model: +25 ms after electrical onset)
    const mechDuration = Math.max(220, config.qtIntervalMs - 60);
    episodes.push({
      id: nextId('ep_v_mech'),
      type: 'VENTRICULAR_CONTRACTION',
      startTime: onsetMs + 25,
      duration: mechDuration,
      endTime: onsetMs + 25 + mechDuration,
      sourceEventId: sourceEvent.id,
      rootImpulseEventId: rootEventId,
      electricalEpisodeId: qrsEpisodeId,
    });

    // Ventricular Repolarization (ST + T + optional U)
    const totalQtMs = Math.max(qrsDuration + 140, config.qtIntervalMs);
    const repolStartMs = qrsEndMs;
    const repolDurationMs = Math.max(120, totalQtMs - qrsDuration);
    const repolEndMs = onsetMs + totalQtMs;
    const repolEpisodeId = nextId('ep_repol');

    const discordance = isWideEctopic
      ? Math.max(0.75, config.secondaryDiscordanceFactor)
      : config.secondaryDiscordanceFactor;

    episodes.push({
      id: repolEpisodeId,
      type: 'VENTRICULAR_REPOLARIZATION',
      startTime: repolStartMs,
      duration: repolDurationMs,
      endTime: repolEndMs,
      sourceEventId: sourceEvent.id,
      rootImpulseEventId: rootEventId,
      qrsStartTime: onsetMs,
      qrsEndTime: qrsEndMs,
      qrsDuration,
      recipeVariant: variant,
      amplitudeScale: config.tAmplitudeScale,
      tAxisTargetDeg: config.tAxisDeg,
      secondaryDiscordanceFactor: discordance,
    });

    annotations.push({
      id: nextId('ann_t'),
      label: 'T',
      onsetMs: repolStartMs + repolDurationMs * 0.15,
      peakMs: repolStartMs + repolDurationMs * 0.56,
      offsetMs: repolEndMs,
      linkedEpisodeId: repolEpisodeId,
      linkedEventId: sourceEvent.id,
    });

    if (config.uWaveRecipe.enabled && config.uWaveRecipe.magnitude > 0.01) {
      const uOnset = repolEndMs + config.uWaveRecipe.delayAfterTEndMs;
      annotations.push({
        id: nextId('ann_u'),
        label: 'U',
        onsetMs: uOnset,
        peakMs: uOnset + config.uWaveRecipe.durationMs * 0.45,
        offsetMs: uOnset + config.uWaveRecipe.durationMs,
        linkedEpisodeId: repolEpisodeId,
      });
    }
  };

  // Process the Priority Event Queue deterministically
  while (!queue.isEmpty()) {
    const ev = queue.dequeue()!;
    if (ev.timestamp > durationMs) continue;
    events.push(ev);

    switch (ev.type) {
      case 'SINUS_IMPULSE': {
        sinusBeatCount += 1;

        // Schedule next Sinus Impulse
        scheduleSinusImpulse(ev.timestamp + ev.cycleLengthMs);

        // Schedule explicit PAC / PVC for this sinus beat if scheduled
        const explicitKind = explicitEctopicByBeat.get(sinusBeatCount);
        if (explicitKind === 'PAC') {
          queue.enqueue({
            id: nextId('ev_exam_pac'),
            type: 'ATRIAL_ECTOPIC_IMPULSE',
            timestamp: ev.timestamp + 380,
            priority: 9,
            sourceId: 'EXAM_PAC',
            focusRegion: 'LOW_ATRIA',
          });
        } else if (explicitKind === 'PVC') {
          queue.enqueue({
            id: nextId('ev_exam_pvc'),
            type: 'VENTRICULAR_ECTOPIC_IMPULSE',
            timestamp: ev.timestamp + 440,
            priority: 9,
            sourceId: 'EXAM_PVC',
            originFocus: config.pvcOrigin === 'LV' ? 'LV_POSTERIOR' : 'RV_OUTFLOW',
          });
        }

        // Schedule premature atrial contraction (PAC) if configured on this beat (unless overridden by explicit pacCount)
        if (
          !hasExplicitPacCount &&
          pacSource &&
          pacSource.type === 'ATRIAL_ECTOPIC' &&
          sinusBeatCount % pacSource.everyNthSinusBeat === 2
        ) {
          queue.enqueue({
            id: nextId('ev_pac'),
            type: 'ATRIAL_ECTOPIC_IMPULSE',
            timestamp: ev.timestamp + pacSource.couplingIntervalMs,
            priority: 9,
            sourceId: pacSource.id,
            focusRegion: pacSource.focusRegion,
          });
        }

        // Schedule premature ventricular contraction (PVC) if configured on this beat (unless overridden by explicit pvcCount)
        if (
          !hasExplicitPvcCount &&
          pvcSource &&
          pvcSource.type === 'VENTRICULAR_ECTOPIC' &&
          sinusBeatCount % pvcSource.everyNthBeat === 2
        ) {
          // PVC has NO parentEventId or triggerEventId linking it to atrial conduction
          queue.enqueue({
            id: nextId('ev_pvc'),
            type: 'VENTRICULAR_ECTOPIC_IMPULSE',
            timestamp: ev.timestamp + pvcSource.couplingIntervalMs,
            priority: 9,
            sourceId: pvcSource.id,
            originFocus: config.pvcOrigin === 'LV'
              ? 'LV_POSTERIOR'
              : config.pvcOrigin === 'RV'
                ? 'RV_OUTFLOW'
                : pvcSource.originFocus,
          });
        }

        // Attempt SA_EXIT conduction
        queue.enqueue({
          id: nextId('ev_sa_exit_attempt'),
          type: 'CONDUCTION_ATTEMPT',
          timestamp: ev.timestamp,
          priority: 20,
          parentEventId: ev.id,
          triggerEventId: ev.id,
          pathId: 'SA_EXIT',
          fromNode: 'SA_NODE',
          toNode: 'ATRIA',
          originImpulseType: 'SINUS',
        });
        break;
      }

      case 'ATRIAL_ECTOPIC_IMPULSE': {
        // Ignore AF/Flutter internal impulses here as their conduction attempts are already queued
        if (
          (afSource && ev.sourceId === afSource.id) ||
          (flutterSource && ev.sourceId === flutterSource.id)
        ) {
          break;
        }

        // PAC resets SA node clock if configured or if from EXAM_PAC
        if (
          ((pacSource &&
            pacSource.type === 'ATRIAL_ECTOPIC' &&
            pacSource.resetsSinusNode) ||
            ev.sourceId === 'EXAM_PAC') &&
          sinusSource &&
          sinusSource.type === 'SINUS_NODE'
        ) {
          queue.removeWhere(
            (qEv) =>
              qEv.type === 'SINUS_IMPULSE' && qEv.timestamp >= ev.timestamp
          );
          const cycleMs = 60000 / clamp(sinusSource.rateBpm, 20, 260);
          scheduleSinusImpulse(ev.timestamp + cycleMs);
        }

        // Directly depolarize Atria with ectopic P wave recipe
        const pOnset = ev.timestamp;
        const pDur = config.pDurationMs;
        const pEpId = nextId('ep_p_pac');
        episodes.push({
          id: pEpId,
          type: 'ATRIAL_ACTIVATION',
          startTime: pOnset,
          duration: pDur,
          endTime: pOnset + pDur,
          sourceEventId: ev.id,
          rootImpulseEventId: ev.id,
          recipeVariant: 'ECTOPIC_ATRIAL',
          amplitudeScale: config.pAmplitudeScale * 0.9,
          axisOffsetDeg: -65,
        });
        episodes.push({
          id: nextId('ep_a_mech'),
          type: 'ATRIAL_CONTRACTION',
          startTime: pOnset + 20,
          duration: 110,
          endTime: pOnset + 130,
          sourceEventId: ev.id,
          rootImpulseEventId: ev.id,
          electricalEpisodeId: pEpId,
        });
        annotations.push({
          id: nextId('ann_p_pac'),
          label: 'P',
          onsetMs: pOnset,
          peakMs: pOnset + pDur * 0.45,
          offsetMs: pOnset + pDur,
          linkedEpisodeId: pEpId,
          linkedEventId: ev.id,
          description: 'Premature Ectopic P',
        });

        if (ev.sourceId === 'EXAM_PAC') {
          // Guarantee AV conduction for explicit Exam PAC count so the premature narrow QRS is always visible
          emitVentricularActivation(
            pOnset + Math.max(120, config.prIntervalMs * 0.92),
            ev,
            ev.id
          );
        } else {
          // Attempt AV nodal conduction
          const atriaDelay = config.conductionNetwork.ATRIA.baseDelayMs;
          queue.enqueue({
            id: nextId('ev_av_attempt_pac'),
            type: 'CONDUCTION_ATTEMPT',
            timestamp: pOnset + atriaDelay,
            priority: 20,
            parentEventId: ev.id,
            triggerEventId: ev.id,
            pathId: 'AV_NODE',
            fromNode: 'ATRIA',
            toNode: 'HIS',
            originImpulseType: 'ATRIAL_ECTOPIC',
          });
        }
        break;
      }

      case 'VENTRICULAR_ECTOPIC_IMPULSE': {
        // PVC / VT impulse: directly activates Ventricular Myocardium without any atrial involvement
        conduction.imposeConcealedRefractoriness(
          'VENTRICULAR_MYOCARDIUM',
          ev.timestamp + 450
        );
        if (
          (pvcSource &&
            pvcSource.type === 'VENTRICULAR_ECTOPIC' &&
            pvcSource.blocksNextSinusRetrograde) ||
          ev.sourceId === 'EXAM_PVC'
        ) {
          // Retrograde concealed penetration renders AV node refractory to next sinus impulse -> physiological full compensatory pause
          conduction.imposeConcealedRefractoriness('AV_NODE', ev.timestamp + 440);
        }

        const variant =
          ev.originFocus === 'POLYMORPHIC'
            ? 'TORSADES_POLYMORPHIC'
            : ev.originFocus === 'LV_POSTERIOR'
              ? 'ECTOPIC_LV'
              : 'ECTOPIC_RV';

        emitVentricularActivation(
          ev.timestamp,
          ev,
          ev.id,
          variant,
          ev.phaseAngleRad
        );
        break;
      }

      case 'ESCAPE_IMPULSE': {
        if (ev.escapeFocus === 'VENTRICULAR') {
          emitVentricularActivation(
            ev.timestamp,
            ev,
            ev.id,
            'ESCAPE_IDIOVENTRICULAR'
          );
        } else {
          emitVentricularActivation(ev.timestamp, ev, ev.id, 'NORMAL_PURKINJE');
        }
        break;
      }

      case 'JUNCTIONAL_IMPULSE': {
        emitVentricularActivation(ev.timestamp, ev, ev.id, 'NORMAL_PURKINJE');
        if (
          juncEscapeSource &&
          juncEscapeSource.type === 'JUNCTIONAL_ESCAPE' &&
          juncEscapeSource.retrogradeAtrialOffsetMs !== undefined
        ) {
          const retroOnset = Math.max(
            10,
            ev.timestamp + juncEscapeSource.retrogradeAtrialOffsetMs
          );
          const retroDur = Math.min(86, config.pDurationMs);
          const retroAxis = juncEscapeSource.retrogradeAtrialAxisDeg ?? -90;
          const retroEpId = nextId('ep_p_retro');
          episodes.push({
            id: retroEpId,
            type: 'ATRIAL_ACTIVATION',
            startTime: retroOnset,
            duration: retroDur,
            endTime: retroOnset + retroDur,
            sourceEventId: ev.id,
            rootImpulseEventId: ev.id,
            recipeVariant: 'ECTOPIC_ATRIAL',
            amplitudeScale:
              (juncEscapeSource.retrogradeAtrialAmplitudeScale ?? 0.85) *
              config.pAmplitudeScale,
            axisOffsetDeg: retroAxis - config.pAxisDeg,
          });
          annotations.push({
            id: nextId('ann_p_retro'),
            label: 'P',
            onsetMs: retroOnset,
            peakMs: retroOnset + retroDur * 0.5,
            offsetMs: retroOnset + retroDur,
            linkedEpisodeId: retroEpId,
            linkedEventId: ev.id,
            description: 'Retrograde Atrial Activation (Inverted in II/III/aVF, Upright in V1/aVR)',
          });
        }
        break;
      }

      case 'PACEMAKER_STIMULUS': {
        if (inhibitedVviStimulusIds.has(ev.id)) {
          // Inhibited by a prior sensed intrinsic ventricular depolarization; do not emit stimulus event
          events.pop();
          break;
        }

        annotations.push({
          id: nextId('ann_spike'),
          label: 'PACE_SPIKE',
          onsetMs: ev.timestamp,
          peakMs: ev.timestamp + 1,
          offsetMs: ev.timestamp + 2,
          linkedEventId: ev.id,
          description: `Pacemaker Stimulus (${ev.chamber})`,
        });

        if (
          config.device.enabled &&
          config.device.mode === 'VVI' &&
          ev.chamber === 'VENTRICLE'
        ) {
          // Retrograde AV nodal penetration from ventricular pacing prevents simultaneous sinus fusion collision
          conduction.imposeConcealedRefractoriness('AV_NODE', ev.timestamp + 260);
          pendingVviStimulusId = null;
          scheduleNextVviEscape(ev.timestamp);
        }

        // Evaluate capture as a separate physiological event
        const captured = config.device.captureSuccessProbability >= 0.5;
        if (captured) {
          queue.enqueue({
            id: nextId('ev_capture_ok'),
            type: 'CAPTURE_SUCCESS',
            timestamp: ev.timestamp + 2,
            priority: 12,
            parentEventId: ev.id,
            triggerEventId: ev.id,
            chamber: ev.chamber,
            stimulusEventId: ev.id,
          });
        } else {
          queue.enqueue({
            id: nextId('ev_capture_fail'),
            type: 'CAPTURE_FAILURE',
            timestamp: ev.timestamp + 2,
            priority: 12,
            parentEventId: ev.id,
            triggerEventId: ev.id,
            chamber: ev.chamber,
            stimulusEventId: ev.id,
            reason: 'SUBTHRESHOLD_OUTPUT',
          });
        }
        break;
      }

      case 'CAPTURE_SUCCESS': {
        if (ev.chamber === 'ATRIUM') {
          const pDur = config.pDurationMs;
          const pEpId = nextId('ep_p_paced');
          episodes.push({
            id: pEpId,
            type: 'ATRIAL_ACTIVATION',
            startTime: ev.timestamp,
            duration: pDur,
            endTime: ev.timestamp + pDur,
            sourceEventId: ev.id,
            rootImpulseEventId: ev.triggerEventId ?? ev.id,
            recipeVariant: 'NORMAL_SINUS',
            amplitudeScale: config.pAmplitudeScale,
            axisOffsetDeg: 0,
          });
          episodes.push({
            id: nextId('ep_a_mech_paced'),
            type: 'ATRIAL_CONTRACTION',
            startTime: ev.timestamp + 20,
            duration: 110,
            endTime: ev.timestamp + 130,
            sourceEventId: ev.id,
            rootImpulseEventId: ev.triggerEventId ?? ev.id,
            electricalEpisodeId: pEpId,
          });
          annotations.push({
            id: nextId('ann_p_paced'),
            label: 'P',
            onsetMs: ev.timestamp,
            peakMs: ev.timestamp + pDur * 0.45,
            offsetMs: ev.timestamp + pDur,
            linkedEpisodeId: pEpId,
            linkedEventId: ev.id,
          });
        } else {
          emitVentricularActivation(
            ev.timestamp,
            ev,
            ev.triggerEventId ?? ev.id,
            'PACED_RV_APEX'
          );
        }
        break;
      }

      case 'CONDUCTION_ATTEMPT': {
        const res = conduction.attemptConduction(ev.pathId, ev.timestamp);
        const rootId = ev.triggerEventId ?? ev.parentEventId ?? ev.id;

        if (!res.conducted) {
          const blockedEv = queue.enqueue({
            id: nextId('ev_blocked'),
            type: 'CONDUCTION_BLOCKED',
            timestamp: ev.timestamp,
            priority: 22,
            parentEventId: ev.id,
            triggerEventId: rootId,
            pathId: ev.pathId,
            reason: res.reason,
          });

          if (
            (ev.pathId === 'AV_NODE' || ev.pathId === 'HIS') &&
            ev.originImpulseType === 'SINUS'
          ) {
            annotations.push({
              id: nextId('ann_blocked_p'),
              label: 'BLOCKED_P',
              onsetMs: ev.timestamp,
              peakMs: ev.timestamp,
              offsetMs: ev.timestamp + 20,
              linkedEventId: blockedEv.id,
              description: `Blocked at ${ev.pathId} (${res.reason})`,
            });
          }
          break;
        }

        // In AF, concealed penetration and autonomic modulation jitter the AV nodal refractory window
        if (
          ev.pathId === 'AV_NODE' &&
          ev.originImpulseType === 'AF' &&
          afSource &&
          afSource.type === 'ATRIAL_FIBRILLATION'
        ) {
          const meanTargetRr =
            60000 / clamp(afSource.meanVentricularResponseBpm, 45, 190);
          const dynamicRefractoryOffset = afConductionRng!.nextRange(
            meanTargetRr * (1 - afSource.irregularityIndex * 1.35),
            meanTargetRr * (1 + afSource.irregularityIndex * 1.35)
          );
          conduction.imposeConcealedRefractoriness(
            'AV_NODE',
            ev.timestamp +
              dynamicRefractoryOffset -
              config.conductionNetwork.AV_NODE.refractoryPeriodMs
          );
        }

        // Conduction succeeded!
        const successEv = queue.enqueue({
          id: nextId('ev_cond_ok'),
          type: 'CONDUCTION_SUCCESS',
          timestamp: ev.timestamp + res.delayMs,
          priority: 21,
          parentEventId: ev.id,
          triggerEventId: rootId,
          pathId: ev.pathId,
          fromNode: ev.fromNode,
          toNode: ev.toNode,
          delayMs: res.delayMs,
          originImpulseType: ev.originImpulseType,
        });

        // Advance to next stage in Conduction Network
        if (ev.pathId === 'SA_EXIT') {
          const pOnset = ev.timestamp + res.delayMs;
          const pDur = config.pDurationMs;
          const pEpId = nextId('ep_p');
          episodes.push({
            id: pEpId,
            type: 'ATRIAL_ACTIVATION',
            startTime: pOnset,
            duration: pDur,
            endTime: pOnset + pDur,
            sourceEventId: successEv.id,
            rootImpulseEventId: rootId,
            recipeVariant: 'NORMAL_SINUS',
            amplitudeScale: config.pAmplitudeScale,
            axisOffsetDeg: config.pAxisDeg - 50,
          });
          episodes.push({
            id: nextId('ep_a_repol'),
            type: 'ATRIAL_REPOLARIZATION',
            startTime: pOnset + pDur * 0.55,
            duration: Math.max(75, config.prIntervalMs - pDur * 0.48),
            endTime:
              pOnset +
              pDur * 0.55 +
              Math.max(75, config.prIntervalMs - pDur * 0.48),
            amplitudeScale: 1.0,
            sourceEventId: successEv.id,
            rootImpulseEventId: rootId,
          });
          episodes.push({
            id: nextId('ep_a_mech'),
            type: 'ATRIAL_CONTRACTION',
            startTime: pOnset + 20,
            duration: 110,
            endTime: pOnset + 130,
            sourceEventId: successEv.id,
            rootImpulseEventId: rootId,
            electricalEpisodeId: pEpId,
          });
          annotations.push({
            id: nextId('ann_p'),
            label: 'P',
            onsetMs: pOnset,
            peakMs: pOnset + pDur * 0.45,
            offsetMs: pOnset + pDur,
            linkedEpisodeId: pEpId,
            linkedEventId: successEv.id,
          });

          const atriaDelay = config.conductionNetwork.ATRIA.baseDelayMs;

          // Parallel Route 1: Accessory Pathway (Bundle of Kent) if enabled (WPW)
          // Intra-atrial transit to AV ring (~58 ms) + Kent bundle transit (~37 ms) = 95 ms short PR
          if (config.conductionNetwork.ACCESSORY_PATHWAY.enabled) {
            queue.enqueue({
              id: nextId('ev_kent_attempt'),
              type: 'CONDUCTION_ATTEMPT',
              timestamp: pOnset + atriaDelay * 1.65,
              priority: 19,
              parentEventId: successEv.id,
              triggerEventId: rootId,
              pathId: 'ACCESSORY_PATHWAY',
              fromNode: 'ATRIA',
              toNode: 'VENTRICULAR_MYOCARDIUM',
              originImpulseType: ev.originImpulseType,
            });
          }

          // Parallel Route 2: Normal AV Node Pathway
          queue.enqueue({
            id: nextId('ev_av_attempt'),
            type: 'CONDUCTION_ATTEMPT',
            timestamp: pOnset + atriaDelay,
            priority: 20,
            parentEventId: successEv.id,
            triggerEventId: rootId,
            pathId: 'AV_NODE',
            fromNode: 'ATRIA',
            toNode: 'HIS',
            originImpulseType: ev.originImpulseType,
          });
        } else if (ev.pathId === 'ACCESSORY_PATHWAY') {
          // Early ventricular recruitment via Accessory Pathway (Delta wave onset precedes His-Purkinje)
          const deltaOnset = ev.timestamp + res.delayMs;
          preexcitedRootImpulseIds.add(rootId);
          emitVentricularActivation(
            deltaOnset,
            successEv,
            rootId,
            'WPW_PREEXCITED'
          );
        } else if (ev.pathId === 'AV_NODE') {
          queue.enqueue({
            id: nextId('ev_his_attempt'),
            type: 'CONDUCTION_ATTEMPT',
            timestamp: ev.timestamp + res.delayMs,
            priority: 20,
            parentEventId: successEv.id,
            triggerEventId: rootId,
            pathId: 'HIS',
            fromNode: 'AV_NODE',
            toNode: 'PURKINJE',
            originImpulseType: ev.originImpulseType,
          });
        } else if (ev.pathId === 'HIS') {
          // If Accessory Pathway already pre-excited the ventricle for this atrial impulse,
          // the His-Purkinje wavefront fuses into the ongoing WPW_PREEXCITED episode (no duplicate QRS episode)
          if (preexcitedRootImpulseIds.has(rootId)) {
            break;
          }
          const bundleDelay = Math.min(
            config.conductionNetwork.RIGHT_BUNDLE.baseDelayMs,
            config.conductionNetwork.LEFT_BUNDLE.baseDelayMs
          );
          const purkinjeDelay = config.conductionNetwork.PURKINJE.baseDelayMs;
          const qrsOnset =
            ev.timestamp + res.delayMs + bundleDelay + purkinjeDelay;
          emitVentricularActivation(qrsOnset, successEv, rootId);
        }
        break;
      }

      case 'CONDUCTION_SUCCESS':
      case 'CONDUCTION_BLOCKED':
      case 'PACEMAKER_SENSE':
      case 'CAPTURE_FAILURE':
        break;
    }
  }

  return {
    durationMs,
    events,
    episodes,
    annotations,
  };
}
