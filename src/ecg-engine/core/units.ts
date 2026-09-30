/**
 * ECG Waveform Engine - Core Units, QT Correction Formulas & Helpers
 *
 * Internal physical units:
 * - Time: milliseconds (ms)
 * - Voltage: millivolts (mV)
 * - Angles: degrees (deg) or radians (rad)
 * - Standard sampling rate: 500 Hz (dt = 2.0 ms)
 *
 * NOTE: Display parameters (25 mm/s, 10 mm/mV) belong strictly to the renderer layer
 * and MUST NEVER be mixed into physiological waveform calculations.
 */

export type Milliseconds = number;
export type Millivolts = number;
export type Degrees = number;
export type Hertz = number;

export const DEFAULT_SAMPLING_RATE_HZ: Hertz = 500;
export const DEFAULT_DT_MS: Milliseconds = 1000 / DEFAULT_SAMPLING_RATE_HZ; // 2.0 ms

export type QTCorrectionMethod = 'BAZETT' | 'FRIDERICIA' | 'FRAMINGHAM';

/**
 * Explicit QT Correction (QTc) Formulas.
 *
 * - BAZETT:     QTc = QT / (RR_sec)^(1/2)   (Classic clinical formula; over-corrects at high HR, under-corrects at low HR)
 * - FRIDERICIA: QTc = QT / (RR_sec)^(1/3)   (More accurate across bradycardia/tachycardia; FDA & clinical standard)
 * - FRAMINGHAM: QTc = QT + 154 * (1 - RR_sec) (Linear correction in ms)
 *
 * Canonical Normal Adult v1 at HR 75 bpm (RR = 0.80 s, QT = 380 ms):
 * - Bazett:     380 / sqrt(0.80) = 424.9 ms
 * - Fridericia: 380 / cbrt(0.80) = 409.4 ms
 * - Framingham: 380 + 154 * (1 - 0.80) = 410.8 ms
 */
export function computeCorrectedQT(
  qtMs: Milliseconds,
  rrMs: Milliseconds,
  method: QTCorrectionMethod
): Milliseconds {
  if (!Number.isFinite(qtMs) || !Number.isFinite(rrMs) || rrMs <= 150) {
    return qtMs;
  }
  const rrSec = rrMs / 1000;
  switch (method) {
    case 'BAZETT':
      return Math.round((qtMs / Math.sqrt(rrSec)) * 10) / 10;
    case 'FRIDERICIA':
      return Math.round((qtMs / Math.cbrt(rrSec)) * 10) / 10;
    case 'FRAMINGHAM':
      return Math.round((qtMs + 154 * (1 - rrSec)) * 10) / 10;
    default:
      return assertNever(method);
  }
}

export function degToRad(deg: Degrees): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): Degrees {
  return (rad * 180) / Math.PI;
}

/**
 * Normalizes an angle in degrees to the range (-180, 180].
 */
export function normalizeAngleDeg(deg: Degrees): Degrees {
  let d = (deg + 180) % 360;
  if (d <= 0) d += 360;
  return d - 180;
}

/**
 * Clamps a numeric value to [min, max], guarding against NaN/Infinity.
 */
export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Exhaustiveness check helper for TypeScript discriminated unions.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(
    message ?? `Unhandled discriminated union member: ${JSON.stringify(value)}`
  );
}
