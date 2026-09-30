/**
 * Deterministic Seeded Pseudo-Random Number Generator (PRNG)
 *
 * Math.random() is strictly prohibited anywhere in the ECG engine.
 * All stochastic processes (AF f-waves, heart rate variability, EMG noise,
 * intermittent conduction block) MUST derive randomness from RandomSource.
 */

export interface RandomSource {
  /** Returns a float in [0, 1) */
  next(): number;
  /** Returns a float in [min, max) */
  nextRange(min: number, max: number): number;
  /** Returns an approximate standard normal variable N(0, 1) via Box-Muller */
  nextGaussian(): number;
  /** Creates an independent deterministic sub-stream derived from current seed + string tag */
  fork(tag: string): RandomSource;
}

function hashString(str: string, baseSeed: number): number {
  let h = (baseSeed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Mulberry32 deterministic PRNG implementation.
 */
export class SeededRandom implements RandomSource {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = (seed >>> 0) || 0x12345678;
    this.state = this.initialSeed;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextRange(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  nextGaussian(): number {
    // Box-Muller transform with floor guard against log(0)
    const u1 = Math.max(1e-12, this.next());
    const u2 = this.next();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  fork(tag: string): RandomSource {
    const stepped = Math.floor(this.next() * 0xffffffff) >>> 0;
    const mixedSeed = (Math.imul(this.initialSeed, 0x9e3779b9) ^ stepped) >>> 0;
    const derivedSeed = hashString(tag, mixedSeed);
    return new SeededRandom(derivedSeed);
  }
}

export function createRandomSource(seed: number): RandomSource {
  return new SeededRandom(seed);
}
