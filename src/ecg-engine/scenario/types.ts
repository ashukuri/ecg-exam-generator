/**
 * Simulation Scenario & Clinical Preset Types (53 Canonical Educational Presets)
 */

import {
  ElectrodeReversalMode,
  MissingElectrodeId,
} from '../electrodes/cableMapping';
import { SCENARIO_SCHEMA_VERSION } from '../version';

export const CANONICAL_PRESET_IDS = [
  // 1. Sinus & SA Node Rhythms (5)
  'NORMAL_SINUS',
  'SINUS_BRADYCARDIA',
  'SINUS_TACHYCARDIA',
  'SINUS_PAUSE_ARREST',
  'SA_EXIT_BLOCK',
  // 2. Ectopic Beats (2)
  'PAC',
  'PVC',
  // 3. Intraventricular Conduction Blocks (4)
  'RBBB',
  'LBBB',
  'LAFB',
  'LPFB',
  // 4. Atrioventricular Conduction Blocks (4)
  'AVB_1ST_DEGREE',
  'AVB_WENCKEBACH',
  'AVB_MOBITZ_II',
  'AVB_COMPLETE',
  // 5. Supraventricular & Pre-excitation Arrhythmias (5)
  'ATRIAL_FIBRILLATION',
  'ATRIAL_FLUTTER',
  'WPW_SYNDROME',
  'JUNCTIONAL_RHYTHM',
  'PSVT_REGULAR_NARROW',
  // 6. Ventricular Arrhythmias (2)
  'VENTRICULAR_TACHYCARDIA',
  'TORSADES_DE_POINTES',
  // 7. Myocardial Infarction & Ischemia (7)
  'ANTEROSEPTAL_MI_ACUTE',
  'ANTEROSEPTAL_MI_OLD',
  'INFERIOR_MI_ACUTE',
  'INFERIOR_MI_OLD',
  'LATERAL_MI_ACUTE',
  'LATERAL_MI_PRIOR',
  'POSTERIOR_MI_ACUTE',
  'POSTERIOR_MI_PRIOR',
  // 8. Electrolyte & Repolarization Syndromes (5)
  'HYPERKALEMIA',
  'HYPOKALEMIA',
  'HYPERCALCEMIA',
  'HYPOCALCEMIA',
  'LONG_QT_PATTERN',
  // 9. Pericardial & Channelopathy Disorders (4)
  'ACUTE_PERICARDITIS',
  'LARGE_PERICARDIAL_EFFUSION_PATTERN',
  'BRUGADA_TYPE_1',
  'BRUGADA_TYPE_2',
  // 10. Chamber Enlargement & Overload (4)
  'P_PULMONALE_PATTERN',
  'P_MITRALE_PATTERN',
  'LVH_WITH_STRAIN',
  'RVH_WITH_STRAIN',
  // 11. Pacemaker Rhythms (2)
  'PACEMAKER_VVI',
  'PACEMAKER_DDD',
  // 12. Axis & Positional Variants (3)
  'LEFT_AXIS_DEVIATION',
  'RIGHT_AXIS_DEVIATION',
  'DEXTROCARDIA',
  // 13. Pediatric Normal ECGs by Age Group (5)
  'PEDIATRIC_NORMAL_NEONATE',
  'PEDIATRIC_NORMAL_INFANT',
  'PEDIATRIC_NORMAL_1_TO_5_Y',
  'PEDIATRIC_NORMAL_6_TO_12_Y',
  'PEDIATRIC_NORMAL_ADOLESCENT',
] as const;

export type ClinicalPresetId = (typeof CANONICAL_PRESET_IDS)[number];

export type PatientAgeGroup =
  | 'ADULT'
  | 'NEONATE'
  | 'INFANT'
  | 'CHILD_1_TO_5_Y'
  | 'CHILD_6_TO_12_Y'
  | 'ADOLESCENT';

/**
 * Explicit compatibility aliases that resolve 1-to-1 to a single Canonical `ClinicalPresetId`.
 * Note: Never use `OMI` for Old MI (use `PRIOR_MI` / `OLD_MI`).
 */
