/**
 * Morphology Recipes (Template + Vector Hybrid)
 *
 * Each wave/segment is defined as a superposition of spatiotemporal source components:
 *   Component_i(t) = TemporalKernel_i(x_i) * SpatialSourceVector_i * Magnitude_i
 *
 * NO lead names (V1, V6, LeadII, etc.) are allowed in any morphology recipe.
 * Surface waves (Q, R, S, R', notch, biphasic P) emerge solely by projecting the sum of
 * these 3D + regional cardiac source components through the LeadField.
 */

import { CardiacSourceState } from '../core/types';
import { degToRad } from '../core/units';
import { TemporalKernel } from './kernels';

export type SpatialSourceComponent = {
  id: string;
  description: string;
  startFraction: number;
  durationFraction: number;
  magnitude: number;
  kernel: TemporalKernel;
  spatialDirection: CardiacSourceState;
};

export type ActivationRecipe = {
  id: string;
  name: string;
  referenceAxisDeg: number;
  components: SpatialSourceComponent[];
};

export type STSegmentRecipe = {
  id: string;
  enabled: boolean;
  injurySource: CardiacSourceState;
  magnitudeMv: number;
  plateauSlope: number;
  jWaveComponent?: {
    enabled: boolean;
    durationFraction: number;
    magnitude: number;
    kernel: TemporalKernel;
    spatialDirection: CardiacSourceState;
  };
};

export type RepolarizationRecipe = {
  id: string;
  referenceTAxisDeg: number;
  components: SpatialSourceComponent[];
};

export type UWaveRecipe = {
  enabled: boolean;
  delayAfterTEndMs: number;
  durationMs: number;
  magnitude: number;
  spatialDirection: CardiacSourceState;
};

export function makeSpatialDirection(
  frontalDeg: number,
  z: number,
  xyNorm = 1.0,
  regional: Partial<CardiacSourceState['regional']> = {}
): CardiacSourceState {
  const rad = degToRad(frontalDeg);
  return {
    global: {
      x: xyNorm * Math.cos(rad),
      y: xyNorm * Math.sin(rad),
      z,
    },
    regional: {
      septal: regional.septal ?? 0,
      rvAnterior: regional.rvAnterior ?? 0,
      lvLateral: regional.lvLateral ?? 0,
      inferior: regional.inferior ?? 0,
      posterobasal: regional.posterobasal ?? 0,
    },
  };
}

/**
 * ============================================================================
 * 1. ATRIAL ACTIVATION RECIPES (P Wave: Sinus, Ectopic, P Pulmonale, P Mitrale)
 * ============================================================================
 */
export const CANONICAL_ATRIAL_RECIPE: ActivationRecipe = {
  id: 'ATRIAL_NORMAL_SINUS',
  name: 'Canonical Sinus Atrial Activation (P_RA + P_LA)',
  referenceAxisDeg: 50,
  components: [
    {
      id: 'P_RA',
      description: 'Right atrial depolarization (anterior-inferior-leftward)',
      startFraction: 0.0,
      durationFraction: 0.75,
      magnitude: 0.14,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.8 },
      spatialDirection: makeSpatialDirection(62, +0.42, 0.9, {
        rvAnterior: +0.28,
      }),
    },
    {
      id: 'P_LA',
      description: 'Left atrial depolarization (posterior-leftward-inferior)',
      startFraction: 0.25,
      durationFraction: 0.75,
      magnitude: 0.12,
      kernel: { type: 'BETA', alpha: 2.8, beta: 2.6 },
      spatialDirection: makeSpatialDirection(38, -0.46, 0.9, {
        posterobasal: +0.22,
      }),
    },
  ],
};

export const ECTOPIC_ATRIAL_RECIPE: ActivationRecipe = {
  id: 'ATRIAL_ECTOPIC_FOCUS',
  name: 'Ectopic Atrial Activation (Abnormal P axis & sequence)',
  referenceAxisDeg: -25,
  components: [
    {
      id: 'P_ECTOPIC_EARLY',
      description: 'Low/ectopic atrial initial activation',
      startFraction: 0.0,
      durationFraction: 0.7,
      magnitude: 0.12,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.8 },
      spatialDirection: makeSpatialDirection(-30, +0.2, 0.9, {
        inferior: -0.2,
      }),
    },
    {
      id: 'P_ECTOPIC_LATE',
      description: 'Contralateral atrial completion',
      startFraction: 0.28,
      durationFraction: 0.72,
      magnitude: 0.11,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.5 },
      spatialDirection: makeSpatialDirection(-20, -0.3, 0.85),
    },
  ],
};

/**
 * Right Atrial Enlargement / Overload (P pulmonale):
 * Tall peaked P wave (>= 0.25 mV in II/III/aVF) with normal P duration (~100 ms)
 */
