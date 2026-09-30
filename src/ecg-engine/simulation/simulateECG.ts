/**
 * Public Simulation API (`simulateECG`)
 *
 * Orchestrates the complete end-to-end biophysical pipeline:
 *   SimulationScenario
 *     -> Configuration Resolver (ResolvedSimulationConfig)
 *     -> Master Timeline / Event Queue (Rhythm + Conduction + Device Engines)
 *     -> Electrical Activation / Repolarization -> Cardiac Source State
 *     -> Lead Field (canonicalLeadField.v1) -> Electrode Potentials
 *     -> Electrode / Cable Mapping
 *     -> Lead Derivation -> Clean 12-Lead ECG
 *     -> Feature Extraction
 *     ->Artifact Engine -> Final 12-Lead ECG
 *     -> Validation
 */

import { applyArtifactsToTwelveLeadECG } from '../artifacts/artifactEngine';
import { createRandomSource } from '../core/random';
import { TwelveLeadSignals } from '../core/types';
import {
  ExtractedECGFeatures,
  extractECGFeatures,
} from '../features/featureExtractor';
import {
  CLINICAL_PRESETS,
  ClinicalPresetDefinition,
  resolveConfiguration,
} from '../presets/clinicalPresets';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import { sampleCleanTwelveLeadECG } from '../sampling/sampler';
import {
  CANONICAL_PRESET_IDS,
  CLINICAL_PRESET_ALIASES,
  ClinicalPresetAlias,
  ClinicalPresetId,
  resolveCanonicalPresetId,
  SimulationScenario,
} from '../scenario/types';
import {
  ECGAnnotation,
  PhysiologicalEpisode,
  PhysiologicalEvent,
} from '../timeline/events';
import { buildMasterTimeline } from '../timeline/timelineBuilder';
import {
  runEngineValidation,
  ValidationReport,
} from '../validation/validator';
import {
  ENGINE_VERSION,
  LEAD_FIELD_VERSION,
  MODEL_VERSION,
  ResolvedConfigSummaryDTO,
  SCENARIO_SCHEMA_VERSION,
  SimulationEngineMetadata,
} from '../version';

export type ClinicalPresetMetadata = Omit<
  ClinicalPresetDefinition,
  'modifiers'
> & {
  canonicalId: ClinicalPresetId;
  title: string;
  aliases: ClinicalPresetAlias[];
  validationProfile: string;
  dedicatedAcceptanceTest: boolean;
  introducedVersion: string;
};

export interface PresetRegistryEntryDTO {
  id: ClinicalPresetId;
  canonicalId: ClinicalPresetId;
  title: string;
  nameJa: string;
  status: 'IMPLEMENTED' | 'PARTIAL' | 'SCAFFOLD';
  category: string;
  aliases: ClinicalPresetAlias[];
  validationProfile: string;
  dedicatedAcceptanceTest: boolean;
  introducedVersion: string;
  primaryDomain: string;
  auditNotes: string;
}

export interface EngineRegistryCountsDTO {
  ENGINE_PRESET_COUNT: number;
  ENGINE_IMPLEMENTED_COUNT: number;
  ENGINE_PARTIAL_COUNT: number;
  ENGINE_SCAFFOLD_COUNT: number;
  implementedPresetIds: ClinicalPresetId[];
  partialPresetIds: ClinicalPresetId[];
  scaffoldPresetIds: ClinicalPresetId[];
}

export function getAliasesForCanonicalPreset(
  canonicalId: ClinicalPresetId
): ClinicalPresetAlias[] {
  return (
    Object.entries(CLINICAL_PRESET_ALIASES) as [
      ClinicalPresetAlias,
      ClinicalPresetId,
    ][]
  )
    .filter(([, target]) => target === canonicalId)
    .map(([alias]) => alias);
}

export function getClinicalPresetMetadata(
  presetIdOrAlias: ClinicalPresetId | string
): ClinicalPresetMetadata {
  const canonicalId =
    resolveCanonicalPresetId(presetIdOrAlias) ?? 'NORMAL_SINUS';
  const def = CLINICAL_PRESETS[canonicalId] ?? CLINICAL_PRESETS.NORMAL_SINUS;
  return {
    id: def.id,
    canonicalId: def.id,
    title: def.name,
    name: def.name,
    nameJa: def.nameJa,
    status: def.status,
    primaryDomain: def.primaryDomain,
    auditNotes: def.auditNotes,
    category: def.category,
    description: def.description,
    aliases: getAliasesForCanonicalPreset(def.id),
    validationProfile: `7-Category Biophysical & Clinical Validator (${def.category}: ${def.primaryDomain})`,
    dedicatedAcceptanceTest: true,
    introducedVersion: ENGINE_VERSION,
  };
}

export function getEngineRegistryCounts(): EngineRegistryCountsDTO {
  const allIds = [...CANONICAL_PRESET_IDS];
  const implementedPresetIds = allIds.filter(
    (id) => CLINICAL_PRESETS[id].status === 'IMPLEMENTED'
  );
  const partialPresetIds = allIds.filter(
    (id) => CLINICAL_PRESETS[id].status === 'PARTIAL'
  );
  const scaffoldPresetIds = allIds.filter(
    (id) => CLINICAL_PRESETS[id].status === 'SCAFFOLD'
  );

  return {
    ENGINE_PRESET_COUNT: allIds.length,
    ENGINE_IMPLEMENTED_COUNT: implementedPresetIds.length,
    ENGINE_PARTIAL_COUNT: partialPresetIds.length,
    ENGINE_SCAFFOLD_COUNT: scaffoldPresetIds.length,
    implementedPresetIds,
    partialPresetIds,
    scaffoldPresetIds,
  };
}

