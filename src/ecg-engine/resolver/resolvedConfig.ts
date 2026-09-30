/**
 * Configuration Resolver & Canonical Normal Adult v1 Baseline
 */

import { AnatomyConfig } from '../core/types';
import { assertNever, clamp } from '../core/units';
import {
  ActivationRecipe,
  CANONICAL_ATRIAL_RECIPE,
  CANONICAL_NORMAL_QRS_RECIPE,
  CANONICAL_T_WAVE_RECIPE,
  DEFAULT_ST_RECIPE,
  DEFAULT_U_WAVE_RECIPE,
  RepolarizationRecipe,
  STSegmentRecipe,
  UWaveRecipe,
} from '../morphology/recipes';
import { PatientAgeGroup } from '../scenario/types';
import { ConductionNodeId } from '../timeline/events';
import {
  AtrialRepolarizationConfig,
  ConductionPathConfig,
  ElectricalAlternansConfig,
  Modifier,
  PacemakerDeviceConfig,
  RhythmSourceConfig,
} from './modifiers';

export type ResolvedSimulationConfig = {
  modelLabel: 'canonical educational model (Canonical Normal Adult v1 baseline)';
  patientAgeGroup: PatientAgeGroup;
  heartRateBpm: number;
  rrIntervalMs: number;
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
  secondaryDiscordanceFactor: number;

  anatomy: AnatomyConfig;
  rhythmSources: RhythmSourceConfig[];
  conductionNetwork: Record<ConductionNodeId, ConductionPathConfig>;
  device: PacemakerDeviceConfig;

  atrialRecipe: ActivationRecipe;
  ventricularRecipe: ActivationRecipe;
  stRecipe: STSegmentRecipe;
  repolarizationRecipe: RepolarizationRecipe;
  uWaveRecipe: UWaveRecipe;

  atrialRepolarization: AtrialRepolarizationConfig;
  electricalAlternans: ElectricalAlternansConfig;

  pacCount?: number;
  pvcCount?: number;
};

export function createCanonicalNormalConfig(): ResolvedSimulationConfig {
  const conductionNetwork: Record<ConductionNodeId, ConductionPathConfig> = {
    SA_NODE: {
      id: 'SA_NODE',
      enabled: true,
      baseDelayMs: 0,
      refractoryPeriodMs: 220,
      behavior: 'FIXED',
    },
    SA_EXIT: {
      id: 'SA_EXIT',
      enabled: true,
      baseDelayMs: 5,
      refractoryPeriodMs: 220,
      behavior: 'FIXED',
    },
    ATRIA: {
      id: 'ATRIA',
      enabled: true,
      baseDelayMs: 35,
      refractoryPeriodMs: 200,
      behavior: 'FIXED',
    },
    AV_NODE: {
      id: 'AV_NODE',
      enabled: true,
      baseDelayMs: 95,
      refractoryPeriodMs: 260,
      behavior: 'FIXED',
    },
    HIS: {
      id: 'HIS',
      enabled: true,
      baseDelayMs: 15,
      refractoryPeriodMs: 250,
      behavior: 'FIXED',
    },
    RIGHT_BUNDLE: {
      id: 'RIGHT_BUNDLE',
      enabled: true,
      baseDelayMs: 10,
      refractoryPeriodMs: 260,
      behavior: 'FIXED',
    },
    LEFT_BUNDLE: {
      id: 'LEFT_BUNDLE',
      enabled: true,
      baseDelayMs: 10,
      refractoryPeriodMs: 250,
      behavior: 'FIXED',
    },
    LAF: {
      id: 'LAF',
      enabled: true,
      baseDelayMs: 5,
      refractoryPeriodMs: 250,
      behavior: 'FIXED',
    },
    LPF: {
      id: 'LPF',
      enabled: true,
      baseDelayMs: 5,
      refractoryPeriodMs: 250,
      behavior: 'FIXED',
    },
    PURKINJE: {
      id: 'PURKINJE',
      enabled: true,
      baseDelayMs: 5,
      refractoryPeriodMs: 240,
      behavior: 'FIXED',
    },
    VENTRICULAR_MYOCARDIUM: {
      id: 'VENTRICULAR_MYOCARDIUM',
      enabled: true,
      baseDelayMs: 0,
      refractoryPeriodMs: 250,
      behavior: 'FIXED',
    },
    ACCESSORY_PATHWAY: {
      id: 'ACCESSORY_PATHWAY',
      enabled: false,
      baseDelayMs: 25,
      refractoryPeriodMs: 270,
      behavior: 'FIXED',
    },
  };

  return {
    modelLabel: 'canonical educational model (Canonical Normal Adult v1 baseline)',
    patientAgeGroup: 'ADULT',
    heartRateBpm: 75,
    rrIntervalMs: 800,
    pDurationMs: 100,
    prIntervalMs: 160,
    qrsDurationMs: 90,
    qtIntervalMs: 380,

    pAxisDeg: 50,
    qrsAxisDeg: 60,
    tAxisDeg: 45,

    pAmplitudeScale: 1.0,
    qrsAmplitudeScale: 1.0,
    tAmplitudeScale: 1.0,
    secondaryDiscordanceFactor: 0.0,

    anatomy: {
      orientation: 'NORMAL',
      frontalAxisRotationDeg: 0,
      horizontalRotationDeg: 0,
    },

    rhythmSources: [
      {
        type: 'SINUS_NODE',
        id: 'PRIMARY_SA_NODE',
        enabled: true,
        rateBpm: 75,
        regularityJitterRatio: 0.0,
      },
    ],

    conductionNetwork,

    device: {
      enabled: false,
      mode: 'OFF',
      lowerRateBpm: 60,
      avDelayMs: 160,
      atrialOutputMv: 2.5,
      ventricularOutputMv: 3.5,
      captureSuccessProbability: 1.0,
    },

    atrialRecipe: structuredClone(CANONICAL_ATRIAL_RECIPE),
    ventricularRecipe: structuredClone(CANONICAL_NORMAL_QRS_RECIPE),
    stRecipe: structuredClone(DEFAULT_ST_RECIPE),
    repolarizationRecipe: structuredClone(CANONICAL_T_WAVE_RECIPE),
    uWaveRecipe: structuredClone(DEFAULT_U_WAVE_RECIPE),

    atrialRepolarization: {
      enabled: false,
      magnitudeMv: 0,
    },
    electricalAlternans: {
      enabled: false,
      axisSwingDeg: 0,
      amplitudeSwingRatio: 0,
      anteriorSwingZ: 0,
    },
  };
}