export const ATRIAL_P_PULMONALE_RECIPE: ActivationRecipe = {
  id: 'ATRIAL_P_PULMONALE',
  name: 'Right Atrial Overload (P pulmonale - Tall Peaked P_RA)',
  referenceAxisDeg: 68,
  components: [
    {
      id: 'P_RA_HYPERTROPHIED',
      description: 'Augmented anterior-inferior right atrial depolarization',
      startFraction: 0.0,
      durationFraction: 0.78,
      magnitude: 0.34,
      kernel: { type: 'BETA', alpha: 3.5, beta: 3.4 },
      spatialDirection: makeSpatialDirection(72, +0.62, 1.05, {
        rvAnterior: +0.52,
        inferior: +0.55,
      }),
    },
    {
      id: 'P_LA_NORMAL',
      description: 'Normal left atrial depolarization',
      startFraction: 0.28,
      durationFraction: 0.72,
      magnitude: 0.11,
      kernel: { type: 'BETA', alpha: 2.8, beta: 2.6 },
      spatialDirection: makeSpatialDirection(45, -0.35, 0.85, {
        posterobasal: +0.18,
      }),
    },
  ],
};

/**
 * Left Atrial Enlargement / Overload (P mitrale):
 * Broad (>= 120 ms, e.g. 134 ms) bifid M-shaped P wave in Lead II + deep terminal negative P component in V1
 */
export const ATRIAL_P_MITRALE_RECIPE: ActivationRecipe = {
  id: 'ATRIAL_P_MITRALE',
  name: 'Left Atrial Overload (P mitrale - Delayed Posterior-Leftward P_LA)',
  referenceAxisDeg: 40,
  components: [
    {
      id: 'P_RA_FIRST_PEAK',
      description: 'Initial right atrial depolarization (First peak of bifid P)',
      startFraction: 0.0,
      durationFraction: 0.52,
      magnitude: 0.15,
      kernel: { type: 'BETA', alpha: 3.1, beta: 3.2 },
      spatialDirection: makeSpatialDirection(62, +0.44, 0.92, {
        rvAnterior: +0.32,
        inferior: +0.25,
      }),
    },
    {
      id: 'P_LA_DELAYED_SECOND_PEAK',
      description: 'Delayed & enlarged posterior-leftward LA activation (Second peak in II + deep negative terminal V1)',
      startFraction: 0.42,
      durationFraction: 0.58,
      magnitude: 0.21,
      kernel: { type: 'BETA', alpha: 3.2, beta: 3.0 },
      spatialDirection: makeSpatialDirection(32, -0.82, 0.96, {
        rvAnterior: -0.62,
        septal: -0.35,
        lvLateral: +0.35,
        posterobasal: +0.55,
      }),
    },
  ],
};

/**
 * ============================================================================
 * 2. VENTRICULAR ACTIVATION RECIPES (QRS Complex)
 * ============================================================================
 */