export function buildPresetRegistryManifest(): {
  engineVersion: string;
  modelVersion: string;
  leadFieldVersion: string;
  scenarioSchemaVersion: string;
  counts: EngineRegistryCountsDTO;
  aliases: Record<ClinicalPresetAlias, ClinicalPresetId>;
  presets: PresetRegistryEntryDTO[];
} {
  const counts = getEngineRegistryCounts();
  const presets: PresetRegistryEntryDTO[] = CANONICAL_PRESET_IDS.map((id) => {
    const meta = getClinicalPresetMetadata(id);
    return {
      id: meta.id,
      canonicalId: meta.canonicalId,
      title: meta.title,
      nameJa: meta.nameJa,
      status: meta.status,
      category: meta.category,
      aliases: meta.aliases,
      validationProfile: meta.validationProfile,
      dedicatedAcceptanceTest: meta.dedicatedAcceptanceTest,
      introducedVersion: meta.introducedVersion,
      primaryDomain: meta.primaryDomain,
      auditNotes: meta.auditNotes,
    };
  });

  return {
    engineVersion: ENGINE_VERSION,
    modelVersion: MODEL_VERSION,
    leadFieldVersion: LEAD_FIELD_VERSION,
    scenarioSchemaVersion: SCENARIO_SCHEMA_VERSION,
    counts,
    aliases: { ...CLINICAL_PRESET_ALIASES },
    presets,
  };
}

export type SimulationResult = {
  metadata: SimulationEngineMetadata;
  scenario: SimulationScenario;
  resolvedSummary: ResolvedConfigSummaryDTO;
  resolvedConfig: ResolvedSimulationConfig;
  timeline: {
    durationMs: number;
    events: PhysiologicalEvent[];
    episodes: PhysiologicalEpisode[];
  };
  ecg: {
    clean: TwelveLeadSignals;
    final: TwelveLeadSignals;
    features: ExtractedECGFeatures;
  };
  validation: ValidationReport;
  annotations: ECGAnnotation[];
};

export function simulateECG(scenario: SimulationScenario): SimulationResult {
  // 1. Create deterministic seeded PRNG
  const rootRng = createRandomSource(scenario.randomSeed);

  // 2. Resolve scenario & clinical preset modifiers into ResolvedSimulationConfig
  const resolvedConfig = resolveConfiguration(scenario);
  const presetMeta = getClinicalPresetMetadata(scenario.presetId);

  // 3. Build Master Timeline (Event Priority Queue -> Events + Episodes + Annotations)
  const masterTimeline = buildMasterTimeline(
    resolvedConfig,
    scenario.durationMs,
    rootRng
  );

  // 4. Sample Clean 12-Lead ECG via Spatial Source -> LeadField -> CableMapping -> LeadDerivation
  const clean = sampleCleanTwelveLeadECG(
    masterTimeline,
    resolvedConfig,
    scenario.samplingRateHz,
    scenario.electrodeReversal,
    scenario.missingElectrodes
  );

  // 5. Extract measured clinical features from Clean 12-Lead ECG
  const features = extractECGFeatures(
    clean,
    masterTimeline,
    resolvedConfig.qtIntervalMs,
    resolvedConfig
  );

  // 6. Apply Artifact Engine (strictly isolated from clean signal)
  const final = applyArtifactsToTwelveLeadECG(
    clean,
    scenario.artifacts,
    rootRng
  );

  // 7. Run 7-Category Engine Validation
  const validation = runEngineValidation(
    scenario,
    resolvedConfig,
    masterTimeline,
    clean,
    final,
    features
  );

  const metadata: SimulationEngineMetadata = {
    engineVersion: ENGINE_VERSION,
    modelVersion: MODEL_VERSION,
    leadFieldVersion: LEAD_FIELD_VERSION,
    scenarioSchemaVersion: scenario.schemaVersion ?? SCENARIO_SCHEMA_VERSION,
    presetId: presetMeta.id,
    presetStatus: presetMeta.status,
    primaryDomain: presetMeta.primaryDomain,
    auditNotes: presetMeta.auditNotes,
  };

  const resolvedSummary: ResolvedConfigSummaryDTO = {
    heartRateBpm: resolvedConfig.heartRateBpm,
    pDurationMs: resolvedConfig.pDurationMs,
    prIntervalMs: resolvedConfig.prIntervalMs,
    qrsDurationMs: resolvedConfig.qrsDurationMs,
    qtIntervalMs: resolvedConfig.qtIntervalMs,
    pAxisDeg: resolvedConfig.pAxisDeg,
    qrsAxisDeg: resolvedConfig.qrsAxisDeg,
    tAxisDeg: resolvedConfig.tAxisDeg,
    pAmplitudeScale: resolvedConfig.pAmplitudeScale,
    qrsAmplitudeScale: resolvedConfig.qrsAmplitudeScale,
    tAmplitudeScale: resolvedConfig.tAmplitudeScale,
    orientation: resolvedConfig.anatomy.orientation,
    electrodeReversal: scenario.electrodeReversal,
  };

  return {
    metadata,
    scenario: structuredClone({
      ...scenario,
      schemaVersion: scenario.schemaVersion ?? SCENARIO_SCHEMA_VERSION,
    }),
    resolvedSummary,
    resolvedConfig,
    timeline: {
      durationMs: masterTimeline.durationMs,
      events: masterTimeline.events,
      episodes: masterTimeline.episodes,
    },
    ecg: {
      clean,
      final,
      features,
    },
    validation,
    annotations: masterTimeline.annotations,
  };
}
