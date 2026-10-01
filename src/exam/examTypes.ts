/**
 * 12-Lead ECG Exam Question Generator Types & Data Contracts
 *
 * Includes:
 * - 3x4 Simultaneous 12-Lead Grid + Mandatory 10-Second Continuous Lead II Rhythm Strip
 * - Electrode-Level Biophysical Artifact Configuration (ALL / RA / LA / LL / RL)
 * - Unlimited Question Sets & Mixed Question Modes (DIAGNOSIS | MEASUREMENT | DIAGNOSIS_AND_MEASUREMENT)
 */

import {
  ArtifactConfig,
  ArtifactTarget,
  BaselineDriftLevel,
  ClinicalPresetId,
  ElectrodeReversalMode,
  MissingElectrodeId,
  normalizeArtifactConfig,
  PatientAgeGroup,
  PvcOrigin,
  SimulationScenario,
} from '../ecg-engine';

export type ExamNoiseLevel = 'NONE' | 'SMALL' | 'LARGE';

export const EXAM_LEAD_WINDOW_STARTS_MS = [0, 2500, 5000, 7500] as const;
export type ExamLeadWindowStartMs = (typeof EXAM_LEAD_WINDOW_STARTS_MS)[number];

export type QuestionMode =
  | 'DIAGNOSIS'
  | 'MEASUREMENT'
  | 'DIAGNOSIS_AND_MEASUREMENT';

export interface ExamNoiseConfig {
  emg: ExamNoiseLevel;
  emgTargets?: ArtifactTarget[];
  ac: ExamNoiseLevel;
  acFrequencyHz: 50 | 60;
  acTargets?: ArtifactTarget[];
  baselineDrift: boolean;
  driftLevel?: BaselineDriftLevel;
}

export interface ExamElectrodeErrorConfig {
  reversal: ElectrodeReversalMode;
  missing: MissingElectrodeId[];
}

export interface ManualMeasurementOverrides {
  heartRateBpm?: number;
  pWavePresent?: boolean;
  pDurationMs?: number;
  pAmplitudeMv?: number;
  prIntervalMs?: number;
  qrsDurationMs?: number;
  qrsAmplitudeMv?: number;
  qrsAxisDeg?: number;
  stDeviationMv?: number;
  tAmplitudeMv?: number;
  qtIntervalMs?: number;
  qtcMs?: number;
  rhythmSummary?: string;
  clinicalInterpretation?: string;
}

export interface ExamEcgCaseConfig {
  id: string;
  questionLabel?: string;
  questionMode?: QuestionMode;
  presetId: ClinicalPresetId;
  ageGroup?: PatientAgeGroup;
  useCustomHeartRate: boolean;
  heartRateBpm: number;
  pacCount: number;
  pvcCount: number;
  /** Optional for compatibility with previously saved question sets. */
  pvcOrigin?: PvcOrigin;
  /** Shared 2.5-second window; missing values select the first ectopic beat, or 0 ms. */
  leadWindowStartMs?: ExamLeadWindowStartMs;
  noise: ExamNoiseConfig;
  electrodeError: ExamElectrodeErrorConfig;
  seed: number;
  examinerNote?: string;
  manualAnswerOverrides?: ManualMeasurementOverrides;
}

export interface ExamQuestionSet {
  version: '2.0.0' | '1.0.0';
  title: string;
  createdAt: string;
  questions: ExamEcgCaseConfig[];
}

/**
 * Fixed 3x4 Clinical 12-Lead Layout (Top 3 Rows) + Row 3 (10-Sec Continuous Lead II Rhythm Strip)
 *
 * Row 0: I,   aVR, V1, V4  (all columns share the selected 2.5-second window)
 * Row 1: II,  aVL, V2, V5  (all columns share the selected 2.5-second window)
 * Row 2: III, aVF, V3, V6  (all columns share the selected 2.5-second window)
 * Row 3: II (Continuous 10.0s Rhythm Strip: 0.0-10.0s = 250.0 mm)
 */
export const EXAM_FIXED_12_LEAD_GRID = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
] as const;

/**
 * Fixed Clinical ECG Scale Constants (Auto-Gain is strictly forbidden)
 */
export const EXAM_PAPER_SPEED_MM_PER_S = 25;
export const EXAM_GAIN_MM_PER_MV = 10;
export const EXAM_CALIBRATION_PULSE_MV = 1.0; // 10 mm tall
export const EXAM_CALIBRATION_PULSE_MS = 200; // 5 mm wide at 25 mm/s

/**
 * Logical A4 Landscape Sheet Geometry in exact millimeters (297 mm x 210 mm)
 * - Total Grid Area: 260.0 mm wide x 180.0 mm high (x = 18.5..278.5, y = 16.0..196.0)
 *   (52 major 5mm squares wide x 36 major 5mm squares high)
 * - Left Calibration Column: 10.0 mm wide (x = 18.5..28.5)
 * - 4 Lead Columns in Rows 0..2: 4 x 62.5 mm = 250.0 mm wide (x = 28.5..278.5)
 *   At 25 mm/s, each 62.5 mm column displays the SAME selected 2.50-second interval.
 *   Columns are separate lead panels, not consecutive portions of the recording.
 * - Row 3 (Bottom 4th Row): Mandatory 10.0-second continuous Lead II rhythm strip
 *   Spanning full 250.0 mm waveform width (x = 28.5..278.5 mm, 0.0 - 10.0 s)
 * - 4 Rows x 45.0 mm = 180.0 mm total grid height (baselines at y = 38.5, 83.5, 128.5, 173.5 mm)
 */