export const CANONICAL_NORMAL_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_NORMAL_PURKINJE',
  name: 'Canonical 4-Component Normal Ventricular Activation',
  referenceAxisDeg: 60,
  components: [
    {
      id: 'QRS_A_SEPTAL',
      description: 'Initial left-to-right anterior septal depolarization (0-25 ms)',
      startFraction: 0.0,
      durationFraction: 25 / 90,
      magnitude: 0.34,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.6 },
      spatialDirection: {
        global: { x: -0.45, y: -0.18, z: +0.72 },
        regional: {
          septal: +0.85,
          rvAnterior: +0.35,
          lvLateral: -0.28,
          inferior: -0.1,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'QRS_B_EARLY',
      description: 'Early paraseptal & apical anterior activation (10-45 ms)',
      startFraction: 10 / 90,
      durationFraction: 35 / 90,
      magnitude: 0.78,
      kernel: { type: 'BETA', alpha: 2.5, beta: 2.5 },
      spatialDirection: {
        global: { x: +0.48, y: +0.78, z: +0.62 },
        regional: {
          septal: +0.35,
          rvAnterior: +0.52,
          lvLateral: +0.18,
          inferior: +0.35,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'QRS_C_MAIN_LV',
      description: 'Main LV myocardium activation towards +60 deg & posterior (25-75 ms)',
      startFraction: 25 / 90,
      durationFraction: 50 / 90,
      magnitude: 1.68,
      kernel: { type: 'BETA', alpha: 2.7, beta: 2.7 },
      spatialDirection: {
        global: { x: +0.54, y: +0.94, z: -0.78 },
        regional: {
          septal: -0.48,
          rvAnterior: -0.62,
          lvLateral: +0.92,
          inferior: +0.48,
          posterobasal: +0.22,
        },
      },
    },
    {
      id: 'QRS_D_TERMINAL',
      description: 'Terminal posterobasal LV and basal septum activation (60-90 ms)',
      startFraction: 60 / 90,
      durationFraction: 30 / 90,
      magnitude: 0.36,
      kernel: { type: 'BETA', alpha: 2.4, beta: 2.8 },
      spatialDirection: {
        global: { x: -0.22, y: -0.12, z: -0.58 },
        regional: {
          septal: -0.2,
          rvAnterior: -0.25,
          lvLateral: -0.22,
          inferior: -0.15,
          posterobasal: +0.65,
        },
      },
    },
  ],
};

/**
 * RBBB Recipe (Duration ~138 ms):
 * Retains normal early septal (A) and LV (B, C) activation via intact left bundle,
 * then appends slow cell-to-cell delayed RV anterior/outflow activation (46-138 ms).
 * Strengthened rightward/anterior terminal component ensures wide slurred S in I, V5, V6 and rsR' in V1-V2.
 */
export const RBBB_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_RBBB',
  name: 'Right Bundle Branch Block Activation (Normal early + Wide Delayed RV)',
  referenceAxisDeg: 60,
  components: [
    {
      id: 'QRS_A_SEPTAL',
      description: 'Preserved left-to-right initial septal depolarization (0-25 ms)',
      startFraction: 0.0,
      durationFraction: 25 / 138,
      magnitude: 0.36,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.6 },
      spatialDirection: CANONICAL_NORMAL_QRS_RECIPE.components[0]!.spatialDirection,
    },
    {
      id: 'QRS_B_EARLY',
      description: 'Early apical activation (10-44 ms)',
      startFraction: 10 / 138,
      durationFraction: 34 / 138,
      magnitude: 0.72,
      kernel: { type: 'BETA', alpha: 2.5, beta: 2.5 },
      spatialDirection: CANONICAL_NORMAL_QRS_RECIPE.components[1]!.spatialDirection,
    },
    {
      id: 'QRS_C_MAIN_LV',
      description: 'Unopposed LV dominance (20-66 ms)',
      startFraction: 20 / 138,
      durationFraction: 46 / 138,
      magnitude: 0.82,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: CANONICAL_NORMAL_QRS_RECIPE.components[2]!.spatialDirection,
    },
    {
      id: 'QRS_RBBB_DELAYED_RV',
      description: 'Slow cell-to-cell delayed right ventricular free-wall & outflow activation (44-138 ms -> moderate slurred S in I/aVL/V5/V6, rsR prime in V1)',
      startFraction: 44 / 138,
      durationFraction: 94 / 138,
      magnitude: 0.54,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.0 },
      spatialDirection: {
        global: { x: -0.65, y: -0.10, z: +0.86 },
        regional: {
          septal: +0.45,
          rvAnterior: +1.20,
          lvLateral: -0.38,
          inferior: -0.20,
          posterobasal: -0.15,
        },
      },
    },
  ],
};

/**
 * LBBB Recipe (Duration ~142 ms):
 * Replaces normal left-to-right septal sequence completely.
 * Broad overlapping transseptal + delayed posterolateral LV activation produces a broad monophasic / plateau-topped R
 * with subtle slurring in I/aVL/V5/V6 (without artificial deep cleft) and deep QS/rS in V1-V2.
 */
export const LBBB_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_LBBB',
  name: 'Left Bundle Branch Block Activation (Broad Monophasic/Slurred Lateral R & Deep V1 QS)',
  referenceAxisDeg: 15,
  components: [
    {
      id: 'LBBB_1_RV_INIT',
      description: 'Abnormal right-to-left & inferior-posterior initiation via right bundle (0-34 ms, absent lateral q)',
      startFraction: 0.0,
      durationFraction: 34 / 142,
      magnitude: 0.55,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.4 },
      spatialDirection: {
        global: { x: +0.55, y: +0.28, z: -0.52 },
        regional: {
          septal: -0.48,
          rvAnterior: -0.45,
          lvLateral: +0.52,
          inferior: +0.18,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'LBBB_2_TRANSSEPTAL',
      description: 'Broad right-to-left transseptal myocardial activation (10-100 ms)',
      startFraction: 10 / 142,
      durationFraction: 90 / 142,
      magnitude: 1.38,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.3 },
      spatialDirection: {
        global: { x: +0.84, y: +0.24, z: -0.88 },
        regional: {
          septal: -0.78,
          rvAnterior: -0.86,
          lvLateral: +0.92,
          inferior: +0.16,
          posterobasal: +0.28,
        },
      },
    },
    {
      id: 'LBBB_3_DELAYED_LV',
      description: 'Overlapping late posterolateral LV free-wall plateau/slur (44-142 ms)',
      startFraction: 44 / 142,
      durationFraction: 98 / 142,
      magnitude: 1.42,
      kernel: { type: 'BETA', alpha: 2.4, beta: 2.3 },
      spatialDirection: {
        global: { x: +0.88, y: +0.12, z: -0.82 },
        regional: {
          septal: -0.72,
          rvAnterior: -0.80,
          lvLateral: +1.05,
          inferior: +0.10,
          posterobasal: +0.48,
        },
      },
    },
  ],
};