export type ClinicalPresetAlias =
  | 'ATRIAL_FLUTTER_2_TO_1'
  | 'PAC_BIGEMINY'
  | 'PVC_MONOMORPHIC'
  | 'VT_MONOMORPHIC'
  | 'FIRST_DEGREE_AV_BLOCK'
  | 'SECOND_DEGREE_AVB_WENCKEBACH'
  | 'SECOND_DEGREE_AVB_MOBITZ_II'
  | 'COMPLETE_HEART_BLOCK'
  | 'ANTERIOR_STEMI'
  | 'INFERIOR_STEMI'
  | 'LATERAL_STEMI'
  | 'ANTEROSEPTAL_MI_PRIOR'
  | 'INFERIOR_MI_PRIOR'
  | 'LATERAL_MI_OLD'
  | 'POSTERIOR_MI_OLD'
  | 'HYPERKALEMIA_MODERATE';

export const CLINICAL_PRESET_ALIASES: Record<
  ClinicalPresetAlias,
  ClinicalPresetId
> = {
  ATRIAL_FLUTTER_2_TO_1: 'ATRIAL_FLUTTER',
  PAC_BIGEMINY: 'PAC',
  PVC_MONOMORPHIC: 'PVC',
  VT_MONOMORPHIC: 'VENTRICULAR_TACHYCARDIA',
  FIRST_DEGREE_AV_BLOCK: 'AVB_1ST_DEGREE',
  SECOND_DEGREE_AVB_WENCKEBACH: 'AVB_WENCKEBACH',
  SECOND_DEGREE_AVB_MOBITZ_II: 'AVB_MOBITZ_II',
  COMPLETE_HEART_BLOCK: 'AVB_COMPLETE',
  ANTERIOR_STEMI: 'ANTEROSEPTAL_MI_ACUTE',
  INFERIOR_STEMI: 'INFERIOR_MI_ACUTE',
  LATERAL_STEMI: 'LATERAL_MI_ACUTE',
  ANTEROSEPTAL_MI_PRIOR: 'ANTEROSEPTAL_MI_OLD',
  INFERIOR_MI_PRIOR: 'INFERIOR_MI_OLD',
  LATERAL_MI_OLD: 'LATERAL_MI_PRIOR',
  POSTERIOR_MI_OLD: 'POSTERIOR_MI_PRIOR',
  HYPERKALEMIA_MODERATE: 'HYPERKALEMIA',
};

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_PRESET_IDS);

export function isCanonicalPresetId(id: string): id is ClinicalPresetId {
  return CANONICAL_SET.has(id);
}

export function isClinicalPresetAlias(id: string): id is ClinicalPresetAlias {
  return Object.prototype.hasOwnProperty.call(CLINICAL_PRESET_ALIASES, id);
}

export function resolveCanonicalPresetId(
  idOrAlias: string
): ClinicalPresetId | null {
  if (isCanonicalPresetId(idOrAlias)) {
    return idOrAlias;
  }
  if (isClinicalPresetAlias(idOrAlias)) {
    return CLINICAL_PRESET_ALIASES[idOrAlias];
  }
  return null;
}

export type BaselineDriftLevel = 'DRIFT_NONE' | 'DRIFT_SMALL' | 'DRIFT_LARGE';
export type ArtifactSeverityLevel = 'NONE' | 'SMALL' | 'LARGE';
export type ArtifactTarget = 'ALL' | 'RA' | 'LA' | 'LL' | 'RL';

export type ArtifactConfig = {
  mainsHumEnabled: boolean;
  mainsFrequencyHz: 50 | 60;
  mainsAmplitudeMv: number;

  baselineWanderEnabled: boolean;
  baselineWanderAmplitudeMv: number;
  baselineWanderFrequencyHz: number;

  emgNoiseEnabled: boolean;
  emgNoiseAmplitudeMv: number;

  /** Structured Exam Generator artifact controls (biophysically propagated at electrode layer) */
  driftLevel?: BaselineDriftLevel;
  emgLevel?: ArtifactSeverityLevel;
  emgTargets?: ArtifactTarget[];
  acLevel?: ArtifactSeverityLevel;
  acTargets?: ArtifactTarget[];
};

