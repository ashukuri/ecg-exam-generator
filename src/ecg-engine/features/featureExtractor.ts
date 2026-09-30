/**
 * 12-Lead ECG Feature Extractor
 *
 * Measures clinical intervals, frontal axes, per-lead wave amplitudes (P, Q, R, S, R', ST, T, U),
 * initial/terminal 40ms forces, dominant polarity, peak/trough counts, notch/slur indicators,
 * R/S ratios, R-wave progression, precordial transition zone, explicit Configured vs Episode vs Measured
 * interval metrics, explicit QT/QTc metrics, Hypokalemia U/QU metrics, and AF/AFL/Pacemaker rhythm diagnostics.
 */

import {
  ECGPoint,
  LEAD_NAMES,
  LeadName,
  TwelveLeadSignals,
} from '../core/types';
import {
  computeCorrectedQT,
  QTCorrectionMethod,
  radToDeg,
} from '../core/units';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import { MasterTimeline } from '../timeline/events';

export type WavePolarity =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'BIPHASIC'
  | 'ISOELECTRIC';

export type DominantQrsPolarity = 'POSITIVE' | 'NEGATIVE' | 'EQUIPHASIC';

export type LeadMeasuredFeatures = {
  lead: LeadName;
  pMaxMv: number;
  pMinMv: number;
  pAmplitudeMv: number;
  pPolarity: WavePolarity;

  qAmplitudeMv: number; // Initial negative deflection before first R
  rAmplitudeMv: number; // Primary positive deflection
  sAmplitudeMv: number; // Negative deflection following R
  rPrimeAmplitudeMv: number; // Secondary positive deflection (R') after S
  netQrsAreaMvMs: number;
  dominantQrsPolarity: DominantQrsPolarity;
  initial40msForceMvMs: number;
  terminal40msForceMvMs: number;
  majorPositivePeaksCount: number;
  majorNegativeTroughsCount: number;
  terminalPositiveComponentMv: number;
  terminalNegativeComponentMv: number;
  hasNotchOrSlur: boolean;
  rsRatio: number;

  stDeviationMv: number; // Measured at J-point + 40 ms

  tMaxMv: number;
  tMinMv: number;
  tAmplitudeMv: number; // Signed dominant peak
  tPolarity: WavePolarity;

  uAmplitudeMv: number; // Measured in post-T window if present
};

/**
 * Explicit separation of Configured vs Physiological Episode Truth vs Measured Waveform intervals,
 * plus (configured - measured) deltas.
 */
export type ExplicitIntervalMetrics = {
  configuredPDurationMs: number;
  episodePDurationMs: number;
  measuredPDurationMs: number;
  deltaPDurationMs: number;

  configuredPrMs: number;
  physiologicalPrMs: number;
  measuredPrMs: number;
  deltaPrMs: number;

  configuredQrsDurationMs: number;
  episodeQrsDurationMs: number;
  measuredQrsDurationMs: number;
  deltaQrsDurationMs: number;

  configuredQtMs: number;
  repolarizationEpisodeDurationMs: number;
  measuredQtMs: number;
  deltaQtMs: number;
};

/**
 * Explicit separation of model QT, repolarization episode duration, measured waveform QT,
 * and corrected QT (QTc) with named correction method.
 */
export type ExplicitQTMetrics = {
  configuredModelQtMs: number;
  repolarizationEpisodeDurationMs: number;
  measuredQtMs: number;
  primaryCorrectionMethod: QTCorrectionMethod;
  qtcPrimaryMs: number;
  qtcFridericiaMs: number;
  qtcBazettMs: number;
  qtcFraminghamMs: number;
  rrCoefficientOfVariation: number;
  isReliableForRhythm: boolean;
  reliabilityNote: string;
};

/**
 * Explicit U-wave and QU-interval metrics (critical for Hypokalemia where apparent
 * repolarization prolongation is a QU interval rather than pure QT prolongation).
 */
export type ExplicitUMetrics = {
  uWavePresent: boolean;
  uAmplitudeMv: number;
  uPolarity: WavePolarity;
  tuAmplitudeRatio: number;
  measuredQtMs: number;
  measuredQuMs: number;
  tuFusionIndicator: boolean;
};

/**
 * Explicit Rhythm, Atrial Flutter, and Pacemaker Device metrics.
 */
export type ExplicitRhythmAndAtrialMetrics = {
  meanRrMs: number;
  sdnnMs: number;
  rrCoefficientOfVariation: number;
  minRrMs: number;
  maxRrMs: number;
  atrialCycleLengthMs: number;
  flutterWaveContinuityVerified: boolean;
  avConductionRatioEstimate: string;
  ventricularRateBpm: number;
  measuredPaceSpikeMv: number;
  vviInhibitedCount: number;
  pacedCaptureCount: number;
};