/**
 * LAFB (Left Anterior Fascicular Block, Duration ~104 ms):
 * Early r in II/III/aVF & q in I/aVL, followed by strong superior-leftward sweep (-52 deg) -> rS in II/III/aVF, qR in I/aVL.
 */
export const LAFB_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_LAFB',
  name: 'Left Anterior Fascicular Block Activation',
  referenceAxisDeg: -52,
  components: [
    {
      id: 'LAFB_EARLY_LPF',
      description: 'Initial activation via intact left posterior fascicle (inferior-rightward, 0-36 ms)',
      startFraction: 0.0,
      durationFraction: 36 / 104,
      magnitude: 0.62,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.8 },
      spatialDirection: makeSpatialDirection(118, +0.45, 0.92, {
        septal: +0.55,
        inferior: +0.52,
        lvLateral: -0.28,
      }),
    },
    {
      id: 'LAFB_MAIN_SUPERIOR_LEFT',
      description: 'Delayed unopposed superior-leftward sweep (28-104 ms)',
      startFraction: 28 / 104,
      durationFraction: 76 / 104,
      magnitude: 1.78,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: makeSpatialDirection(-56, -0.58, 1.08, {
        septal: -0.35,
        rvAnterior: -0.42,
        lvLateral: +0.88,
        inferior: -0.82,
      }),
    },
  ],
};

/**
 * LPFB (Left Posterior Fascicular Block, Duration ~104 ms):
 * Early r in I/aVL & q in II/III/aVF, followed by strong inferior-rightward sweep (+118 deg) -> rS in I/aVL, qR in II/III/aVF.
 */
export const LPFB_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_LPFB',
  name: 'Left Posterior Fascicular Block Activation',
  referenceAxisDeg: 118,
  components: [
    {
      id: 'LPFB_EARLY_LAF',
      description: 'Initial activation via intact left anterior fascicle (superior-leftward, 0-36 ms)',
      startFraction: 0.0,
      durationFraction: 36 / 104,
      magnitude: 0.60,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.8 },
      spatialDirection: makeSpatialDirection(-48, +0.42, 0.88, {
        septal: +0.45,
        lvLateral: +0.38,
        inferior: -0.32,
      }),
    },
    {
      id: 'LPFB_MAIN_INFERIOR_RIGHT',
      description: 'Delayed inferior-rightward sweep across posteroinferior LV (28-104 ms)',
      startFraction: 28 / 104,
      durationFraction: 76 / 104,
      magnitude: 1.78,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: makeSpatialDirection(120, -0.45, 1.08, {
        septal: -0.25,
        rvAnterior: -0.22,
        lvLateral: -0.42,
        inferior: +0.94,
        posterobasal: +0.45,
      }),
    },
  ],
};

/**
 * Ectopic / PVC / Escape Ventricular Activation (Wide QRS ~145 ms)
 */
export const ECTOPIC_RV_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_ECTOPIC_RV',
  name: 'Ventricular Ectopic / Escape Activation (Slow Myocardial Spread)',
  referenceAxisDeg: 75,
  components: [
    {
      id: 'PVC_EARLY_SLUR',
      description: 'Initial focal myocardial spread from ectopic RV site (0-65 ms)',
      startFraction: 0.0,
      durationFraction: 65 / 145,
      magnitude: 0.95,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.6 },
      spatialDirection: {
        global: { x: +0.38, y: +0.85, z: -0.55 },
        regional: {
          septal: -0.45,
          rvAnterior: -0.55,
          lvLateral: +0.55,
          inferior: +0.65,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'PVC_LATE_LV_BULK',
      description: 'Broad late trans-myocardial activation of contralateral LV (45-145 ms)',
      startFraction: 45 / 145,
      durationFraction: 100 / 145,
      magnitude: 1.85,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.4 },
      spatialDirection: {
        global: { x: +0.65, y: +0.78, z: -0.88 },
        regional: {
          septal: -0.72,
          rvAnterior: -0.85,
          lvLateral: +1.1,
          inferior: +0.55,
          posterobasal: +0.45,
        },
      },
    },
  ],
};