export type ParameterOverrides = {
  heartRateBpm?: number;
  pDurationMs?: number;
  prIntervalMs?: number;
  qrsDurationMs?: number;
  qtIntervalMs?: number;
  pAxisDeg?: number;
  qrsAxisDeg?: number;
  tAxisDeg?: number;
  pAmplitudeScale?: number;
  qrsAmplitudeScale?: number;
  tAmplitudeScale?: number;
  electrolyteSeverity?: number;
  pacCount?: number;
  pvcCount?: number;
};

export type SimulationScenario = {
  schemaVersion?: string;
  presetId: ClinicalPresetId;
  durationMs: number;
  samplingRateHz: number;
  randomSeed: number;
  electrodeReversal: ElectrodeReversalMode;
  missingElectrodes?: MissingElectrodeId[];
  artifacts: ArtifactConfig;
  overrides?: ParameterOverrides;
};

export const DEFAULT_ARTIFACT_CONFIG: ArtifactConfig = {
  mainsHumEnabled: false,
  mainsFrequencyHz: 50,
  mainsAmplitudeMv: 0.06,

  baselineWanderEnabled: false,
  baselineWanderAmplitudeMv: 0.2,
  baselineWanderFrequencyHz: 0.22,

  emgNoiseEnabled: false,
  emgNoiseAmplitudeMv: 0.045,

  driftLevel: 'DRIFT_NONE',
  emgLevel: 'NONE',
  emgTargets: ['ALL'],
  acLevel: 'NONE',
  acTargets: ['ALL'],
};

export function normalizeArtifactConfig(
  partial?: Partial<ArtifactConfig>
): ArtifactConfig {
  const base = { ...DEFAULT_ARTIFACT_CONFIG, ...partial };

  // Synchronize structured levels with legacy boolean/amplitude fields
  let driftLevel: BaselineDriftLevel = base.driftLevel ?? 'DRIFT_NONE';
  if (!partial?.driftLevel && base.baselineWanderEnabled) {
    driftLevel =
      base.baselineWanderAmplitudeMv >= 0.3 ? 'DRIFT_LARGE' : 'DRIFT_SMALL';
  }
  const baselineWanderEnabled =
    driftLevel !== 'DRIFT_NONE' || Boolean(partial?.baselineWanderEnabled);
  const baselineWanderAmplitudeMv =
    driftLevel === 'DRIFT_LARGE'
      ? 0.4
      : driftLevel === 'DRIFT_SMALL'
        ? 0.2
        : partial?.baselineWanderEnabled
          ? (partial.baselineWanderAmplitudeMv ?? 0.2)
          : 0;

  let emgLevel: ArtifactSeverityLevel = base.emgLevel ?? 'NONE';
  if (!partial?.emgLevel && base.emgNoiseEnabled) {
    emgLevel = base.emgNoiseAmplitudeMv >= 0.08 ? 'LARGE' : 'SMALL';
  }
  const emgNoiseEnabled =
    emgLevel !== 'NONE' || Boolean(partial?.emgNoiseEnabled);
  const emgNoiseAmplitudeMv =
    emgLevel === 'LARGE'
      ? 0.11
      : emgLevel === 'SMALL'
        ? 0.045
        : partial?.emgNoiseEnabled
          ? (partial.emgNoiseAmplitudeMv ?? 0.045)
          : 0;

  let acLevel: ArtifactSeverityLevel = base.acLevel ?? 'NONE';
  if (!partial?.acLevel && base.mainsHumEnabled) {
    acLevel = base.mainsAmplitudeMv >= 0.1 ? 'LARGE' : 'SMALL';
  }
  const mainsHumEnabled =
    acLevel !== 'NONE' || Boolean(partial?.mainsHumEnabled);
  const mainsAmplitudeMv =
    acLevel === 'LARGE'
      ? 0.13
      : acLevel === 'SMALL'
        ? 0.055
        : partial?.mainsHumEnabled
          ? (partial.mainsAmplitudeMv ?? 0.055)
          : 0;

  const normalizeTargets = (targets?: ArtifactTarget[]): ArtifactTarget[] => {
    if (!targets || targets.length === 0) return ['ALL'];
    if (targets.includes('ALL')) return ['ALL'];
    return Array.from(new Set(targets));
  };

  return {
    mainsHumEnabled,
    mainsFrequencyHz: base.mainsFrequencyHz === 60 ? 60 : 50,
    mainsAmplitudeMv,
    baselineWanderEnabled,
    baselineWanderAmplitudeMv,
    baselineWanderFrequencyHz: base.baselineWanderFrequencyHz || 0.22,
    emgNoiseEnabled,
    emgNoiseAmplitudeMv,
    driftLevel: baselineWanderEnabled
      ? driftLevel === 'DRIFT_NONE'
        ? 'DRIFT_SMALL'
        : driftLevel
      : 'DRIFT_NONE',
    emgLevel: emgNoiseEnabled
      ? emgLevel === 'NONE'
        ? 'SMALL'
        : emgLevel
      : 'NONE',
    emgTargets: normalizeTargets(base.emgTargets),
    acLevel: mainsHumEnabled ? (acLevel === 'NONE' ? 'SMALL' : acLevel) : 'NONE',
    acTargets: normalizeTargets(base.acTargets),
  };
}

