/**
 * Frozen Engine, Model, Lead-Field, and Scenario Schema Version Constants
 */

export const ENGINE_VERSION = '1.0.0-rc1' as const;
export const MODEL_VERSION = 'canonical-v1' as const;
export const LEAD_FIELD_VERSION = 'canonicalLeadField.v1' as const;
export const SCENARIO_SCHEMA_VERSION = '1.0.0' as const;

export interface SimulationEngineMetadata {
  engineVersion: string;
  modelVersion: string;
  leadFieldVersion: string;
  scenarioSchemaVersion: string;
  presetId: string;
  presetStatus: 'IMPLEMENTED' | 'PARTIAL' | 'SCAFFOLD';
  primaryDomain: string;
  auditNotes: string;
}

export interface ResolvedConfigSummaryDTO {
  heartRateBpm: number;
  pDurationMs: number;
  prIntervalMs: number;
  qrsDurationMs: number;
  qtIntervalMs: number;
  pAxisDeg: number;
  qrsAxisDeg: number;
  tAxisDeg: number;
  pAmplitudeScale: number;
  qrsAmplitudeScale: number;
  tAmplitudeScale: number;
  orientation: 'NORMAL' | 'DEXTROCARDIA';
  electrodeReversal: string;
}
