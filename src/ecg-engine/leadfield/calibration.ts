/**
 * Lead-Field Calibration Harness (Stage 1 Basis Probe + Stage 2 Regularized Feature Evaluation)
 *
 * Note: Calibration is an offline development/verification tool and does NOT run during
 * runtime ECG simulation (`simulateECG`). Runtime always uses the frozen versioned
 * `CANONICAL_LEAD_FIELD_V1` (`canonicalLeadField.v1`).
 */

import {
  CardiacSourceState,
  createZeroCardiacSourceState,
  LeadName,
  REGIONAL_MODE_NAMES,
} from '../core/types';
import {
  deriveInstantaneousLeads,
  InstantaneousTwelveLeads,
} from '../leads/leadDerivation';
import {
  CANONICAL_LEAD_FIELD_V1,
  LeadFieldMatrix,
  projectSourceToElectrodes,
} from './leadFieldModel';

export type BasisProbeName =
  | 'PURE_X'
  | 'PURE_Y'
  | 'PURE_Z'
  | 'PURE_SEPTAL'
  | 'PURE_RV_ANTERIOR'
  | 'PURE_LV_LATERAL'
  | 'PURE_INFERIOR'
  | 'PURE_POSTEROBASAL';

export type BasisProbeResponse = {
  probe: BasisProbeName;
  leads: InstantaneousTwelveLeads;
};

export type RegularizationMetrics = {
  precordialSmoothnessPenalty: number; // Sum of second differences across C1..C6
  regionalSparsityPenalty: number; // L1 norm of regional weights
  limbRegionalLeakagePenalty: number; // L2 norm of regional contributions to RA/LA/LL
  parameterMagnitudePenalty: number; // Frobenius norm of matrix
  totalRegularizationLoss: number;
};

/**
 * Stage 1: Evaluates the 8 pure unit basis probes across all 12 derived leads.
 */
export function runStage1BasisProbes(
  leadField: LeadFieldMatrix = CANONICAL_LEAD_FIELD_V1
): BasisProbeResponse[] {
  const probes: Array<{ name: BasisProbeName; state: CardiacSourceState }> = [
    {
      name: 'PURE_X',
      state: { ...createZeroCardiacSourceState(), global: { x: 1, y: 0, z: 0 } },
    },
    {
      name: 'PURE_Y',
      state: { ...createZeroCardiacSourceState(), global: { x: 0, y: 1, z: 0 } },
    },
    {
      name: 'PURE_Z',
      state: { ...createZeroCardiacSourceState(), global: { x: 0, y: 0, z: 1 } },
    },
    {
      name: 'PURE_SEPTAL',
      state: {
        ...createZeroCardiacSourceState(),
        regional: { ...createZeroCardiacSourceState().regional, septal: 1 },
      },
    },
    {
      name: 'PURE_RV_ANTERIOR',
      state: {
        ...createZeroCardiacSourceState(),
        regional: { ...createZeroCardiacSourceState().regional, rvAnterior: 1 },
      },
    },
    {
      name: 'PURE_LV_LATERAL',
      state: {
        ...createZeroCardiacSourceState(),
        regional: { ...createZeroCardiacSourceState().regional, lvLateral: 1 },
      },
    },
    {
      name: 'PURE_INFERIOR',
      state: {
        ...createZeroCardiacSourceState(),
        regional: { ...createZeroCardiacSourceState().regional, inferior: 1 },
      },
    },
    {
      name: 'PURE_POSTEROBASAL',
      state: {
        ...createZeroCardiacSourceState(),
        regional: { ...createZeroCardiacSourceState().regional, posterobasal: 1 },
      },
    },
  ];

  return probes.map(({ name, state }) => {
    const potentials = projectSourceToElectrodes(state, leadField);
    const leads = deriveInstantaneousLeads(potentials);
    return { probe: name, leads };
  });
}

/**
 * Stage 2: Computes regularization losses and verifies basis probe physiological invariants.
 */
export function evaluateLeadFieldRegularization(
  leadField: LeadFieldMatrix = CANONICAL_LEAD_FIELD_V1
): RegularizationMetrics {
  const chestOrder = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
  const limbOrder = ['RA', 'LA', 'LL'] as const;

  // 1. V1->V6 smoothness (second finite difference penalty across C1..C6)
  let smoothnessPenalty = 0;
  for (let i = 1; i < chestOrder.length - 1; i++) {
    const prev = leadField.electrodes[chestOrder[i - 1]!];
    const curr = leadField.electrodes[chestOrder[i]!];
    const next = leadField.electrodes[chestOrder[i + 1]!];

    const d2x = prev.global.x - 2 * curr.global.x + next.global.x;
    const d2y = prev.global.y - 2 * curr.global.y + next.global.y;
    const d2z = prev.global.z - 2 * curr.global.z + next.global.z;
    smoothnessPenalty += d2x * d2x + d2y * d2y + d2z * d2z;

    for (const rKey of REGIONAL_MODE_NAMES) {
      const d2r = prev.regional[rKey] - 2 * curr.regional[rKey] + next.regional[rKey];
      smoothnessPenalty += d2r * d2r;
    }
  }

  // 2. Regional sparsity (L1 penalty on regional weights)
  let regionalSparsityPenalty = 0;
  for (const elKey of [...limbOrder, ...chestOrder]) {
    const row = leadField.electrodes[elKey];
    for (const rKey of REGIONAL_MODE_NAMES) {
      regionalSparsityPenalty += Math.abs(row.regional[rKey]);
    }
  }

  // 3. Small regional contribution to limb electrodes (L2 penalty on RA, LA, LL regional terms)
  let limbRegionalLeakagePenalty = 0;
  for (const limbKey of limbOrder) {
    const row = leadField.electrodes[limbKey];
    for (const rKey of REGIONAL_MODE_NAMES) {
      limbRegionalLeakagePenalty += row.regional[rKey] * row.regional[rKey];
    }
  }

  // 4. Parameter magnitude penalty (L2 Frobenius norm)
  let parameterMagnitudePenalty = 0;
  for (const elKey of [...limbOrder, ...chestOrder]) {
    const row = leadField.electrodes[elKey];
    parameterMagnitudePenalty +=
      row.global.x ** 2 + row.global.y ** 2 + row.global.z ** 2;
    for (const rKey of REGIONAL_MODE_NAMES) {
      parameterMagnitudePenalty += row.regional[rKey] ** 2;
    }
  }

  const totalRegularizationLoss =
    0.5 * smoothnessPenalty +
    0.1 * regionalSparsityPenalty +
    2.0 * limbRegionalLeakagePenalty +
    0.05 * parameterMagnitudePenalty;

  return {
    precordialSmoothnessPenalty: smoothnessPenalty,
    regionalSparsityPenalty,
    limbRegionalLeakagePenalty,
    parameterMagnitudePenalty,
    totalRegularizationLoss,
  };
}