export function createDefaultScenario(
  presetId: ClinicalPresetId = 'NORMAL_SINUS'
): SimulationScenario {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    presetId,
    durationMs: 10000, // Standard 10.0 second recording for 3x4 + 10s Lead II Exam Sheet
    samplingRateHz: 500,
    randomSeed: 42,
    electrodeReversal: 'NONE',
    missingElectrodes: [],
    artifacts: normalizeArtifactConfig(DEFAULT_ARTIFACT_CONFIG),
    overrides: {},
  };
}

export function serializeScenario(scenario: SimulationScenario): string {
  const canonicalId =
    resolveCanonicalPresetId(scenario.presetId) ?? 'NORMAL_SINUS';
  const cleanDto: SimulationScenario = {
    schemaVersion: scenario.schemaVersion ?? SCENARIO_SCHEMA_VERSION,
    presetId: canonicalId,
    durationMs: Number(scenario.durationMs) || 10000,
    samplingRateHz: Number(scenario.samplingRateHz) || 500,
    randomSeed: Number(scenario.randomSeed) || 42,
    electrodeReversal: scenario.electrodeReversal ?? 'NONE',
    missingElectrodes: scenario.missingElectrodes
      ? [...scenario.missingElectrodes]
      : [],
    artifacts: normalizeArtifactConfig(scenario.artifacts),
    overrides: scenario.overrides ? { ...scenario.overrides } : {},
  };
  return JSON.stringify(cleanDto, null, 2);
}

export function deserializeScenario(
  input: string | Record<string, unknown>
): SimulationScenario {
  const raw =
    typeof input === 'string'
      ? (JSON.parse(input) as Record<string, unknown>)
      : input;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid SimulationScenario payload: expected JSON object');
  }
  const presetId =
    typeof raw.presetId === 'string'
      ? (resolveCanonicalPresetId(raw.presetId) ?? 'NORMAL_SINUS')
      : 'NORMAL_SINUS';
  const base = createDefaultScenario(presetId);
  const rawArtifacts = (raw.artifacts as Partial<ArtifactConfig>) ?? {};
  const rawOverrides = (raw.overrides as ParameterOverrides) ?? {};
  const rawMissing = Array.isArray(raw.missingElectrodes)
    ? raw.missingElectrodes.filter(
        (m): m is MissingElectrodeId => typeof m === 'string'
      )
    : [];

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    presetId,
    durationMs:
      typeof raw.durationMs === 'number' && raw.durationMs >= 1000
        ? raw.durationMs
        : base.durationMs,
    samplingRateHz:
      typeof raw.samplingRateHz === 'number' && raw.samplingRateHz >= 100
        ? raw.samplingRateHz
        : base.samplingRateHz,
    randomSeed:
      typeof raw.randomSeed === 'number' ? raw.randomSeed : base.randomSeed,
    electrodeReversal:
      typeof raw.electrodeReversal === 'string'
        ? (raw.electrodeReversal as ElectrodeReversalMode)
        : 'NONE',
    missingElectrodes: rawMissing,
    artifacts: normalizeArtifactConfig(rawArtifacts),
    overrides: { ...rawOverrides },
  };
}