export type ExtractedECGFeatures = {
  heartRateBpm: number;
  meanRrMs: number;
  rrIntervalsMs: number[];
  meanPpMs: number;
  ppIntervalsMs: number[];

  pDurationMs: number;
  prIntervalMs: number;
  prIntervalsByBeatMs: number[];
  qrsDurationMs: number;
  qtIntervalMs: number;
  qtcBazettMs: number;
  qtcFridericiaMs: number;
  qtcFraminghamMs: number;

  intervalMetrics: ExplicitIntervalMetrics;
  qtMetrics: ExplicitQTMetrics;
  uWaveMetrics: ExplicitUMetrics;
  rhythmMetrics: ExplicitRhythmAndAtrialMetrics;

  pAxisDeg: number;
  qrsAxisDeg: number;
  tAxisDeg: number;

  perLead: Record<LeadName, LeadMeasuredFeatures>;
  precordialRProgression: Record<'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6', number>;
  isNormalRProgression: boolean;
  transitionZone: string;
  measuredPaceSpikeMv: number;
};

function sliceWindow(
  points: ECGPoint[],
  startMs: number,
  endMs: number
): ECGPoint[] {
  return points.filter((p) => p.t >= startMs && p.t <= endMs);
}

/**
 * Measures actual multi-lead composite wave bounds [firstActiveT, lastActiveT] and duration
 * inside a candidate window [winStart, winEnd] by thresholding the 12-lead spatial root-sum-square voltage.
 */
function measureMultiLeadActiveBounds(
  signals: TwelveLeadSignals,
  winStartMs: number,
  winEndMs: number,
  thresholdRatio = 0.012
): { onsetMs: number; offsetMs: number; durationMs: number } {
  const leadIPoints = sliceWindow(signals.I, winStartMs, winEndMs);
  if (leadIPoints.length < 2) {
    return { onsetMs: winStartMs, offsetMs: winStartMs, durationMs: 0 };
  }

  const dt =
    signals.I.length > 1 ? Math.max(0.5, signals.I[1]!.t - signals.I[0]!.t) : 2.0;
  const rssValues: Array<{ t: number; rss: number }> = [];
  let maxRss = 0;

  for (const ptI of leadIPoints) {
    let sumSq = 0;
    const idx = Math.round(ptI.t / dt);
    for (const lead of LEAD_NAMES) {
      const v = signals[lead][idx]?.v ?? 0;
      sumSq += v * v;
    }
    const rss = Math.sqrt(sumSq);
    if (rss > maxRss) maxRss = rss;
    rssValues.push({ t: ptI.t, rss });
  }

  if (maxRss < 1e-4) {
    return { onsetMs: winStartMs, offsetMs: winStartMs, durationMs: 0 };
  }
  const threshold = maxRss * thresholdRatio;

  let firstActiveT: number | undefined;
  let lastActiveT: number | undefined;

  for (const item of rssValues) {
    if (item.rss >= threshold) {
      if (firstActiveT === undefined) firstActiveT = item.t;
      lastActiveT = item.t;
    }
  }

  if (firstActiveT === undefined || lastActiveT === undefined) {
    return { onsetMs: winStartMs, offsetMs: winStartMs, durationMs: 0 };
  }
  return {
    onsetMs: firstActiveT,
    offsetMs: lastActiveT + dt,
    durationMs: Math.max(0, lastActiveT - firstActiveT + dt),
  };
}

function measureMultiLeadActiveDurationMs(
  signals: TwelveLeadSignals,
  winStartMs: number,
  winEndMs: number,
  thresholdRatio = 0.012
): number {
  return measureMultiLeadActiveBounds(
    signals,
    winStartMs,
    winEndMs,
    thresholdRatio
  ).durationMs;
}

/**
 * Computes frontal electrical axis (in degrees) from measured net integral in Lead I and Lead aVF:
 * Since Lead I = 1.0 * X and Lead aVF = (sqrt(3)/2) * Y,
 * we recover (X, Y) = (Area_I, (2/sqrt(3)) * Area_aVF) and compute atan2(Y, X).
 */