export const EXAM_SHEET_GEOMETRY_MM = {
  pageWidthMm: 297,
  pageHeightMm: 210,
  gridXMm: 18.5,
  gridYMm: 16.0,
  gridWidthMm: 260.0,
  gridHeightMm: 180.0,
  calibrationStripWidthMm: 10.0,
  leadAreaXMm: 28.5,
  leadColumnWidthMm: 62.5, // 2.50 s * 25 mm/s = 62.5 mm exact
  rhythmStripWidthMm: 250.0, // 10.00 s * 25 mm/s = 250.0 mm exact
  leadRowHeightMm: 45.0, // 4 rows x 45.0 mm = 180.0 mm (±2.25 mV per row at 10 mm/mV)
  rowBaselinesYMm: [38.5, 83.5, 128.5, 173.5] as const,
  rhythmStripLead: 'II' as const,
  columnDurationSec: 2.5, // 2.50 s per column
  rhythmStripDurationSec: 10.0, // 10.00 s continuous rhythm strip
  totalDurationMs: 10000, // 10.00 s total recording
  samplingRateHz: 500,
} as const;

/** All 12 lead panels use this interval; the continuous Lead II strip remains 0-10 s. */
export function getExamLeadWindow(examCase: ExamEcgCaseConfig, firstEctopicTimeMs?: number): {
  startMs: ExamLeadWindowStartMs;
  endMs: number;
  label: string;
} {
  const requestedStart = examCase.leadWindowStartMs;
  const autoStart = firstEctopicTimeMs !== undefined && Number.isFinite(firstEctopicTimeMs)
    ? Math.min(7500, Math.max(0, Math.floor(firstEctopicTimeMs / 2500) * 2500))
    : 0;
  const startMs = EXAM_LEAD_WINDOW_STARTS_MS.find(start => start === requestedStart)
    ?? EXAM_LEAD_WINDOW_STARTS_MS.find(start => start === autoStart)!;
  const endMs = startMs + EXAM_SHEET_GEOMETRY_MM.columnDurationSec * 1000;
  return { startMs, endMs, label: `${(startMs / 1000).toFixed(1)}-${(endMs / 1000).toFixed(1)} s` };
}

export function mapExamNoiseToArtifactConfig(
  noise: ExamNoiseConfig
): ArtifactConfig {
  const driftLevel: BaselineDriftLevel =
    noise.driftLevel ?? (noise.baselineDrift ? 'DRIFT_SMALL' : 'DRIFT_NONE');

  return normalizeArtifactConfig({
    driftLevel,
    baselineWanderEnabled: driftLevel !== 'DRIFT_NONE',
    baselineWanderAmplitudeMv:
      driftLevel === 'DRIFT_LARGE'
        ? 0.4
        : driftLevel === 'DRIFT_SMALL'
          ? 0.2
          : 0,
    baselineWanderFrequencyHz: 0.22,
    emgLevel: noise.emg,
    emgNoiseEnabled: noise.emg !== 'NONE',
    emgNoiseAmplitudeMv:
      noise.emg === 'LARGE' ? 0.11 : noise.emg === 'SMALL' ? 0.045 : 0,
    emgTargets: noise.emgTargets ?? ['ALL'],
    acLevel: noise.ac,
    mainsHumEnabled: noise.ac !== 'NONE',
    mainsFrequencyHz: noise.acFrequencyHz === 60 ? 60 : 50,
    mainsAmplitudeMv:
      noise.ac === 'LARGE' ? 0.13 : noise.ac === 'SMALL' ? 0.055 : 0,
    acTargets: noise.acTargets ?? ['ALL'],
  });
}

export function buildExamSimulationScenario(
  examCase: ExamEcgCaseConfig
): SimulationScenario {
  const overrides: NonNullable<SimulationScenario['overrides']> = {
    pacCount: examCase.pacCount,
    pvcCount: examCase.pvcCount,
    pvcOrigin: examCase.pvcOrigin === 'LV' ? 'LV' : 'RV',
  };
  if (examCase.useCustomHeartRate) {
    overrides.heartRateBpm = Math.max(
      30,
      Math.min(220, Math.round(examCase.heartRateBpm))
    );
  }

  return {
    schemaVersion: '1.0.0',
    presetId: examCase.presetId,
    durationMs: EXAM_SHEET_GEOMETRY_MM.totalDurationMs,
    samplingRateHz: EXAM_SHEET_GEOMETRY_MM.samplingRateHz,
    randomSeed: Math.trunc(examCase.seed) || 42,
    electrodeReversal: examCase.electrodeError.reversal,
    missingElectrodes: [...examCase.electrodeError.missing],
    artifacts: mapExamNoiseToArtifactConfig(examCase.noise),
    overrides,
  };
}

export function createDefaultExamCase(
  presetId: ClinicalPresetId = 'NORMAL_SINUS',
  seed = 202601
): ExamEcgCaseConfig {
  const defaultPac = presetId === 'PAC' ? 1 : 0;
  const defaultPvc = presetId === 'PVC' ? 1 : 0;

  return {
    id: `exam_q_${seed}_${Math.random().toString(36).slice(2, 7)}`,
    questionMode: 'DIAGNOSIS_AND_MEASUREMENT',
    presetId,
    useCustomHeartRate: false,
    heartRateBpm: 75,
    pacCount: defaultPac,
    pvcCount: defaultPvc,
    pvcOrigin: 'RV',
    noise: {
      emg: 'NONE',
      emgTargets: ['ALL'],
      ac: 'NONE',
      acFrequencyHz: 50,
      acTargets: ['ALL'],
      baselineDrift: false,
      driftLevel: 'DRIFT_NONE',
    },
    electrodeError: {
      reversal: 'NONE',
      missing: [],
    },
    seed,
  };
}