/**
 * Dedicated RV Apical Pacing Recipe (PACEMAKER_VVI / PACEMAKER_DDD, ~150 ms):
 * Activation starts at the RV apex and spreads superiorly (-60 deg), posteriorly (-Z), and leftward (+X).
 * Guarantees strongly negative LBBB-like QS morphology in V1–V3 and superior-leftward axis (negative II/III/aVF, positive I/aVL).
 */
export const PACED_RV_APEX_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_PACED_RV_APEX',
  name: 'RV Apical Paced Ventricular Activation (LBBB-like Negative V1 & Superior Axis)',
  referenceAxisDeg: -60,
  components: [
    {
      id: 'PACED_RV_EARLY',
      description: 'Initial myocardial spread away from RV apex (posterior-superior-leftward, 0-70 ms)',
      startFraction: 0.0,
      durationFraction: 70 / 150,
      magnitude: 1.05,
      kernel: { type: 'BETA', alpha: 2.1, beta: 2.5 },
      spatialDirection: {
        global: { x: +0.52, y: -0.75, z: -0.88 },
        regional: {
          septal: -0.78,
          rvAnterior: -1.05,
          lvLateral: +0.62,
          inferior: -0.72,
          posterobasal: +0.25,
        },
      },
    },
    {
      id: 'PACED_RV_LATE_LV',
      description: 'Delayed transseptal & lateral LV free-wall completion (45-150 ms)',
      startFraction: 45 / 150,
      durationFraction: 105 / 150,
      magnitude: 1.75,
      kernel: { type: 'BETA', alpha: 2.5, beta: 2.4 },
      spatialDirection: {
        global: { x: +0.74, y: -0.78, z: -0.96 },
        regional: {
          septal: -0.85,
          rvAnterior: -1.18,
          lvLateral: +0.98,
          inferior: -0.82,
          posterobasal: +0.42,
        },
      },
    },
  ],
};

/**
 * WPW Pre-excited Activation (Delta wave fusion + normal His-Purkinje completion, ~128 ms)
 */