export function applyModifier(
  config: ResolvedSimulationConfig,
  modifier: Modifier
): void {
  switch (modifier.type) {
    case 'SET_PARAMETER': {
      config[modifier.key] = modifier.value;
      if (modifier.key === 'heartRateBpm') {
        config.rrIntervalMs = 60000 / clamp(modifier.value, 20, 300);
        for (const src of config.rhythmSources) {
          if (src.type === 'SINUS_NODE') {
            src.rateBpm = modifier.value;
          } else if (src.type === 'JUNCTIONAL_ESCAPE' && src.isPrimaryAccelerated) {
            src.escapeRateBpm = modifier.value;
          } else if (src.type === 'VENTRICULAR_TACHYCARDIA') {
            src.rateBpm = modifier.value;
          }
        }
      }
      if (modifier.key === 'prIntervalMs') {
        syncConductionDelayToTargetPR(config, modifier.value);
      }
      return;
    }
    case 'SCALE_PARAMETER': {
      config[modifier.key] = config[modifier.key] * modifier.factor;
      if (modifier.key === 'heartRateBpm') {
        config.rrIntervalMs = 60000 / clamp(config.heartRateBpm, 20, 300);
        for (const src of config.rhythmSources) {
          if (src.type === 'SINUS_NODE') {
            src.rateBpm = config.heartRateBpm;
          }
        }
      }
      if (modifier.key === 'prIntervalMs') {
        syncConductionDelayToTargetPR(config, config.prIntervalMs);
      }
      return;
    }
    case 'ADD_CONDUCTION_PATH': {
      config.conductionNetwork[modifier.path.id] = structuredClone(
        modifier.path
      );
      return;
    }
    case 'MODIFY_CONDUCTION_PATH': {
      const target = config.conductionNetwork[modifier.pathId];
      if (target) {
        Object.assign(target, structuredClone(modifier.changes));
      }
      return;
    }
    case 'DISABLE_CONDUCTION_PATH': {
      const target = config.conductionNetwork[modifier.pathId];
      if (target) {
        target.enabled = false;
      }
      return;
    }
    case 'REPLACE_ACTIVATION_RECIPE': {
      if (modifier.chamber === 'ATRIA') {
        config.atrialRecipe = structuredClone(modifier.recipe);
      } else {
        config.ventricularRecipe = structuredClone(modifier.recipe);
      }
      return;
    }
    case 'ADD_ACTIVATION_COMPONENT': {
      if (modifier.chamber === 'ATRIA') {
        config.atrialRecipe.components.push(
          structuredClone(modifier.component)
        );
      } else {
        config.ventricularRecipe.components.push(
          structuredClone(modifier.component)
        );
      }
      return;
    }
    case 'MODIFY_REPOLARIZATION': {
      if (modifier.recipe) {
        config.repolarizationRecipe = structuredClone(modifier.recipe);
      }
      if (modifier.secondaryDiscordanceFactor !== undefined) {
        config.secondaryDiscordanceFactor = modifier.secondaryDiscordanceFactor;
      }
      if (modifier.tAmplitudeScale !== undefined) {
        config.tAmplitudeScale = modifier.tAmplitudeScale;
      }
      if (modifier.tAxisDeg !== undefined) {
        config.tAxisDeg = modifier.tAxisDeg;
      }
      return;
    }
    case 'SET_SPATIAL_AXIS': {
      if (modifier.target === 'P') config.pAxisDeg = modifier.axisDeg;
      else if (modifier.target === 'QRS') config.qrsAxisDeg = modifier.axisDeg;
      else if (modifier.target === 'T') config.tAxisDeg = modifier.axisDeg;
      return;
    }
    case 'SET_ANATOMY': {
      Object.assign(config.anatomy, modifier.anatomy);
      return;
    }
    case 'SET_RHYTHM_SOURCES': {
      config.rhythmSources = structuredClone(modifier.sources);
      const sinus = config.rhythmSources.find((s) => s.type === 'SINUS_NODE');
      const junc = config.rhythmSources.find(
        (s) => s.type === 'JUNCTIONAL_ESCAPE'
      );
      const vt = config.rhythmSources.find(
        (s) => s.type === 'VENTRICULAR_TACHYCARDIA'
      );
      if (sinus) {
        config.heartRateBpm = sinus.rateBpm;
        config.rrIntervalMs = 60000 / clamp(sinus.rateBpm, 20, 300);
      } else if (junc) {
        config.heartRateBpm = junc.escapeRateBpm;
        config.rrIntervalMs = 60000 / clamp(junc.escapeRateBpm, 20, 300);
      } else if (vt) {
        config.heartRateBpm = vt.rateBpm;
        config.rrIntervalMs = 60000 / clamp(vt.rateBpm, 20, 300);
      }
      return;
    }
    case 'CONFIGURE_DEVICE': {
      Object.assign(config.device, modifier.device);
      return;
    }
    case 'SET_ST_RECIPE': {
      config.stRecipe = structuredClone(modifier.stRecipe);
      return;
    }
    case 'SET_U_RECIPE': {
      config.uWaveRecipe = structuredClone(modifier.uRecipe);
      return;
    }
    case 'SET_ATRIAL_REPOLARIZATION': {
      config.atrialRepolarization = structuredClone(modifier.config);
      return;
    }
    case 'SET_ELECTRICAL_ALTERNANS': {
      config.electricalAlternans = structuredClone(modifier.config);
      return;
    }
    case 'SET_PATIENT_AGE_GROUP': {
      config.patientAgeGroup = modifier.ageGroup;
      return;
    }
    default:
      assertNever(modifier);
  }
}

export function syncConductionDelayToTargetPR(
  config: ResolvedSimulationConfig,
  targetPrMs: number
): void {
  const fixedNonAvDelay =
    config.conductionNetwork.ATRIA.baseDelayMs +
    config.conductionNetwork.HIS.baseDelayMs +
    Math.min(
      config.conductionNetwork.RIGHT_BUNDLE.baseDelayMs,
      config.conductionNetwork.LEFT_BUNDLE.baseDelayMs
    ) +
    config.conductionNetwork.PURKINJE.baseDelayMs;

  config.conductionNetwork.AV_NODE.baseDelayMs = Math.max(
    20,
    targetPrMs - fixedNonAvDelay
  );
}
