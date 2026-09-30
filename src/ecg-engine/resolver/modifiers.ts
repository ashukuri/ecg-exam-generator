/**
 * Declarative Modifiers & Rhythm/Conduction Configurations
 *
 * ClinicalPreset translates strictly into a declarative array of `Modifier` objects.
 * Low-level engine stages (Rhythm, Conduction, Spatial, LeadField) NEVER inspect disease names.
 */

import { AnatomyConfig } from '../core/types';
import {
  ActivationRecipe,
  RepolarizationRecipe,
  SpatialSourceComponent,
  STSegmentRecipe,
  UWaveRecipe,
} from '../morphology/recipes';
import { PatientAgeGroup } from '../scenario/types';
import { ConductionNodeId } from '../timeline/events';

/**
 * Discriminated union of Rhythm Source Configurations
 */
export type SinusNodeSourceConfig = {
  type: 'SINUS_NODE';
  id: string;
  enabled: boolean;
  rateBpm: number;
  regularityJitterRatio: number;
  pauseAtMs?: number;
  pauseDurationMs?: number;
};

export type AtrialEctopicSourceConfig = {
  type: 'ATRIAL_ECTOPIC';
  id: string;
  enabled: boolean;
  couplingIntervalMs: number;
  everyNthSinusBeat: number;
  focusRegion: 'HIGH_RA' | 'LOW_ATRIA' | 'PULMONARY_VEIN';
  resetsSinusNode: boolean;
};

export type JunctionalEscapeSourceConfig = {
  type: 'JUNCTIONAL_ESCAPE';
  id: string;
  enabled: boolean;
  escapeRateBpm: number;
  isPrimaryAccelerated: boolean;
  /** Optional retrograde atrial depolarization offset relative to QRS onset (e.g. +58 ms for PSVT pseudo-r'/pseudo-S or -48 ms for Junctional Rhythm) */
  retrogradeAtrialOffsetMs?: number;
  retrogradeAtrialAmplitudeScale?: number;
  retrogradeAtrialAxisDeg?: number;
};

export type VentricularEscapeSourceConfig = {
  type: 'VENTRICULAR_ESCAPE';
  id: string;
  enabled: boolean;
  escapeRateBpm: number;
  independentClock: boolean;
};

export type VentricularEctopicSourceConfig = {
  type: 'VENTRICULAR_ECTOPIC';
  id: string;
  enabled: boolean;
  couplingIntervalMs: number;
  everyNthBeat: number;
  originFocus: 'RV_OUTFLOW' | 'LV_POSTERIOR' | 'POLYMORPHIC';
  blocksNextSinusRetrograde: boolean;
};

export type FlutterSourceConfig = {
  type: 'ATRIAL_FLUTTER';
  id: string;
  enabled: boolean;
  atrialRateBpm: number;
};

export type FibrillatoryAtrialSourceConfig = {
  type: 'ATRIAL_FIBRILLATION';
  id: string;
  enabled: boolean;
  meanVentricularResponseBpm: number;
  irregularityIndex: number;
  fWaveAmplitudeMv: number;
  fWaveFrequencyHz: number;
};

export type VTSourceConfig = {
  type: 'VENTRICULAR_TACHYCARDIA';
  id: string;
  enabled: boolean;
  rateBpm: number;
  polymorphicTwistHz: number;
};

export type RhythmSourceConfig =
  | SinusNodeSourceConfig
  | AtrialEctopicSourceConfig
  | JunctionalEscapeSourceConfig
  | VentricularEscapeSourceConfig
  | VentricularEctopicSourceConfig
  | FlutterSourceConfig
  | FibrillatoryAtrialSourceConfig
  | VTSourceConfig;

export type ConductionBehaviorType =
  | 'FIXED'
  | 'DECREMENTAL'
  | 'INTERMITTENT_BLOCK';

