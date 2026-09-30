/**
 * Animation & Mechanical Integration Boundary Types
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * The 8-dimensional `CardiacSourceState` (Global XYZ + 5 regional modes) is an
 * ECG forward-projection source representation and MUST NOT be conflated with a
 * high-resolution 3D myocardial depolarization mesh or valve state model.
 *
 * Instead, both the ECG Source Model and any future 3D Heart Animation Engine consume
 * the same shared `MasterTimeline` (`PhysiologicalEvent[]` and `PhysiologicalEpisode[]`):
 *
 *   Master Timeline (Events & Episodes)
 *        ├──► ECG Source Model (`evaluateCardiacSourceAtTime` -> `CardiacSourceState`)
 *        └──► Animation Activation & Mechanical Model (`evaluateAnimationStateAtTime`)
 *
 * Note: Mechanical contraction timing (`ATRIAL_CONTRACTION`, `VENTRICULAR_CONTRACTION`)
 * in v1 is a simplified educational electromechanical delay model. Valve leaflet dynamics
 * are not modeled in `ecg-waveform-engine`.
 */

import { MasterTimeline } from '../timeline/events';

export type ChamberMechanicalPhase =
  | 'DIASTOLE_RELAXED'
  | 'ISOVOLUMIC_CONTRACTION_APPROX'
  | 'SYSTOLIC_CONTRACTION'
  | 'RELAXING';

export type RegionalActivationState = {
  saNodeActive: boolean;
  rightAtriumProgress: number; // [0, 1]
  leftAtriumProgress: number; // [0, 1]
  avNodeConductionActive: boolean;
  hisPurkinjeActive: boolean;
  septalActivationProgress: number; // [0, 1]
  rvActivationProgress: number; // [0, 1]
  lvActivationProgress: number; // [0, 1]
  ventricularRepolarizationProgress: number; // [0, 1]
};

export type MechanicalChamberState = {
  modelDisclaimer: 'simplified educational electromechanical timing model (valves not modeled)';
  atrialContractionFraction: number; // [0, 1]
  ventricularContractionFraction: number; // [0, 1]
  atrialPhase: ChamberMechanicalPhase;
  ventricularPhase: ChamberMechanicalPhase;
};

export type SynchronizedHeartAnimationFrame = {
  timestampMs: number;
  regionalActivation: RegionalActivationState;
  mechanicalState: MechanicalChamberState;
};

/**
 * Derives a high-level synchronized chamber activation & mechanical frame at `tMs`
 * from the shared MasterTimeline without conflating it with the ECG Lead-Field dipole.
 */
