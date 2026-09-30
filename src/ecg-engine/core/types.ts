/**
 * Core Domain Types for the 12-Lead ECG Waveform Engine
 */

export const LEAD_NAMES = [
  'I',
  'II',
  'III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
] as const;

export type LeadName = (typeof LEAD_NAMES)[number];

export const ELECTRODE_NAMES = [
  'RA',
  'LA',
  'LL',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
] as const;

export type ElectrodeName = (typeof ELECTRODE_NAMES)[number];

export type ECGPoint = {
  t: number; // ms
  v: number; // mV
};

export type TwelveLeadSignals = Record<LeadName, ECGPoint[]>;

/**
 * Physical potentials at the 9 sensing electrodes (in mV) relative to torso reference.
 */
export type ElectrodePotentials = {
  RA: number;
  LA: number;
  LL: number;
  C1: number;
  C2: number;
  C3: number;
  C4: number;
  C5: number;
  C6: number;
};

/**
 * Instantaneous Cardiac Source State.
 *
 * Coordinate convention (Standard Cardiac Vector Axes):
 * +X = patient's left
 * +Y = inferior (towards feet)
 * +Z = anterior (towards chest wall)
 *
 * Regional modes capture localized wavefront proximity effects (especially V1-V6)
 * without introducing lead names into the source model.
 */
export type CardiacSourceState = {
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

export const REGIONAL_MODE_NAMES = [
  'septal',
  'rvAnterior',
  'lvLateral',
  'inferior',
  'posterobasal',
] as const;

export type RegionalModeName = (typeof REGIONAL_MODE_NAMES)[number];

export function createZeroCardiacSourceState(): CardiacSourceState {
  return {
    global: { x: 0, y: 0, z: 0 },
    regional: {
      septal: 0,
      rvAnterior: 0,
      lvLateral: 0,
      inferior: 0,
      posterobasal: 0,
    },
  };
}

export type AnatomyOrientation = 'NORMAL' | 'DEXTROCARDIA';

export type AnatomyConfig = {
  orientation: AnatomyOrientation;
  /** Additional frontal plane axis rotation (degrees) */
  frontalAxisRotationDeg: number;
  /** Additional horizontal plane rotation (degrees) */
  horizontalRotationDeg: number;
};