export type ConductionPathConfig = {
  id: ConductionNodeId;
  enabled: boolean;
  baseDelayMs: number;
  refractoryPeriodMs: number;
  behavior: ConductionBehaviorType;
  decrementalConfig?: {
    fatigueIncrementPerImpulse: number;
    fatigueRecoveryTauMs: number;
    maxDelayIncrementMs: number;
    blockFatigueThreshold: number;
  };
  intermittentBlockConfig?: {
    conductionRatioN: number;
    dropEveryKthAttempt: number;
  };
};

export type PacemakerDeviceConfig = {
  enabled: boolean;
  mode: 'OFF' | 'VVI' | 'DDD';
  lowerRateBpm: number;
  avDelayMs: number;
  atrialOutputMv: number;
  ventricularOutputMv: number;
  captureSuccessProbability: number;
};

export type AtrialRepolarizationConfig = {
  enabled: boolean;
  /** Magnitude in mV (positive produces physiological Ta depression in I/II/III/aVF/V3-V6 and Ta elevation in aVR) */
  magnitudeMv: number;
};

export type ElectricalAlternansConfig = {
  enabled: boolean;
  /** Beat-to-beat pendular frontal axis swing in degrees (e.g. ±20 deg) */
  axisSwingDeg: number;
  /** Beat-to-beat amplitude modulation ratio (e.g. 0.30 -> alternates between 0.70x and 1.30x) */
  amplitudeSwingRatio: number;
  /** Beat-to-beat anteroposterior Z-axis swing for precordial alternans */
  anteriorSwingZ: number;
};

export type NumericConfigKey =
  | 'heartRateBpm'
  | 'pDurationMs'
  | 'prIntervalMs'
  | 'qrsDurationMs'
  | 'qtIntervalMs'
  | 'pAmplitudeScale'
  | 'qrsAmplitudeScale'
  | 'tAmplitudeScale';

/**
 * Discriminated Union of Declarative Modifiers
 */
export type Modifier =
  | {
      type: 'SET_PARAMETER';
      key: NumericConfigKey;
      value: number;
    }
  | {
      type: 'SCALE_PARAMETER';
      key: NumericConfigKey;
      factor: number;
    }
  | {
      type: 'ADD_CONDUCTION_PATH';
      path: ConductionPathConfig;
    }
  | {
      type: 'MODIFY_CONDUCTION_PATH';
      pathId: ConductionNodeId;
      changes: Partial<Omit<ConductionPathConfig, 'id'>>;
    }
  | {
      type: 'DISABLE_CONDUCTION_PATH';
      pathId: ConductionNodeId;
    }
  | {
      type: 'REPLACE_ACTIVATION_RECIPE';
      chamber: 'ATRIA' | 'VENTRICLES';
      recipe: ActivationRecipe;
    }
  | {
      type: 'ADD_ACTIVATION_COMPONENT';
      chamber: 'ATRIA' | 'VENTRICLES';
      component: SpatialSourceComponent;
    }
  | {
      type: 'MODIFY_REPOLARIZATION';
      recipe?: RepolarizationRecipe;
      secondaryDiscordanceFactor?: number;
      tAmplitudeScale?: number;
      tAxisDeg?: number;
    }
  | {
      type: 'SET_SPATIAL_AXIS';
      target: 'P' | 'QRS' | 'T';
      axisDeg: number;
    }
  | {
      type: 'SET_ANATOMY';
      anatomy: Partial<AnatomyConfig>;
    }
  | {
      type: 'SET_RHYTHM_SOURCES';
      sources: RhythmSourceConfig[];
    }
  | {
      type: 'CONFIGURE_DEVICE';
      device: Partial<PacemakerDeviceConfig>;
    }
  | {
      type: 'SET_ST_RECIPE';
      stRecipe: STSegmentRecipe;
    }
  | {
      type: 'SET_U_RECIPE';
      uRecipe: UWaveRecipe;
    }
  | {
      type: 'SET_ATRIAL_REPOLARIZATION';
      config: AtrialRepolarizationConfig;
    }
  | {
      type: 'SET_ELECTRICAL_ALTERNANS';
      config: ElectricalAlternansConfig;
    }
  | {
      type: 'SET_PATIENT_AGE_GROUP';
      ageGroup: PatientAgeGroup;
    };
