/**
 * Electrode / Cable Mapping Layer
 *
 * Placed strictly between LeadField (body-surface ElectrodePotentials) and LeadDerivation.
 * Simulates physical cable misplacements (e.g., RA<->LA reversal) by remapping which physical
 * electrode feeds which machine input terminal.
 *
 * NOTE: Dextrocardia is NOT an electrode reversal; Dextrocardia is an Anatomy/Geometry transform
 * applied at the SpatialSource / LeadField boundary.
 */

import { ElectrodePotentials } from '../core/types';
import { assertNever } from '../core/units';

export type ElectrodeReversalMode =
  | 'NONE'
  | 'RA_LA_REVERSAL'
  | 'RA_LL_REVERSAL'
  | 'LA_LL_REVERSAL'
  | 'RIGHT_TO_LEFT_CHEST_REVERSAL';

export const ALL_MISSING_ELECTRODE_IDS = [
  'RA_MISSING',
  'LA_MISSING',
  'LL_MISSING',
  'V1_MISSING',
  'V2_MISSING',
  'V3_MISSING',
  'V4_MISSING',
  'V5_MISSING',
  'V6_MISSING',
] as const;

export type MissingElectrodeId = (typeof ALL_MISSING_ELECTRODE_IDS)[number];

export function applyCableMapping(
  bodyPotentials: ElectrodePotentials,
  reversalMode: ElectrodeReversalMode
): ElectrodePotentials {
  switch (reversalMode) {
    case 'NONE':
      return { ...bodyPotentials };
    case 'RA_LA_REVERSAL':
      return {
        ...bodyPotentials,
        RA: bodyPotentials.LA,
        LA: bodyPotentials.RA,
      };
    case 'RA_LL_REVERSAL':
      return {
        ...bodyPotentials,
        RA: bodyPotentials.LL,
        LL: bodyPotentials.RA,
      };
    case 'LA_LL_REVERSAL':
      return {
        ...bodyPotentials,
        LA: bodyPotentials.LL,
        LL: bodyPotentials.LA,
      };
    case 'RIGHT_TO_LEFT_CHEST_REVERSAL':
      return {
        ...bodyPotentials,
        C1: bodyPotentials.C6,
        C2: bodyPotentials.C5,
        C3: bodyPotentials.C4,
        C4: bodyPotentials.C3,
        C5: bodyPotentials.C2,
        C6: bodyPotentials.C1,
      };
    default:
      return assertNever(reversalMode);
  }
}