function measureFrontalAxisFromSignals(
  signals: TwelveLeadSignals,
  startMs: number,
  endMs: number
): number {
  const ptsI = sliceWindow(signals.I, startMs, endMs);
  const ptsAVF = sliceWindow(signals.aVF, startMs, endMs);
  if (ptsI.length === 0 || ptsAVF.length === 0) return 0;

  let areaI = 0;
  let areaAVF = 0;
  for (let i = 0; i < ptsI.length; i++) {
    areaI += ptsI[i]!.v;
    areaAVF += ptsAVF[i]?.v ?? 0;
  }

  const x = areaI;
  const y = (2 / Math.sqrt(3)) * areaAVF;
  if (Math.hypot(x, y) < 1e-6) return 0;
  return Math.round(radToDeg(Math.atan2(y, x)) * 10) / 10;
}

/**
 * Decomposes a single-lead QRS waveform into morphological Q, R, S, R' amplitudes,
 * net area, dominant polarity, initial/terminal 40ms forces, peak/trough counts, and notch/slur indicator.
 */
function analyzeLeadQrsMorphology(points: ECGPoint[]): {
  qAmp: number;
  rAmp: number;
  sAmp: number;
  rPrimeAmp: number;
  netArea: number;
  dominantPolarity: DominantQrsPolarity;
  initial40msForce: number;
  terminal40msForce: number;
  majorPositivePeaksCount: number;
  majorNegativeTroughsCount: number;
  terminalPositiveComponent: number;
  terminalNegativeComponent: number;
  hasNotchOrSlur: boolean;
} {
  if (points.length === 0) {
    return {
      qAmp: 0,
      rAmp: 0,
      sAmp: 0,
      rPrimeAmp: 0,
      netArea: 0,
      dominantPolarity: 'EQUIPHASIC',
      initial40msForce: 0,
      terminal40msForce: 0,
      majorPositivePeaksCount: 0,
      majorNegativeTroughsCount: 0,
      terminalPositiveComponent: 0,
      terminalNegativeComponent: 0,
      hasNotchOrSlur: false,
    };
  }

  const dt = points.length > 1 ? points[1]!.t - points[0]!.t : 2.0;
  const tStart = points[0]!.t;
  const tEnd = points[points.length - 1]!.t;

  let netArea = 0;
  let initial40msForce = 0;
  let terminal40msForce = 0;
  let terminalPositiveComponent = 0;
  let terminalNegativeComponent = 0;

  for (const pt of points) {
    netArea += pt.v * dt;
    if (pt.t <= tStart + 40) {
      initial40msForce += pt.v * dt;
    }
    if (pt.t >= tEnd - 40) {
      terminal40msForce += pt.v * dt;
      if (pt.v > terminalPositiveComponent) terminalPositiveComponent = pt.v;
      if (pt.v < -terminalNegativeComponent) {
        terminalNegativeComponent = Math.abs(pt.v);
      }
    }
  }

  const dominantPolarity: DominantQrsPolarity =
    netArea > 1.5 ? 'POSITIVE' : netArea < -1.5 ? 'NEGATIVE' : 'EQUIPHASIC';

  // Count distinct positive peaks (> 0.08 mV) and negative troughs (< -0.08 mV)
  let majorPositivePeaksCount = 0;
  let majorNegativeTroughsCount = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!.v;
    const curr = points[i]!.v;
    const next = points[i + 1]!.v;
    if (curr > 0.08 && curr >= prev && curr > next) {
      majorPositivePeaksCount++;
    }
    if (curr < -0.08 && curr <= prev && curr < next) {
      majorNegativeTroughsCount++;
    }
  }

  // Detect mid-QRS notch or initial slurred delta upstroke
  let hasInflectionSlur = false;
  const maxAbsV = Math.max(...points.map((p) => Math.abs(p.v)), 0.001);
  for (let i = 2; i < points.length - 2; i++) {
    const v = points[i]!.v;
    if (Math.abs(v) > 0.22 * maxAbsV) {
      const dv1 = (points[i]!.v - points[i - 1]!.v) / dt;
      const dv2 = (points[i + 1]!.v - points[i]!.v) / dt;
      const dv3 = (points[i + 2]!.v - points[i + 1]!.v) / dt;
      // Local deceleration then re-acceleration on the same side of baseline (slur)
      if (
        dv1 > 0.004 &&
        dv3 > 0.012 &&
        dv2 < dv1 * 0.68 &&
        dv2 < dv3 * 0.68
      ) {
        hasInflectionSlur = true;
        break;
      }
    }
  }

  const hasNotchOrSlur =
    majorPositivePeaksCount >= 2 ||
    majorNegativeTroughsCount >= 2 ||
    hasInflectionSlur;

  const noiseFloor = 0.02;
  let firstPositiveIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.v > noiseFloor) {
      firstPositiveIdx = i;
      break;
    }
  }

  if (firstPositiveIdx === -1) {
    let minV = 0;
    for (const pt of points) {
      if (pt.v < minV) minV = pt.v;
    }
    return {
      qAmp: Math.abs(minV),
      rAmp: 0,
      sAmp: Math.abs(minV),
      rPrimeAmp: 0,
      netArea,
      dominantPolarity,
      initial40msForce,
      terminal40msForce,
      majorPositivePeaksCount,
      majorNegativeTroughsCount,
      terminalPositiveComponent,
      terminalNegativeComponent,
      hasNotchOrSlur,
    };
  }

  let qMin = 0;
  for (let i = 0; i < firstPositiveIdx; i++) {
    if (points[i]!.v < qMin) qMin = points[i]!.v;
  }
  const qAmp = Math.abs(qMin) >= noiseFloor ? Math.abs(qMin) : 0;

  let rPeakIdx = firstPositiveIdx;
  let rPeakVal = points[firstPositiveIdx]!.v;
  let sMinIdx = -1;
  let sMinVal = 0;
  let rPrimeVal = 0;

  let phase: 'IN_R' | 'IN_S_OR_LATER' = 'IN_R';
  for (let i = firstPositiveIdx; i < points.length; i++) {
    const v = points[i]!.v;
    if (phase === 'IN_R') {
      if (v > rPeakVal) {
        rPeakVal = v;
        rPeakIdx = i;
      } else if (v < -noiseFloor) {
        phase = 'IN_S_OR_LATER';
        sMinVal = v;
        sMinIdx = i;
      }
    } else {
      if (v < sMinVal && rPrimeVal < noiseFloor) {
        sMinVal = v;
        sMinIdx = i;
      } else if (v > rPrimeVal) {
        rPrimeVal = v;
      }
    }
  }

  let maxPosOverall = 0;
  for (const pt of points) {
    if (pt.v > maxPosOverall) maxPosOverall = pt.v;
  }
  let minNegAfterFirstPos = 0;
  for (let i = rPeakIdx; i < points.length; i++) {
    if (points[i]!.v < minNegAfterFirstPos) {
      minNegAfterFirstPos = points[i]!.v;
    }
  }

  const sAmp =
    sMinIdx !== -1
      ? Math.abs(sMinVal)
      : Math.abs(minNegAfterFirstPos) >= noiseFloor
        ? Math.abs(minNegAfterFirstPos)
        : 0;

  return {
    qAmp,
    rAmp: maxPosOverall,
    sAmp,
    rPrimeAmp: rPrimeVal > noiseFloor ? rPrimeVal : 0,
    netArea,
    dominantPolarity,
    initial40msForce,
    terminal40msForce,
    majorPositivePeaksCount,
    majorNegativeTroughsCount,
    terminalPositiveComponent,
    terminalNegativeComponent,
    hasNotchOrSlur,
  };
}

