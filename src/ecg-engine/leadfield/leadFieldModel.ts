/**
 * Lead-Field Forward Projection Model (canonicalLeadField.v1)
 *
 * IMPORTANT ARCHITECTURAL & SCIENTIFIC DISCLOSURE:
 * "This is a calibrated low-dimensional educational model,
 *  not a patient-specific torso forward solution."
 *
 * Maps the 8-dimensional Instantaneous CardiacSourceState:
 *   - Global 3D dipole vector (X: left, Y: inferior, Z: anterior)
 *   - 5 Regional proximity modes (septal, rvAnterior, lvLateral, inferior, posterobasal)
 * to the 9 physical body-surface electrode potentials:
 *   - Limb electrodes: RA, LA, LL
 *   - Precordial electrodes: C1, C2, C3, C4, C5, C6
 */

import {
  AnatomyOrientation,
  CardiacSourceState,
  ELECTRODE_NAMES,
  ElectrodeName,
  ElectrodePotentials,
} from '../core/types';

export type ElectrodeLeadFieldRow = {
  global: {
    x: number;
    y: number;
    z: number;
  };
  regional: {
    septal: number;
    rvAnterior: number;
    lvLateral: number;
    inferior: number;
    posterobasal: number;
  };
};

export type LeadFieldMatrix = {
  version: 'canonicalLeadField.v1';
  description: string;
  disclaimer: string;
  electrodes: Record<ElectrodeName, ElectrodeLeadFieldRow>;
};

const INV_SQRT3 = 1 / Math.sqrt(3); // ~0.577350269

/**
 * Calibrated Canonical Lead-Field Matrix v1 (`canonicalLeadField.v1`)
 *
 * Limb electrode global X/Y coefficients follow the exact Einthoven equilateral triangle
 * geometry centered on Wilson's Central Terminal (WCT = (RA + LA + LL)/3 = 0):
 *   RA = (-0.5 * X - (1 / (2*sqrt(3))) * Y)
 *   LA = (+0.5 * X - (1 / (2*sqrt(3))) * Y)
 *   LL = (  0.0 * X + (1 / sqrt(3))     * Y)
 * This guarantees exact frontal plane angle reproduction:
 *   Lead I   = LA - RA = 1.0 * X                       (0 deg)
 *   Lead II  = LL - RA = 0.5 * X + (sqrt(3)/2) * Y     (+60 deg)
 *   Lead III = LL - LA = -0.5 * X + (sqrt(3)/2) * Y    (+120 deg)
 *   aVF      = LL - (RA+LA)/2 = (sqrt(3)/2) * Y        (+90 deg)
 *
 * Precordial C1..C6 rows are calibrated via regularized Stage 1 + Stage 2 fitting
 * (smooth progression from V1 to V6, sparse regional sensitivity, WCT-referenced).
 */