export function evaluateAnimationStateAtTime(
  tMs: number,
  timeline: MasterTimeline
): SynchronizedHeartAnimationFrame {
  let rightAtriumProgress = 0;
  let leftAtriumProgress = 0;
  let septalActivationProgress = 0;
  let rvActivationProgress = 0;
  let lvActivationProgress = 0;
  let ventricularRepolarizationProgress = 0;
  let atrialContractionFraction = 0;
  let ventricularContractionFraction = 0;

  for (const ep of timeline.episodes) {
    if (tMs < ep.startTime || tMs > ep.endTime || ep.duration <= 0) continue;
    const u = (tMs - ep.startTime) / ep.duration;

    switch (ep.type) {
      case 'ATRIAL_ACTIVATION':
        if (ep.recipeVariant === 'FLUTTER_WAVE') {
          // Continuous macro-reentrant cavotricuspid isthmus flutter loop
          rightAtriumProgress = Math.max(
            rightAtriumProgress,
            0.35 + 0.65 * Math.sin(Math.PI * u)
          );
          leftAtriumProgress = Math.max(
            leftAtriumProgress,
            u > 0.18 ? 0.3 + 0.65 * Math.sin(Math.PI * ((u - 0.18) / 0.82)) : 0.25
          );
        } else if (ep.recipeVariant === 'RETROGRADE') {
          // Retrograde concentric/eccentric atrial activation
          rightAtriumProgress = Math.max(rightAtriumProgress, Math.min(1, u / 0.7));
          leftAtriumProgress = Math.max(leftAtriumProgress, Math.min(1, u / 0.75));
        } else {
          rightAtriumProgress = Math.max(rightAtriumProgress, Math.min(1, u / 0.75));
          leftAtriumProgress = Math.max(
            leftAtriumProgress,
            u > 0.25 ? Math.min(1, (u - 0.25) / 0.75) : 0
          );
        }
        break;
      case 'FIBRILLATORY_BACKGROUND':
        if (ep.waveType === 'COARSE_AF') {
          // Disorganized atrial fibrillatory wavelets (no organized mechanical contraction)
          rightAtriumProgress = Math.max(
            rightAtriumProgress,
            Number((0.32 + 0.11 * Math.sin(tMs * 0.043)).toFixed(3))
          );
          leftAtriumProgress = Math.max(
            leftAtriumProgress,
            Number((0.29 + 0.11 * Math.cos(tMs * 0.051)).toFixed(3))
          );
        }
        break;
      case 'VENTRICULAR_ACTIVATION':
        if (ep.recipeVariant === 'RBBB') {
          septalActivationProgress = Math.max(septalActivationProgress, Math.min(1, u / 0.25));
          lvActivationProgress = Math.max(lvActivationProgress, Math.min(1, u / 0.55));
          rvActivationProgress = Math.max(
            rvActivationProgress,
            u > 0.38 ? Math.min(1, (u - 0.38) / 0.62) : 0
          );
        } else if (ep.recipeVariant === 'LBBB') {
          septalActivationProgress = Math.max(
            septalActivationProgress,
            u > 0.15 ? Math.min(1, (u - 0.15) / 0.45) : 0
          );
          rvActivationProgress = Math.max(rvActivationProgress, Math.min(1, u / 0.35));
          lvActivationProgress = Math.max(
            lvActivationProgress,
            u > 0.28 ? Math.min(1, (u - 0.28) / 0.72) : 0
          );
        } else if (ep.recipeVariant === 'WPW_PREEXCITED') {
          // Early accessory pathway pre-excitation (delta region u = 0..0.35) followed by His-Purkinje fusion
          septalActivationProgress = Math.max(
            septalActivationProgress,
            u > 0.22 ? Math.min(1, (u - 0.22) / 0.35) : u * 0.45
          );
          lvActivationProgress = Math.max(
            lvActivationProgress,
            u <= 0.35 ? (u / 0.35) * 0.42 : 0.42 + ((u - 0.35) / 0.65) * 0.58
          );
          rvActivationProgress = Math.max(
            rvActivationProgress,
            u > 0.2 ? Math.min(1, (u - 0.2) / 0.75) : u * 0.3
          );
        } else if (
          ep.recipeVariant === 'PACED_RV_APEX' ||
          ep.recipeVariant === 'ECTOPIC_RV' ||
          ep.recipeVariant === 'ESCAPE_IDIOVENTRICULAR'
        ) {
          // RV apical pacing / RV ectopic / idioventricular -> early RV activation, delayed transseptal LV activation
          rvActivationProgress = Math.max(rvActivationProgress, Math.min(1, u / 0.42));
          septalActivationProgress = Math.max(
            septalActivationProgress,
            u > 0.12 ? Math.min(1, (u - 0.12) / 0.45) : 0
          );
          lvActivationProgress = Math.max(
            lvActivationProgress,
            u > 0.28 ? Math.min(1, (u - 0.28) / 0.72) : 0
          );
        } else if (ep.recipeVariant === 'ECTOPIC_LV') {
          // LV ectopic -> early LV activation, delayed transseptal RV activation
          lvActivationProgress = Math.max(lvActivationProgress, Math.min(1, u / 0.42));
          septalActivationProgress = Math.max(
            septalActivationProgress,
            u > 0.12 ? Math.min(1, (u - 0.12) / 0.45) : 0
          );
          rvActivationProgress = Math.max(
            rvActivationProgress,
            u > 0.28 ? Math.min(1, (u - 0.28) / 0.72) : 0
          );
        } else {
          septalActivationProgress = Math.max(septalActivationProgress, Math.min(1, u / 0.3));
          rvActivationProgress = Math.max(rvActivationProgress, Math.min(1, u / 0.75));
          lvActivationProgress = Math.max(lvActivationProgress, Math.min(1, u / 0.85));
        }
        break;
      case 'VENTRICULAR_REPOLARIZATION':
        ventricularRepolarizationProgress = Math.max(ventricularRepolarizationProgress, u);
        break;
      case 'ATRIAL_CONTRACTION':
        atrialContractionFraction = Math.max(atrialContractionFraction, Math.sin(Math.PI * u));
        break;
      case 'VENTRICULAR_CONTRACTION':
        ventricularContractionFraction = Math.max(
          ventricularContractionFraction,
          Math.sin(Math.PI * u)
        );
        break;
      default:
        break;
    }
  }

  // Causal duration check for AV_NODE and HIS conduction attempts
  const avNodeConductionActive = timeline.events.some((e) => {
    if (e.type !== 'CONDUCTION_ATTEMPT' || e.pathId !== 'AV_NODE') return false;
    if (tMs < e.timestamp) return false;
    const childEv = timeline.events.find((c) => c.parentEventId === e.id);
    const endWindow = childEv ? childEv.timestamp : e.timestamp + 90;
    return tMs <= endWindow;
  });

  const hisPurkinjeActive = timeline.events.some((e) => {
    if (
      e.type !== 'CONDUCTION_ATTEMPT' ||
      (e.pathId !== 'HIS' && e.pathId !== 'ACCESSORY_PATHWAY')
    ) {
      return false;
    }
    if (tMs < e.timestamp) return false;
    const childEv = timeline.events.find((c) => c.parentEventId === e.id);
    const endWindow = childEv ? childEv.timestamp + 25 : e.timestamp + 35;
    return tMs <= endWindow;
  });

  return {
    timestampMs: tMs,
    regionalActivation: {
      saNodeActive: timeline.events.some(
        (e) => e.type === 'SINUS_IMPULSE' && Math.abs(e.timestamp - tMs) < 12
      ),
      rightAtriumProgress,
      leftAtriumProgress,
      avNodeConductionActive,
      hisPurkinjeActive,
      septalActivationProgress,
      rvActivationProgress,
      lvActivationProgress,
      ventricularRepolarizationProgress,
    },
    mechanicalState: {
      modelDisclaimer:
        'simplified educational electromechanical timing model (valves not modeled)',
      atrialContractionFraction,
      ventricularContractionFraction,
      atrialPhase:
        atrialContractionFraction > 0.05
          ? 'SYSTOLIC_CONTRACTION'
          : 'DIASTOLE_RELAXED',
      ventricularPhase:
        ventricularContractionFraction > 0.05
          ? 'SYSTOLIC_CONTRACTION'
          : 'DIASTOLE_RELAXED',
    },
  };
}