export const WPW_PREEXCITED_QRS_RECIPE: ActivationRecipe = {
  id: 'QRS_WPW_PREEXCITED',
  name: 'WPW Accessory Pathway Pre-excitation (Classic Type A: Distinct Slurred Delta Upstroke ⊿ & Sharp Tall R)',
  referenceAxisDeg: 60,
  components: [
    {
      id: 'WPW_DELTA_WAVE',
      description: 'Accessory pathway myocardial pre-excitation (slurred initial upstroke ⊿, distinct shoulder 0-36 ms)',
      startFraction: 0.0,
      durationFraction: 36 / 126,
      magnitude: 0.22,
      kernel: { type: 'BETA', alpha: 2.0, beta: 1.6 },
      spatialDirection: {
        global: { x: +0.08, y: +0.55, z: +0.82 },
        regional: {
          septal: +0.45,
          rvAnterior: +0.80,
          lvLateral: +0.25,
          inferior: +0.35,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'WPW_FUSION_MAIN',
      description: 'Rapid His-Purkinje ventricular activation fusion (sharp steep upstroke & tall R wave in V1 & lateral leads, 22-115 ms)',
      startFraction: 22 / 126,
      durationFraction: 93 / 126,
      magnitude: 1.68,
      kernel: { type: 'BETA', alpha: 2.8, beta: 2.8 },
      spatialDirection: {
        global: { x: +0.28, y: +0.85, z: +0.65 },
        regional: {
          septal: +0.35,
          rvAnterior: +0.75,
          lvLateral: +0.65,
          inferior: +0.48,
          posterobasal: -0.10,
        },
      },
    },
  ],
};

/**
 * Left Ventricular Hypertrophy (LVH_WITH_STRAIN, ~102 ms):
 * Augmented posterior-leftward LV dipole producing deep S in V1-V2 + tall R in V5-V6 (S_V1 + R_V5 > 3.5 mV).
 */
export const QRS_LVH_RECIPE: ActivationRecipe = {
  id: 'QRS_LVH',
  name: 'Left Ventricular Hypertrophy Activation (High Precordial LV Voltage)',
  referenceAxisDeg: 25,
  components: [
    CANONICAL_NORMAL_QRS_RECIPE.components[0]!,
    CANONICAL_NORMAL_QRS_RECIPE.components[1]!,
    {
      id: 'QRS_C_HYPERTROPHIED_LV',
      description: 'Hypertrophied posterior-lateral LV wall depolarization (22-82 ms)',
      startFraction: 22 / 102,
      durationFraction: 60 / 102,
      magnitude: 2.65,
      kernel: { type: 'BETA', alpha: 2.7, beta: 2.6 },
      spatialDirection: {
        global: { x: +0.68, y: +0.42, z: -1.12 },
        regional: {
          septal: -0.82,
          rvAnterior: -1.15,
          lvLateral: +1.55,
          inferior: +0.28,
          posterobasal: +0.42,
        },
      },
    },
    CANONICAL_NORMAL_QRS_RECIPE.components[3]!,
  ],
};

/**
 * Right Ventricular Hypertrophy (RVH_WITH_STRAIN, ~98 ms):
 * Right axis deviation (+122 deg), tall dominant R wave in V1 (R/S > 1), and deep lateral S in I, V5, V6 with QRS < 120 ms.
 */
export const QRS_RVH_RECIPE: ActivationRecipe = {
  id: 'QRS_RVH',
  name: 'Right Ventricular Hypertrophy Activation (Tall V1 R, RAD, Deep Lateral S)',
  referenceAxisDeg: 122,
  components: [
    {
      id: 'RVH_SEPTAL_EARLY',
      description: 'Initial septal & anterior RV activation (0-28 ms)',
      startFraction: 0.0,
      durationFraction: 28 / 98,
      magnitude: 0.55,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.6 },
      spatialDirection: {
        global: { x: -0.35, y: +0.35, z: +0.85 },
        regional: {
          septal: +0.75,
          rvAnterior: +0.95,
          lvLateral: -0.35,
          inferior: +0.25,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'RVH_DOMINANT_RV_WALL',
      description: 'Dominant hypertrophied anterior-rightward RV wall depolarization (18-85 ms)',
      startFraction: 18 / 98,
      durationFraction: 67 / 98,
      magnitude: 1.95,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.5 },
      spatialDirection: {
        global: { x: -0.68, y: +0.82, z: +1.08 },
        regional: {
          septal: +0.65,
          rvAnterior: +1.48,
          lvLateral: -0.92,
          inferior: +0.55,
          posterobasal: -0.25,
        },
      },
    },
  ],
};

/**
 * Lateral MI (Acute & Prior):
 * Initial medial/rightward-inferior unopposed vector (0-42 ms) creates pathological Q wave in I, aVL, V5, V6,
 * followed by attenuated lateral R amplitude.
 */
export const QRS_LATERAL_MI_RECIPE: ActivationRecipe = {
  id: 'QRS_LATERAL_MI',
  name: 'Lateral Myocardial Infarction QRS (Pathological Lateral Q & Reduced Lateral R)',
  referenceAxisDeg: 78,
  components: [
    {
      id: 'LAT_MI_PATHOLOGICAL_Q',
      description: 'Unopposed initial rightward-inferior depolarization away from infarcted high-lateral LV (0-42 ms)',
      startFraction: 0.0,
      durationFraction: 42 / 94,
      magnitude: 0.85,
      kernel: { type: 'BETA', alpha: 2.2, beta: 2.5 },
      spatialDirection: {
        global: { x: -0.78, y: +0.52, z: +0.45 },
        regional: {
          septal: +0.55,
          rvAnterior: +0.42,
          lvLateral: -0.95,
          inferior: +0.45,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'LAT_MI_REMAINING_VENTRICLE',
      description: 'Remaining inferior/apical activation with attenuated lateral R (30-94 ms)',
      startFraction: 30 / 94,
      durationFraction: 64 / 94,
      magnitude: 1.25,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: {
        global: { x: +0.28, y: +0.92, z: -0.58 },
        regional: {
          septal: -0.35,
          rvAnterior: -0.45,
          lvLateral: +0.35,
          inferior: +0.65,
          posterobasal: +0.22,
        },
      },
    },
  ],
};

/**
 * Posterior MI (Acute & Prior):
 * Loss of posterior LV free-wall electrical force leaves anterior forces unopposed ->
 * tall, broad R waves (R/S > 1) in V1-V3 (mirror image of posterior pathological Q wave).
 */
export const QRS_POSTERIOR_MI_RECIPE: ActivationRecipe = {
  id: 'QRS_POSTERIOR_MI',
  name: 'Posterior Myocardial Infarction QRS (Unopposed Anterior Force -> Tall Broad R in V1-V3)',
  referenceAxisDeg: 55,
  components: [
    {
      id: 'POST_MI_ANTERIOR_R',
      description: 'Unopposed anterior depolarization (mirror image of posterior Q wave, 0-58 ms)',
      startFraction: 0.0,
      durationFraction: 58 / 96,
      magnitude: 1.35,
      kernel: { type: 'BETA', alpha: 2.4, beta: 2.4 },
      spatialDirection: {
        global: { x: +0.22, y: +0.45, z: +1.05 },
        regional: {
          septal: +0.85,
          rvAnterior: +1.25,
          lvLateral: +0.22,
          inferior: +0.25,
          posterobasal: -0.75,
        },
      },
    },
    {
      id: 'POST_MI_LATERAL_COMPLETION',
      description: 'Remaining lateral/apical LV depolarization (35-96 ms)',
      startFraction: 35 / 96,
      durationFraction: 61 / 96,
      magnitude: 1.35,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: {
        global: { x: +0.58, y: +0.82, z: -0.32 },
        regional: {
          septal: -0.18,
          rvAnterior: -0.22,
          lvLateral: +0.82,
          inferior: +0.45,
          posterobasal: -0.35,
        },
      },
    },
  ],
};

/**
 * Pediatric Neonate & Infant Normal QRS Recipes:
 * Physiological RV dominance in neonates (axis +125 deg, tall R in V1) and infants (axis +95 deg, R >= S in V1)
 */
export const QRS_PEDIATRIC_NEONATE_RECIPE: ActivationRecipe = {
  id: 'QRS_PEDIATRIC_NEONATE',
  name: 'Neonatal Physiological Right Ventricular Dominance (Axis +125 deg, Tall V1 R)',
  referenceAxisDeg: 125,
  components: [
    {
      id: 'NEO_EARLY_SEPTAL',
      description: 'Neonatal initial septal & anterior activation',
      startFraction: 0.0,
      durationFraction: 0.35,
      magnitude: 0.52,
      kernel: { type: 'BETA', alpha: 2.3, beta: 2.6 },
      spatialDirection: {
        global: { x: -0.32, y: +0.42, z: +0.82 },
        regional: {
          septal: +0.72,
          rvAnterior: +0.92,
          lvLateral: -0.28,
          inferior: +0.30,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'NEO_DOMINANT_RV',
      description: 'Physiological neonatal RV dominance (R > S in V1, deep lateral S in V5-V6)',
      startFraction: 0.2,
      durationFraction: 0.8,
      magnitude: 1.55,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.5 },
      spatialDirection: {
        global: { x: -0.58, y: +0.82, z: +0.98 },
        regional: {
          septal: +0.58,
          rvAnterior: +1.32,
          lvLateral: -0.78,
          inferior: +0.55,
          posterobasal: -0.18,
        },
      },
    },
  ],
};

export const QRS_PEDIATRIC_INFANT_RECIPE: ActivationRecipe = {
  id: 'QRS_PEDIATRIC_INFANT',
  name: 'Infant Physiological RV/LV Balance (Axis +95 deg, Prominent V1 R)',
  referenceAxisDeg: 95,
  components: [
    {
      id: 'INF_EARLY_ANTERIOR',
      description: 'Prominent anterior RV/septal R wave in V1-V2',
      startFraction: 0.0,
      durationFraction: 0.48,
      magnitude: 1.05,
      kernel: { type: 'BETA', alpha: 2.4, beta: 2.5 },
      spatialDirection: {
        global: { x: -0.18, y: +0.68, z: +0.92 },
        regional: {
          septal: +0.75,
          rvAnterior: +1.12,
          lvLateral: -0.18,
          inferior: +0.45,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'INF_DEVELOPING_LV',
      description: 'Growing LV activation (inferior-leftward)',
      startFraction: 0.3,
      durationFraction: 0.7,
      magnitude: 1.38,
      kernel: { type: 'BETA', alpha: 2.6, beta: 2.6 },
      spatialDirection: {
        global: { x: +0.28, y: +0.92, z: -0.48 },
        regional: {
          septal: -0.25,
          rvAnterior: -0.35,
          lvLateral: +0.72,
          inferior: +0.58,
          posterobasal: +0.18,
        },
      },
    },
  ],
};

/**
 * ============================================================================
 * 3. VENTRICULAR REPOLARIZATION RECIPES (T Wave)
 * ============================================================================
 */
export const CANONICAL_T_WAVE_RECIPE: RepolarizationRecipe = {
  id: 'REPOL_CANONICAL_NORMAL',
  referenceTAxisDeg: 45,
  components: [
    {
      id: 'T_MAIN',
      description: 'Primary ventricular repolarization wave (epicardial-to-endocardial gradient)',
      startFraction: 0.08,
      durationFraction: 0.82,
      magnitude: 0.38,
      kernel: { type: 'BETA', alpha: 3.4, beta: 2.3 },
      spatialDirection: {
        global: {
          x: Math.cos(degToRad(45)) * 0.85,
          y: Math.sin(degToRad(45)) * 0.85,
          z: +0.46,
        },
        regional: {
          septal: +0.06,
          rvAnterior: +0.36,
          lvLateral: +0.52,
          inferior: +0.32,
          posterobasal: 0,
        },
      },
    },
    {
      id: 'T_TERMINAL',
      description: 'Late apical/lateral repolarization completion',
      startFraction: 0.42,
      durationFraction: 0.56,
      magnitude: 0.15,
      kernel: { type: 'BETA', alpha: 3.8, beta: 2.2 },
      spatialDirection: {
        global: {
          x: Math.cos(degToRad(42)) * 0.85,
          y: Math.sin(degToRad(42)) * 0.85,
          z: +0.38,
        },
        regional: {
          septal: +0.04,
          rvAnterior: +0.28,
          lvLateral: +0.48,
          inferior: +0.25,
          posterobasal: 0,
        },
      },
    },
  ],
};

/**
 * Long QT Repolarization Recipe:
 * Broad, delayed, late-peaking T wave extending to the end of the prolonged repolarization window (QT ~ 495 ms, QTc ~ 520 ms)
 */
export const REPOL_LONG_QT_RECIPE: RepolarizationRecipe = {
  id: 'REPOL_LONG_QT',
  referenceTAxisDeg: 48,
  components: [
    {
      id: 'LQT_BROAD_MAIN',
      description: 'Delayed, broad ventricular repolarization wave (IKr/IKs prolongation profile)',
      startFraction: 0.22,
      durationFraction: 0.76,
      magnitude: 0.44,
      kernel: { type: 'BETA', alpha: 3.8, beta: 2.0 },
      spatialDirection: CANONICAL_T_WAVE_RECIPE.components[0]!.spatialDirection,
    },
    {
      id: 'LQT_LATE_TAIL',
      description: 'Late terminal repolarization tail extending T-end',
      startFraction: 0.54,
      durationFraction: 0.45,
      magnitude: 0.24,
      kernel: { type: 'BETA', alpha: 3.6, beta: 1.9 },
      spatialDirection: CANONICAL_T_WAVE_RECIPE.components[1]!.spatialDirection,
    },
  ],
};

/**
 * Posterior MI Acute Repolarization:
 * Tall, prominent upright positive T waves in V1-V3 (mirror image of posterior hyperacute/inverted T)
 */
export const REPOL_POSTERIOR_MI_ACUTE_RECIPE: RepolarizationRecipe = {
  id: 'REPOL_POSTERIOR_MI_ACUTE',
  referenceTAxisDeg: 50,
  components: [
    {
      id: 'POST_MI_T_ANTERIOR',
      description: 'Prominent anterior positive T wave in V1-V3 (posterior mirror)',
      startFraction: 0.08,
      durationFraction: 0.85,
      magnitude: 0.52,
      kernel: { type: 'BETA', alpha: 3.2, beta: 2.3 },
      spatialDirection: {
        global: { x: +0.52, y: +0.58, z: +0.88 },
        regional: {
          septal: +0.55,
          rvAnterior: +0.92,
          lvLateral: +0.42,
          inferior: +0.30,
          posterobasal: -0.55,
        },
      },
    },
  ],
};

/**
 * Juvenile T-Wave Pattern (Normal in Neonates, Infants, and Children):
 * Posteriorly directed repolarization vector (-Z, -rvAnterior) producing physiological negative T waves in V1-V3
 * while maintaining upright T waves in I, II, V5, V6.
 */
export const REPOL_JUVENILE_T_RECIPE: RepolarizationRecipe = {
  id: 'REPOL_JUVENILE_T',
  referenceTAxisDeg: 48,
  components: [
    {
      id: 'JUVENILE_T_MAIN',
      description: 'Physiological juvenile T wave (negative in V1-V3, upright in I/II/V5/V6)',
      startFraction: 0.08,
      durationFraction: 0.86,
      magnitude: 0.42,
      kernel: { type: 'BETA', alpha: 3.3, beta: 2.3 },
      spatialDirection: {
        global: {
          x: Math.cos(degToRad(48)) * 0.85,
          y: Math.sin(degToRad(48)) * 0.85,
          z: -0.62,
        },
        regional: {
          septal: -0.48,
          rvAnterior: -0.78,
          lvLateral: +0.58,
          inferior: +0.35,
          posterobasal: +0.22,
        },
      },
    },
  ],
};

export const DEFAULT_ST_RECIPE: STSegmentRecipe = {
  id: 'ST_ISOELECTRIC',
  enabled: false,
  injurySource: {
    global: { x: 0, y: 0, z: 0 },
    regional: {
      septal: 0,
      rvAnterior: 0,
      lvLateral: 0,
      inferior: 0,
      posterobasal: 0,
    },
  },
  magnitudeMv: 0,
  plateauSlope: 0,
};

export const DEFAULT_U_WAVE_RECIPE: UWaveRecipe = {
  enabled: false,
  delayAfterTEndMs: 10,
  durationMs: 140,
  magnitude: 0.0,
  spatialDirection: makeSpatialDirection(45, +0.25, 0.8, {
    rvAnterior: +0.25,
    lvLateral: +0.35,
  }),
};