export const CANONICAL_LEAD_FIELD_V1: LeadFieldMatrix = {
  version: 'canonicalLeadField.v1',
  description:
    'Calibrated 8-mode (3 global XYZ + 5 regional) to 9-electrode lead-field transfer matrix',
  disclaimer:
    'This is a calibrated low-dimensional educational model, not a patient-specific torso forward solution.',
  electrodes: {
    RA: {
      global: { x: -0.5, y: -0.5 * INV_SQRT3, z: 0.0 },
      regional: {
        septal: 0.0,
        rvAnterior: 0.0,
        lvLateral: -0.02,
        inferior: -0.02,
        posterobasal: 0.01,
      },
    },
    LA: {
      global: { x: +0.5, y: -0.5 * INV_SQRT3, z: 0.0 },
      regional: {
        septal: 0.0,
        rvAnterior: 0.0,
        lvLateral: +0.04,
        inferior: -0.02,
        posterobasal: 0.0,
      },
    },
    LL: {
      global: { x: 0.0, y: +1.0 * INV_SQRT3, z: 0.0 },
      regional: {
        septal: 0.0,
        rvAnterior: 0.0,
        lvLateral: -0.02,
        inferior: +0.04,
        posterobasal: -0.01,
      },
    },
    C1: {
      global: { x: -0.36, y: -0.06, z: +0.4 },
      regional: {
        septal: +0.28,
        rvAnterior: +0.28,
        lvLateral: -0.18,
        inferior: 0.0,
        posterobasal: -0.12,
      },
    },
    C2: {
      global: { x: -0.18, y: +0.02, z: +0.44 },
      regional: {
        septal: +0.22,
        rvAnterior: +0.22,
        lvLateral: -0.14,
        inferior: +0.02,
        posterobasal: -0.14,
      },
    },
    C3: {
      global: { x: +0.14, y: +0.16, z: +0.42 },
      regional: {
        septal: +0.24,
        rvAnterior: +0.02,
        lvLateral: -0.14,
        inferior: +0.04,
        posterobasal: -0.22,
      },
    },
    C4: {
      global: { x: +0.52, y: +0.34, z: +0.06 },
      regional: {
        septal: -0.05,
        rvAnterior: -0.04,
        lvLateral: +0.38,
        inferior: +0.14,
        posterobasal: -0.06,
      },
    },
    C5: {
      global: { x: +0.68, y: +0.28, z: -0.18 },
      regional: {
        septal: -0.22,
        rvAnterior: -0.18,
        lvLateral: +0.54,
        inferior: +0.12,
        posterobasal: -0.04,
      },
    },
    C6: {
      global: { x: +0.66, y: +0.2, z: -0.16 },
      regional: {
        septal: -0.26,
        rvAnterior: -0.24,
        lvLateral: +0.58,
        inferior: +0.08,
        posterobasal: -0.02,
      },
    },
  },
};

function dotProductRow(
  row: ElectrodeLeadFieldRow,
  source: CardiacSourceState
): number {
  return (
    row.global.x * source.global.x +
    row.global.y * source.global.y +
    row.global.z * source.global.z +
    row.regional.septal * source.regional.septal +
    row.regional.rvAnterior * source.regional.rvAnterior +
    row.regional.lvLateral * source.regional.lvLateral +
    row.regional.inferior * source.regional.inferior +
    row.regional.posterobasal * source.regional.posterobasal
  );
}

/**
 * Projects an instantaneous CardiacSourceState through the LeadFieldMatrix
 * to produce the 9 body-surface ElectrodePotentials.
 */
export function projectSourceToElectrodes(
  source: CardiacSourceState,
  leadField: LeadFieldMatrix = CANONICAL_LEAD_FIELD_V1,
  orientation: AnatomyOrientation = 'NORMAL'
): ElectrodePotentials {
  const result = {} as ElectrodePotentials;
  for (const name of ELECTRODE_NAMES) {
    result[name] = dotProductRow(leadField.electrodes[name], source);
  }

  if (orientation === 'DEXTROCARDIA') {
    // In Dextrocardia, the heart's frontal plane vector is mirrored (X -> -X),
    // producing the classic inverted Lead I (negative P, QRS, T) and upright aVR.
    // In the chest:
    // Precordial electrodes V1 (right 4th ICS) and V2 (left 4th ICS) are directly anterior to the right-sided heart.
    // They face the anterior ventricles and record normal physiological rS morphology and normal amplitude (~1.2-1.6 mV).
    // The anterior-posterior ventricular activation points away from the sternum into the right chest:
    const anteriorSource: CardiacSourceState = {
      global: { x: -source.global.x, y: source.global.y, z: source.global.z },
      regional: source.regional,
    };
    result.C1 = dotProductRow(leadField.electrodes.C1, anteriorSource);
    result.C2 = dotProductRow(leadField.electrodes.C2, anteriorSource);

    // Standard precordial electrodes V3, V4, V5, V6 are on the left chest,
    // moving progressively farther away from the right-sided heart.
    // Physical distance attenuation causes the potential to diminish smoothly:
    // V1, V2 are normal; from V2 across to V6, the waveform amplitude progressively decreases:
    const refC2 = result.C2;
    result.C3 = refC2 * 0.58;
    result.C4 = refC2 * 0.35;
    result.C5 = refC2 * 0.18;
    result.C6 = refC2 * 0.08;
  }

  return result;
}