function classifyPolarity(maxPos: number, minNeg: number): WavePolarity {
  const pos = maxPos;
  const neg = Math.abs(minNeg);
  if (pos < 0.015 && neg < 0.015) return 'ISOELECTRIC';
  if (
    pos >= 0.025 &&
    neg >= 0.025 &&
    Math.min(pos, neg) / Math.max(pos, neg) > 0.25
  ) {
    return 'BIPHASIC';
  }
  return pos >= neg ? 'POSITIVE' : 'NEGATIVE';
}

export function extractECGFeatures(
  signals: TwelveLeadSignals,
  timeline: MasterTimeline,
  configuredModelQtMs = 380,
  resolvedConfig?: ResolvedSimulationConfig
): ExtractedECGFeatures {
  const qrsEpisodes = timeline.episodes.filter(
    (ep) => ep.type === 'VENTRICULAR_ACTIVATION'
  );
  const pEpisodes = timeline.episodes.filter(
    (ep) => ep.type === 'ATRIAL_ACTIVATION'
  );
  const repolEpisodes = timeline.episodes.filter(
    (ep) => ep.type === 'VENTRICULAR_REPOLARIZATION'
  );

  // 1. Ventricular RR intervals & HR
  const rrIntervalsMs: number[] = [];
  for (let i = 1; i < qrsEpisodes.length; i++) {
    rrIntervalsMs.push(
      Math.round((qrsEpisodes[i]!.startTime - qrsEpisodes[i - 1]!.startTime) * 10) /
        10
    );
  }
  const meanRrMs =
    rrIntervalsMs.length > 0
      ? rrIntervalsMs.reduce((a, b) => a + b, 0) / rrIntervalsMs.length
      : 800;

  let rrVariance = 0;
  if (rrIntervalsMs.length > 1) {
    for (const rr of rrIntervalsMs) {
      rrVariance += (rr - meanRrMs) ** 2;
    }
    rrVariance /= rrIntervalsMs.length;
  }
  const sdnnMs = Math.round(Math.sqrt(rrVariance) * 10) / 10;
  const rrCv = meanRrMs > 0 ? Math.sqrt(rrVariance) / meanRrMs : 0;
  const minRrMs =
    rrIntervalsMs.length > 0
      ? Math.round(Math.min(...rrIntervalsMs) * 10) / 10
      : Math.round(meanRrMs);
  const maxRrMs =
    rrIntervalsMs.length > 0
      ? Math.round(Math.max(...rrIntervalsMs) * 10) / 10
      : Math.round(meanRrMs);

  const heartRateBpm = Math.round((60000 / Math.max(150, meanRrMs)) * 10) / 10;

  // 2. PP intervals & Atrial Flutter continuity
  const ppIntervalsMs: number[] = [];
  for (let i = 1; i < pEpisodes.length; i++) {
    ppIntervalsMs.push(
      Math.round((pEpisodes[i]!.startTime - pEpisodes[i - 1]!.startTime) * 10) / 10
    );
  }
  const meanPpMs =
    ppIntervalsMs.length > 0
      ? ppIntervalsMs.reduce((a, b) => a + b, 0) / ppIntervalsMs.length
      : meanRrMs;

  const flutterWaves = pEpisodes.filter(
    (ep) => ep.recipeVariant === 'FLUTTER_WAVE'
  );
  let flutterWaveContinuityVerified = false;
  if (flutterWaves.length >= 10) {
    let maxFlutterGap = 0;
    for (let i = 1; i < flutterWaves.length; i++) {
      const gap = flutterWaves[i]!.startTime - flutterWaves[i - 1]!.startTime;
      if (gap > maxFlutterGap) maxFlutterGap = gap;
    }
    flutterWaveContinuityVerified = maxFlutterGap <= 215;
  }

  let avConductionRatioEstimate = '1:1';
  if (pEpisodes.length === 0) {
    avConductionRatioEstimate = rrCv > 0.08 ? 'AF_IRREGULAR' : 'VENTRICULAR_ONLY';
  } else if (qrsEpisodes.length > 0) {
    const ratio = pEpisodes.length / qrsEpisodes.length;
    if (Math.abs(ratio - 1) <= 0.12) avConductionRatioEstimate = '1:1';
    else if (Math.abs(ratio - 3) <= 0.35) avConductionRatioEstimate = '3:1';
    else if (Math.abs(ratio - 4) <= 0.35) avConductionRatioEstimate = '4:1';
    else if (Math.abs(ratio - 2) <= 0.35) avConductionRatioEstimate = '2:1';
    else avConductionRatioEstimate = `${pEpisodes.length}:${qrsEpisodes.length}`;
  }

  // 3. PR intervals across conducted beats
  const prIntervalsByBeatMs: number[] = [];
  for (const qrsEp of qrsEpisodes) {
    const matchingP = pEpisodes.find(
      (p) =>
        p.rootImpulseEventId === qrsEp.rootImpulseEventId &&
        qrsEp.startTime > p.startTime
    );
    if (matchingP) {
      prIntervalsByBeatMs.push(
        Math.round((qrsEp.startTime - matchingP.startTime) * 10) / 10
      );
    }
  }
  const physiologicalPrMs =
    prIntervalsByBeatMs.length > 0
      ? Math.round(
          (prIntervalsByBeatMs.reduce((a, b) => a + b, 0) /
            prIntervalsByBeatMs.length) *
            10
        ) / 10
      : 0;

  // Representative beat for wave duration and morphology re-measurement
  const repP = pEpisodes[0];
  const repQrs =
    qrsEpisodes.find((ep) => ep.recipeVariant === 'PACED_RV_APEX') ??
    qrsEpisodes[0];
  const repRepol = repQrs
    ? (repolEpisodes.find(
        (ep) => ep.rootImpulseEventId === repQrs.rootImpulseEventId
      ) ?? repolEpisodes[0])
    : repolEpisodes[0];

  const pBounds = repP
    ? measureMultiLeadActiveBounds(signals, repP.startTime, repP.endTime, 0.012)
    : { onsetMs: 0, offsetMs: 0, durationMs: 0 };
  const qrsBounds = repQrs
    ? measureMultiLeadActiveBounds(
        signals,
        repQrs.startTime,
        repQrs.endTime,
        0.012
      )
    : { onsetMs: 0, offsetMs: 0, durationMs: 0 };

  const pDurationMs = Math.round(pBounds.durationMs);
  const qrsDurationMs = Math.round(qrsBounds.durationMs);

  const measuredPrMs =
    repP &&
    repQrs &&
    repP.rootImpulseEventId === repQrs.rootImpulseEventId &&
    qrsBounds.onsetMs > pBounds.onsetMs
      ? Math.round((qrsBounds.onsetMs - pBounds.onsetMs) * 10) / 10
      : physiologicalPrMs;

  const prIntervalMs = physiologicalPrMs;

  // Measure actual waveform QT from QRS onset to T wave termination on the 12-lead RSS envelope
  const measuredQtMs =
    repQrs && repRepol
      ? Math.round(
          measureMultiLeadActiveDurationMs(
            signals,
            repQrs.startTime,
            repRepol.endTime,
            0.02
          )
        )
      : configuredModelQtMs;

  const repolarizationEpisodeDurationMs = repRepol
    ? Math.round(repRepol.duration)
    : Math.max(120, configuredModelQtMs - qrsDurationMs);

  const configuredPDurationMs = resolvedConfig?.pDurationMs ?? 100;
  const configuredPrMs = resolvedConfig?.prIntervalMs ?? 160;
  const configuredQrsDurationMs = resolvedConfig?.qrsDurationMs ?? 90;
  const configuredQtMs = resolvedConfig?.qtIntervalMs ?? configuredModelQtMs;

  const episodePDurationMs = repP ? Math.round(repP.duration) : 0;
  const episodeQrsDurationMs = repQrs ? Math.round(repQrs.duration) : 0;

  const intervalMetrics: ExplicitIntervalMetrics = {
    configuredPDurationMs,
    episodePDurationMs,
    measuredPDurationMs: pDurationMs,
    deltaPDurationMs: Math.round((configuredPDurationMs - pDurationMs) * 10) / 10,

    configuredPrMs,
    physiologicalPrMs,
    measuredPrMs,
    deltaPrMs: Math.round((configuredPrMs - measuredPrMs) * 10) / 10,

    configuredQrsDurationMs,
    episodeQrsDurationMs,
    measuredQrsDurationMs: qrsDurationMs,
    deltaQrsDurationMs:
      Math.round((configuredQrsDurationMs - qrsDurationMs) * 10) / 10,

    configuredQtMs,
    repolarizationEpisodeDurationMs,
    measuredQtMs,
    deltaQtMs: Math.round((configuredQtMs - measuredQtMs) * 10) / 10,
  };

  const qtcFridericiaMs = computeCorrectedQT(
    measuredQtMs,
    meanRrMs,
    'FRIDERICIA'
  );
  const qtcBazettMs = computeCorrectedQT(measuredQtMs, meanRrMs, 'BAZETT');
  const qtcFraminghamMs = computeCorrectedQT(
    measuredQtMs,
    meanRrMs,
    'FRAMINGHAM'
  );

  const isReliableForRhythm = rrCv < 0.08 && qrsEpisodes.length >= 2;
  const reliabilityNote = isReliableForRhythm
    ? 'Regular rhythm: Fridericia QTc (primary) and Bazett QTc (secondary) are reliable.'
    : `High RR variability (CV=${(rrCv * 100).toFixed(1)}%): Single-beat QTc correction is unreliable in irregular rhythms (e.g., AF); use Fridericia average over multiple beats.`;

  const qtMetrics: ExplicitQTMetrics = {
    configuredModelQtMs: configuredQtMs,
    repolarizationEpisodeDurationMs,
    measuredQtMs,
    primaryCorrectionMethod: 'FRIDERICIA',
    qtcPrimaryMs: qtcFridericiaMs,
    qtcFridericiaMs,
    qtcBazettMs,
    qtcFraminghamMs,
    rrCoefficientOfVariation: Math.round(rrCv * 1000) / 1000,
    isReliableForRhythm,
    reliabilityNote,
  };

  // Measure Frontal Axes (P, QRS, T) from clean signal integrals
  const pAxisDeg = repP
    ? measureFrontalAxisFromSignals(signals, repP.startTime, repP.endTime)
    : 50;
  const qrsAxisDeg = repQrs
    ? measureFrontalAxisFromSignals(signals, repQrs.startTime, repQrs.endTime)
    : 60;
  const tAxisDeg = repRepol
    ? measureFrontalAxisFromSignals(
        signals,
        repRepol.startTime + repRepol.duration * 0.2,
        repRepol.endTime
      )
    : 45;

  // 4. Per-Lead Amplitude & Morphology Extraction
  const perLead = {} as Record<LeadName, LeadMeasuredFeatures>;

  for (const lead of LEAD_NAMES) {
    // P wave measurement
    const pPts = repP
      ? sliceWindow(signals[lead], repP.startTime, repP.endTime)
      : [];
    let pMax = 0;
    let pMin = 0;
    for (const pt of pPts) {
      if (pt.v > pMax) pMax = pt.v;
      if (pt.v < pMin) pMin = pt.v;
    }
    const pAmp = Math.abs(pMax) >= Math.abs(pMin) ? pMax : pMin;
    const pPol = classifyPolarity(pMax, pMin);

    // QRS morphology measurement
    const qrsPts = repQrs
      ? sliceWindow(signals[lead], repQrs.startTime, repQrs.endTime)
      : [];
    const qrsMorph = analyzeLeadQrsMorphology(qrsPts);
    const rsRatio =
      qrsMorph.sAmp > 0.01
        ? Math.round((qrsMorph.rAmp / qrsMorph.sAmp) * 100) / 100
        : qrsMorph.rAmp > 0.05
          ? 99.0
          : 1.0;

    // ST deviation measured at J-point + 40 ms (window [J + 35, J + 45])
    let stDev = 0;
    if (repQrs) {
      const jTime = repQrs.endTime;
      const stWin = sliceWindow(signals[lead], jTime + 35, jTime + 45);
      if (stWin.length > 0) {
        stDev =
          Math.round(
            (stWin.reduce((acc, p) => acc + p.v, 0) / stWin.length) * 1000
          ) / 1000;
      }
    }

    // T wave measurement (dedicated T-wave window distinct from early ST segment)
    const tPts = repRepol
      ? sliceWindow(
          signals[lead],
          repRepol.startTime + repRepol.duration * 0.34,
          repRepol.endTime
        )
      : [];
    let tMax = 0;
    let tMin = 0;
    for (const pt of tPts) {
      if (pt.v > tMax) tMax = pt.v;
      if (pt.v < tMin) tMin = pt.v;
    }
    const tAmp = Math.abs(tMax) >= Math.abs(tMin) ? tMax : tMin;
    const tPol = classifyPolarity(tMax, tMin);

    // U wave measurement (window [repRepol.endTime + 2, repRepol.endTime + 175])
    let uMax = 0;
    if (repRepol) {
      const uPts = sliceWindow(
        signals[lead],
        repRepol.endTime + 2,
        repRepol.endTime + 175
      );
      for (const pt of uPts) {
        if (pt.v > uMax) uMax = pt.v;
      }
    }

    perLead[lead] = {
      lead,
      pMaxMv: Math.round(pMax * 1000) / 1000,
      pMinMv: Math.round(pMin * 1000) / 1000,
      pAmplitudeMv: Math.round(pAmp * 1000) / 1000,
      pPolarity: pPol,

      qAmplitudeMv: Math.round(qrsMorph.qAmp * 1000) / 1000,
      rAmplitudeMv: Math.round(qrsMorph.rAmp * 1000) / 1000,
      sAmplitudeMv: Math.round(qrsMorph.sAmp * 1000) / 1000,
      rPrimeAmplitudeMv: Math.round(qrsMorph.rPrimeAmp * 1000) / 1000,
      netQrsAreaMvMs: Math.round(qrsMorph.netArea * 100) / 100,
      dominantQrsPolarity: qrsMorph.dominantPolarity,
      initial40msForceMvMs: Math.round(qrsMorph.initial40msForce * 100) / 100,
      terminal40msForceMvMs: Math.round(qrsMorph.terminal40msForce * 100) / 100,
      majorPositivePeaksCount: qrsMorph.majorPositivePeaksCount,
      majorNegativeTroughsCount: qrsMorph.majorNegativeTroughsCount,
      terminalPositiveComponentMv:
        Math.round(qrsMorph.terminalPositiveComponent * 1000) / 1000,
      terminalNegativeComponentMv:
        Math.round(qrsMorph.terminalNegativeComponent * 1000) / 1000,
      hasNotchOrSlur: qrsMorph.hasNotchOrSlur,
      rsRatio,

      stDeviationMv: stDev,

      tMaxMv: Math.round(tMax * 1000) / 1000,
      tMinMv: Math.round(tMin * 1000) / 1000,
      tAmplitudeMv: Math.round(tAmp * 1000) / 1000,
      tPolarity: tPol,

      uAmplitudeMv: Math.round(uMax * 1000) / 1000,
    };
  }

  // 5. Explicit U-wave & QU-interval metrics (Hypokalemia QT vs QU separation)
  const v3U = perLead.V3.uAmplitudeMv;
  const v3T = Math.abs(perLead.V3.tAmplitudeMv);
  const uWavePresent = v3U >= 0.03;
  let measuredQuMs = measuredQtMs;
  let tuFusionIndicator = false;
  if (uWavePresent && repQrs && repRepol) {
    const quBounds = measureMultiLeadActiveBounds(
      signals,
      repQrs.startTime,
      repRepol.endTime + 175,
      0.015
    );
    measuredQuMs = Math.round(quBounds.durationMs);
    const junctionPts = sliceWindow(
      signals.V3,
      repRepol.endTime - 6,
      repRepol.endTime + 12
    );
    const maxJunctionV =
      junctionPts.length > 0
        ? Math.max(...junctionPts.map((p) => Math.abs(p.v)))
        : 0;
    tuFusionIndicator = maxJunctionV >= 0.012 || measuredQuMs > measuredQtMs + 90;
  }

  const uWaveMetrics: ExplicitUMetrics = {
    uWavePresent,
    uAmplitudeMv: v3U,
    uPolarity: v3U >= 0.03 ? 'POSITIVE' : 'ISOELECTRIC',
    tuAmplitudeRatio:
      v3U > 0.005 ? Math.round((v3T / v3U) * 100) / 100 : 99.0,
    measuredQtMs,
    measuredQuMs,
    tuFusionIndicator,
  };

  // 6. Pacemaker spike and VVI sensing metrics
  const stimEvents = timeline.events.filter(
    (e) => e.type === 'PACEMAKER_STIMULUS'
  );
  let measuredPaceSpikeMv = 0;
  if (stimEvents.length > 0) {
    for (const stim of stimEvents) {
      const win = sliceWindow(signals.V2, stim.timestamp - 2, stim.timestamp + 4);
      for (const pt of win) {
        if (Math.abs(pt.v) > measuredPaceSpikeMv) {
          measuredPaceSpikeMv = Math.round(Math.abs(pt.v) * 1000) / 1000;
        }
      }
    }
  }
  const vviInhibitedCount = timeline.annotations.filter(
    (a) => a.label === 'VVI_INHIBIT'
  ).length;
  const pacedCaptureCount = timeline.events.filter(
    (e) => e.type === 'CAPTURE_SUCCESS'
  ).length;

  const rhythmMetrics: ExplicitRhythmAndAtrialMetrics = {
    meanRrMs: Math.round(meanRrMs * 10) / 10,
    sdnnMs,
    rrCoefficientOfVariation: Math.round(rrCv * 1000) / 1000,
    minRrMs,
    maxRrMs,
    atrialCycleLengthMs: Math.round(meanPpMs * 10) / 10,
    flutterWaveContinuityVerified,
    avConductionRatioEstimate,
    ventricularRateBpm: heartRateBpm,
    measuredPaceSpikeMv,
    vviInhibitedCount,
    pacedCaptureCount,
  };

  // 7. Precordial R-wave progression and Transition Zone
  const chestLeads = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
  const precordialRProgression = {
    V1: perLead.V1.rAmplitudeMv,
    V2: perLead.V2.rAmplitudeMv,
    V3: perLead.V3.rAmplitudeMv,
    V4: perLead.V4.rAmplitudeMv,
    V5: perLead.V5.rAmplitudeMv,
    V6: perLead.V6.rAmplitudeMv,
  };

  const isNormalRProgression =
    precordialRProgression.V1 < precordialRProgression.V2 &&
    precordialRProgression.V2 < precordialRProgression.V3 &&
    precordialRProgression.V3 < precordialRProgression.V4 &&
    precordialRProgression.V5 > precordialRProgression.V1;

  let transitionZone = 'NONE';
  for (let i = 0; i < chestLeads.length - 1; i++) {
    const lCurr = chestLeads[i]!;
    const lNext = chestLeads[i + 1]!;
    const rsCurr = perLead[lCurr].rsRatio;
    const rsNext = perLead[lNext].rsRatio;
    if (rsCurr <= 1.05 && rsNext >= 0.95) {
      transitionZone = `${lCurr}-${lNext}`;
      break;
    }
  }

  return {
    heartRateBpm,
    meanRrMs: Math.round(meanRrMs * 10) / 10,
    rrIntervalsMs,
    meanPpMs: Math.round(meanPpMs * 10) / 10,
    ppIntervalsMs,

    pDurationMs,
    prIntervalMs,
    prIntervalsByBeatMs,
    qrsDurationMs,
    qtIntervalMs: measuredQtMs,
    qtcBazettMs,
    qtcFridericiaMs,
    qtcFraminghamMs,
    intervalMetrics,
    qtMetrics,
    uWaveMetrics,
    rhythmMetrics,

    pAxisDeg,
    qrsAxisDeg,
    tAxisDeg,

    perLead,
    precordialRProgression,
    isNormalRProgression,
    transitionZone,
    measuredPaceSpikeMv,
  };
}
