/**
 * Temporal Kernels for Morphology Model
 *
 * Strictly limited to finite-support or well-bounded temporal primitives:
 * 1. BetaKernel (finite support on x in [0, 1], strictly 0 outside [0, 1], peak normalized to 1)
 * 2. SmoothSegment (smooth raised-cosine / plateau envelope on [0, 1] for ST segment / injury currents)
 * 3. StochasticSource (band-limited deterministic sum-of-sinusoids driven by RandomSource)
 */

import { assertNever, clamp } from '../core/units';

export type BetaKernel = {
  type: 'BETA';
  alpha: number; // Must be > 1 for continuous zero boundary at x=0 and x=1
  beta: number;
};

export type SmoothSegmentKernel = {
  type: 'SMOOTH_SEGMENT';
  riseFraction: number; // Fraction of duration for smooth cosine ramp-up [0.05, 0.45]
  fallFraction: number; // Fraction of duration for smooth cosine ramp-down [0.05, 0.45]
  plateauSlope: number; // Optional linear tilt across the plateau (-0.5 to +0.5)
};

export type StochasticSourceKernel = {
  type: 'STOCHASTIC_SOURCE';
  baseFrequencyHz: number;
  harmonicsCount: number;
  irregularity: number; // [0, 1]
  seedOffset: number;
};

export type TemporalKernel =
  | BetaKernel
  | SmoothSegmentKernel
  | StochasticSourceKernel;

/**
 * Evaluates BetaKernel at normalized local time x = (t - onset) / duration.
 * Strictly returns 0 when x <= 0 or x >= 1, or when alpha/beta are invalid.
 * Peak value on (0, 1) is normalized to 1.0 so amplitude scaling is physically direct.
 */
export function evaluateBetaKernel(kernel: BetaKernel, x: number): number {
  if (!Number.isFinite(x) || x <= 0 || x >= 1) {
    return 0;
  }

  const a = clamp(kernel.alpha, 1.01, 50);
  const b = clamp(kernel.beta, 1.01, 50);

  // Mode of Beta(alpha, beta) on (0, 1) is (a - 1) / (a + b - 2)
  const mode = (a - 1) / (a + b - 2);
  const logPeak = (a - 1) * Math.log(mode) + (b - 1) * Math.log(1 - mode);
  const logVal = (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x);

  const val = Math.exp(logVal - logPeak);
  if (!Number.isFinite(val) || val < 1e-9) {
    return 0;
  }
  return clamp(val, 0, 1);
}

/**
 * Evaluates SmoothSegmentKernel at normalized local time x in (0, 1).
 * Strictly returns 0 outside (0, 1).
 */
export function evaluateSmoothSegmentKernel(
  kernel: SmoothSegmentKernel,
  x: number
): number {
  if (!Number.isFinite(x) || x <= 0 || x >= 1) {
    return 0;
  }

  const rise = clamp(kernel.riseFraction, 0.02, 0.48);
  const fall = clamp(kernel.fallFraction, 0.02, 0.48);
  const slope = clamp(kernel.plateauSlope, -1, 1);

  let envelope = 1.0;
  if (x < rise) {
    envelope = 0.5 * (1 - Math.cos((Math.PI * x) / rise));
  } else if (x > 1 - fall) {
    const u = (1 - x) / fall;
    envelope = 0.5 * (1 - Math.cos(Math.PI * u));
  }

  const tilt = 1 + slope * (x - 0.5);
  const result = envelope * Math.max(0, tilt);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Evaluates StochasticSourceKernel at absolute time tMs (in ms) and normalized x in (0, 1).
 * Uses deterministic trig series seeded by seedOffset.
 */
export function evaluateStochasticKernel(
  kernel: StochasticSourceKernel,
  x: number,
  tMs: number
): number {
  if (!Number.isFinite(x) || x <= 0 || x >= 1 || !Number.isFinite(tMs)) {
    return 0;
  }

  const tSec = tMs / 1000;
  const f0 = clamp(kernel.baseFrequencyHz, 0.5, 40);
  const nHarmonics = Math.round(clamp(kernel.harmonicsCount, 1, 8));
  const irr = clamp(kernel.irregularity, 0, 1);

  let sum = 0;
  let norm = 0;
  for (let k = 1; k <= nHarmonics; k++) {
    // Deterministic incommensurate frequency & phase modulation from seedOffset
    const detune =
      1 + irr * 0.23 * Math.sin(k * 1.73205 + kernel.seedOffset * 0.71);
    const freq = f0 * (1 + (k - 1) * 0.45) * detune;
    const phase = ((kernel.seedOffset * 137.508 * k) % 360) * (Math.PI / 180);
    const weight = 1 / Math.sqrt(k);
    sum += weight * Math.sin(2 * Math.PI * freq * tSec + phase);
    norm += weight;
  }

  // Smooth boundary window on [0, 1]
  let edgeWindow = 1.0;
  if (x < 0.02) edgeWindow = x / 0.02;
  else if (x > 0.98) edgeWindow = (1 - x) / 0.02;

  const val = norm > 0 ? (sum / norm) * edgeWindow : 0;
  return Number.isFinite(val) ? val : 0;
}

export function evaluateTemporalKernel(
  kernel: TemporalKernel,
  x: number,
  tMs: number
): number {
  switch (kernel.type) {
    case 'BETA':
      return evaluateBetaKernel(kernel, x);
    case 'SMOOTH_SEGMENT':
      return evaluateSmoothSegmentKernel(kernel, x);
    case 'STOCHASTIC_SOURCE':
      return evaluateStochasticKernel(kernel, x, tMs);
    default:
      return assertNever(kernel);
  }
}
