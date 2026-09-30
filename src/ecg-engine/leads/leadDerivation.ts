/**
 * Lead Derivation Layer (Biophysical Laws of 12-Lead ECG)
 *
 * Strictly computes all 12 leads from the 9 mapped electrode potentials:
 * - Bipolar limb leads (Einthoven):
 *     I   = LA - RA
 *     II  = LL - RA
 *     III = LL - LA  (identically II - I)
 * - Augmented unipolar limb leads (Goldberger):
 *     aVR = RA - (LA + LL) / 2
 *     aVL = LA - (RA + LL) / 2
 *     aVF = LL - (RA + LA) / 2
 * - Wilson Central Terminal (WCT):
 *     WCT = (RA + LA + LL) / 3
 * - Unipolar precordial leads:
 *     V1 = C1 - WCT ... V6 = C6 - WCT
 *
 * III, aVR, aVL, aVF are NEVER generated independently.
 */

import { ElectrodePotentials, LeadName } from '../core/types';
import { MissingElectrodeId } from '../electrodes/cableMapping';

export type InstantaneousTwelveLeads = Record<LeadName, number>;

export function deriveInstantaneousLeads(
  potentials: ElectrodePotentials,
  missingElectrodes?: readonly MissingElectrodeId[],
  tMs?: number
): InstantaneousTwelveLeads {
  const { RA, LA, LL, C1, C2, C3, C4, C5, C6 } = potentials;

  if (!missingElectrodes || missingElectrodes.length === 0) {
    const I = LA - RA;
    const II = LL - RA;
    const III = LL - LA;

    const aVR = RA - (LA + LL) / 2;
    const aVL = LA - (RA + LL) / 2;
    const aVF = LL - (RA + LA) / 2;

    const WCT = (RA + LA + LL) / 3;

    const V1 = C1 - WCT;
    const V2 = C2 - WCT;
    const V3 = C3 - WCT;
    const V4 = C4 - WCT;
    const V5 = C5 - WCT;
    const V6 = C6 - WCT;

    return {
      I,
      II,
      III,
      aVR,
      aVL,
      aVF,
      V1,
      V2,
      V3,
      V4,
      V5,
      V6,
    };
  }

  const missingSet = new Set<MissingElectrodeId>(missingElectrodes);
  const openSignal =
    tMs !== undefined
      ? 0.004 * Math.sin(2 * Math.PI * 0.35 * (tMs / 1000))
      : 0;

  const raMissing = missingSet.has('RA_MISSING');
  const laMissing = missingSet.has('LA_MISSING');
  const llMissing = missingSet.has('LL_MISSING');

  // Compute Wilson Central Terminal from remaining connected limb electrodes
  const connectedLimbs: number[] = [];
  if (!raMissing) connectedLimbs.push(RA);
  if (!laMissing) connectedLimbs.push(LA);
  if (!llMissing) connectedLimbs.push(LL);

  const WCT =
    connectedLimbs.length > 0
      ? connectedLimbs.reduce((acc, v) => acc + v, 0) / connectedLimbs.length
      : 0;

  const I = raMissing || laMissing ? openSignal : LA - RA;
  const II = raMissing || llMissing ? openSignal : LL - RA;
  const III = laMissing || llMissing ? openSignal : LL - LA;

  const aVR =
    raMissing || (laMissing && llMissing)
      ? openSignal
      : !laMissing && !llMissing
        ? RA - (LA + LL) / 2
        : RA - WCT;

  const aVL =
    laMissing || (raMissing && llMissing)
      ? openSignal
      : !raMissing && !llMissing
        ? LA - (RA + LL) / 2
        : LA - WCT;

  const aVF =
    llMissing || (raMissing && laMissing)
      ? openSignal
      : !raMissing && !laMissing
        ? LL - (RA + LA) / 2
        : LL - WCT;

  const V1 = missingSet.has('V1_MISSING') ? openSignal : C1 - WCT;
  const V2 = missingSet.has('V2_MISSING') ? openSignal : C2 - WCT;
  const V3 = missingSet.has('V3_MISSING') ? openSignal : C3 - WCT;
  const V4 = missingSet.has('V4_MISSING') ? openSignal : C4 - WCT;
  const V5 = missingSet.has('V5_MISSING') ? openSignal : C5 - WCT;
  const V6 = missingSet.has('V6_MISSING') ? openSignal : C6 - WCT;

  return {
    I,
    II,
    III,
    aVR,
    aVL,
    aVF,
    V1,
    V2,
    V3,
    V4,
    V5,
    V6,
  };
}
