/**
 * Clinical Presets Catalog (53 Canonical Educational Presets - All IMPLEMENTED)
 *
 * Disease/pattern names exist ONLY in this catalog and UI metadata.
 * Every preset compiles into a sequence of `Modifier` objects applied onto the
 * Canonical Normal Adult v1 configuration.
 */

import { clamp } from '../core/units';
import {
  ATRIAL_P_MITRALE_RECIPE,
  ATRIAL_P_PULMONALE_RECIPE,
  CANONICAL_NORMAL_QRS_RECIPE,
  ECTOPIC_RV_QRS_RECIPE,
  LAFB_QRS_RECIPE,
  LBBB_QRS_RECIPE,
  LPFB_QRS_RECIPE,
  makeSpatialDirection,
  PACED_RV_APEX_QRS_RECIPE,
  QRS_LATERAL_MI_RECIPE,
  QRS_LVH_RECIPE,
  QRS_PEDIATRIC_INFANT_RECIPE,
  QRS_PEDIATRIC_NEONATE_RECIPE,
  QRS_POSTERIOR_MI_RECIPE,
  QRS_RVH_RECIPE,
  RBBB_QRS_RECIPE,
  REPOL_JUVENILE_T_RECIPE,
  REPOL_LONG_QT_RECIPE,
  REPOL_POSTERIOR_MI_ACUTE_RECIPE,
  WPW_PREEXCITED_QRS_RECIPE,
} from '../morphology/recipes';
import { Modifier } from '../resolver/modifiers';
import {
  applyModifier,
  createCanonicalNormalConfig,
  ResolvedSimulationConfig,
} from '../resolver/resolvedConfig';
import { ClinicalPresetId, SimulationScenario } from '../scenario/types';

export type ImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'SCAFFOLD';

export type ClinicalPresetCategory =
  | 'NORMAL_AND_SINUS'
  | 'ECTOPIC'
  | 'BUNDLE_AND_FASCICULAR_BLOCK'
  | 'AV_CONDUCTION_BLOCK'
  | 'SUPRAVENTRICULAR_AND_PREEXCITATION'
  | 'VENTRICULAR_ARRHYTHMIA'
  | 'MYOCARDIAL_INFARCTION'
  | 'ELECTROLYTE_AND_CHANNELOPATHY'
  | 'PERICARDIAL_AND_CHAMBER_AXIS'
  | 'DEVICE_AND_ANATOMY'
  | 'PEDIATRIC_NORMAL';

export type ClinicalPresetDefinition = {
  id: ClinicalPresetId;
  name: string;
  nameJa: string;
  status: ImplementationStatus;
  primaryDomain: string;
  auditNotes: string;
  category: ClinicalPresetCategory;
  description: string;
  modifiers: Modifier[];
};

export const CLINICAL_PRESETS: Record<
  ClinicalPresetId,
  ClinicalPresetDefinition
> = {
  // ==========================================================================
  // 1. SINUS & SA NODE RHYTHMS (5)
  // ==========================================================================
  NORMAL_SINUS: {
    id: 'NORMAL_SINUS',
    name: 'Canonical Normal Sinus Rhythm',
    nameJa: '正常洞調律 (Canonical Normal Adult v1)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Baseline (Sinus + Purkinje 4-comp QRS + 2-comp P/T)',
    auditNotes:
      'HR 75 bpm, PR 160 ms, QRS 90 ms (+60°), T +45°, V1 rS, V3-V4 transition, V5/V6 qR, Lead II 10s strip consistent.',
    category: 'NORMAL_AND_SINUS',
    description:
      'HR 75 bpm, PR 160 ms, QRS 90 ms (+60°), T +45°, V3–V4 transition, isoelectric ST.',
    modifiers: [],
  },

  SINUS_BRADYCARDIA: {
    id: 'SINUS_BRADYCARDIA',
    name: 'Sinus Bradycardia',
    nameJa: '洞性徐脈',
    status: 'IMPLEMENTED',
    primaryDomain: 'Sinus Node (rateBpm=46) + QT rate adaptation',
    auditNotes:
      'HR 46 bpm (<60 bpm), normal sinus P (+50°), 1:1 AV conduction (PR 168 ms), narrow QRS (90 ms).',
    category: 'NORMAL_AND_SINUS',
    description:
      'Regular sinus rhythm at 46 bpm with 1:1 AV conduction, PR 168 ms, and rate-adapted QT 430 ms.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 46 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 168 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 430 },
    ],
  },

  SINUS_TACHYCARDIA: {
    id: 'SINUS_TACHYCARDIA',
    name: 'Sinus Tachycardia',
    nameJa: '洞性頻脈',
    status: 'IMPLEMENTED',
    primaryDomain: 'Sinus Node (rateBpm=118) + Sympathetic AV/QT shortening',
    auditNotes:
      'HR 118 bpm (>100 bpm), upright sinus P in I/II/aVF, negative in aVR, PR 142 ms, narrow QRS 86 ms.',
    category: 'NORMAL_AND_SINUS',
    description:
      'Regular sinus tachycardia at 118 bpm with visible sinus P waves before every narrow QRS.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 118 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 142 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 86 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 320 },
    ],
  },

  SINUS_PAUSE_ARREST: {
    id: 'SINUS_PAUSE_ARREST',
    name: 'Sinus Pause / Sinus Arrest',
    nameJa: '洞休止・洞停止',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Sinus Node (pauseAtMs=3000, pauseDurationMs=2260 -> 2.74s = 3.425x PP non-integer pause)',
    auditNotes:
      'Basic cycle PP=800 ms (75 bpm); pause from 2520 ms to 5260 ms = 2740 ms (2.74s = 3.425x PP, strictly non-integer multiple).',
    category: 'NORMAL_AND_SINUS',
    description:
      'Sinus rhythm (75 bpm, PP=800 ms) interrupted by a 2.74-second non-integer-multiple sinus arrest pause (3.425 × PP).',
    modifiers: [
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'SINUS_NODE',
            id: 'SA_ARREST_NODE',
            enabled: true,
            rateBpm: 75,
            regularityJitterRatio: 0,
            pauseAtMs: 3000,
            pauseDurationMs: 2260,
          },
        ],
      },
    ],
  },

  SA_EXIT_BLOCK: {
    id: 'SA_EXIT_BLOCK',
    name: 'Sinoatrial (SA) Exit Block (2nd Degree Type II)',
    nameJa: '洞房ブロック (第2度 II型・整数倍休止期)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (SA_EXIT INTERMITTENT_BLOCK 4:3 -> exact 2.00x PP = 1600 ms pause)',
    auditNotes:
      'Uninterrupted SA node clock (PP=800 ms) with every 4th impulse blocked at SA_EXIT, producing an exact 2×PP (1600 ms) pause.',
    category: 'NORMAL_AND_SINUS',
    description:
      'Uninterrupted SA node pacemaker (PP=800 ms) with intermittent 4:3 SA exit block yielding an exact 2×PP (1600 ms) pause.',
    modifiers: [
      {
        type: 'MODIFY_CONDUCTION_PATH',
        pathId: 'SA_EXIT',
        changes: {
          behavior: 'INTERMITTENT_BLOCK',
          intermittentBlockConfig: {
            conductionRatioN: 4,
            dropEveryKthAttempt: 4,
          },
        },
      },
    ],
  },

  // ==========================================================================
  // 2. ECTOPIC BEATS (2)
  // ==========================================================================
  PAC: {
    id: 'PAC',
    name: 'Premature Atrial Contraction (PAC)',
    nameJa: '心房期外収縮 (PAC)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Atrial Ectopic Focus + Ectopic P Recipe + SA Node Reset (Incomplete Compensatory Pause)',
    auditNotes:
      'Premature ectopic P wave with abnormal axis (-25°), narrow QRS (90 ms), and SA node phase reset.',
    category: 'ECTOPIC',
    description:
      'Sinus rhythm with premature atrial contractions showing abnormal P morphology, narrow QRS, and incomplete compensatory pause.',
    modifiers: [
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'SINUS_NODE',
            id: 'SA_NODE_PAC',
            enabled: true,
            rateBpm: 72,
            regularityJitterRatio: 0,
          },
          {
            type: 'ATRIAL_ECTOPIC',
            id: 'PAC_FOCUS',
            enabled: true,
            couplingIntervalMs: 460,
            everyNthSinusBeat: 4,
            focusRegion: 'LOW_ATRIA',
            resetsSinusNode: true,
          },
        ],
      },
    ],
  },

  PVC: {
    id: 'PVC',
    name: 'Premature Ventricular Contraction (PVC)',
    nameJa: '心室期外収縮 (PVC)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Ventricular Ectopic Focus + ECTOPIC_RV_QRS_RECIPE (148 ms) + Concealed AV Penetration (Full Compensatory Pause)',
    auditNotes:
      'Premature wide bizarre QRS (148 ms) without preceding P wave, discordant ST-T, and retrograde AV nodal refractoriness.',
    category: 'ECTOPIC',
    description:
      'Sinus rhythm with monomorphic PVCs (QRS 148 ms, discordant T wave, full compensatory pause).',
    modifiers: [
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'SINUS_NODE',
            id: 'SA_NODE_PVC',
            enabled: true,
            rateBpm: 72,
            regularityJitterRatio: 0,
          },
          {
            type: 'VENTRICULAR_ECTOPIC',
            id: 'PVC_FOCUS',
            enabled: true,
            couplingIntervalMs: 440,
            everyNthBeat: 4,
            originFocus: 'RV_OUTFLOW',
            blocksNextSinusRetrograde: true,
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // 3. INTRAVENTRICULAR CONDUCTION BLOCKS (4)
  // ==========================================================================
  RBBB: {
    id: 'RBBB',
    name: 'Complete Right Bundle Branch Block (RBBB)',
    nameJa: '完全右脚ブロック (RBBB)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (RIGHT_BUNDLE disabled) + RBBB_QRS_RECIPE (138 ms) + Secondary Discordance',
    auditNotes:
      'QRS 138 ms (>=120 ms), rsR\' M-shaped pattern in V1-V2, wide slurred terminal S wave in I, aVL, V5, V6, discordant T in V1-V2.',
    category: 'BUNDLE_AND_FASCICULAR_BLOCK',
    description:
      'Complete RBBB (QRS 138 ms) with rsR\' in V1–V2, wide slurred terminal S wave in I/V5/V6, and right precordial secondary T inversion.',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'RIGHT_BUNDLE' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 138 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: RBBB_QRS_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.85,
      },
    ],
  },

  LBBB: {
    id: 'LBBB',
    name: 'Complete Left Bundle Branch Block (LBBB)',
    nameJa: '完全左脚ブロック (LBBB)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (LEFT_BUNDLE disabled) + LBBB_QRS_RECIPE (142 ms) + Secondary Discordance',
    auditNotes:
      'QRS 142 ms (>=120 ms), broad monophasic/slurred R in I, aVL, V5, V6 (no septal Q), deep QS in V1-V2, discordant ST-T.',
    category: 'BUNDLE_AND_FASCICULAR_BLOCK',
    description:
      'Complete LBBB (QRS 142 ms) with absent lateral septal Q, broad slurred R in I/aVL/V5/V6, deep QS in V1–V2, and discordant ST-T.',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'LEFT_BUNDLE' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 142 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 15 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: LBBB_QRS_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.92,
      },
    ],
  },

  LAFB: {
    id: 'LAFB',
    name: 'Left Anterior Fascicular Block (LAFB)',
    nameJa: '左脚前枝ブロック (LAFB)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Conduction (LAF disabled) + LAFB_QRS_RECIPE (104 ms, axis -52°)',
    auditNotes:
      'Marked left axis deviation (-52°), qR in I/aVL, rS in II/III/aVF, QRS duration 104 ms (<120 ms).',
    category: 'BUNDLE_AND_FASCICULAR_BLOCK',
    description:
      'Marked left axis deviation (-52°) with initial r and deep S (rS) in II/III/aVF, qR in I/aVL, and QRS 104 ms.',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'LAF' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 104 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: -52 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: LAFB_QRS_RECIPE,
      },
    ],
  },

  LPFB: {
    id: 'LPFB',
    name: 'Left Posterior Fascicular Block (LPFB)',
    nameJa: '左脚後枝ブロック (LPFB)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Conduction (LPF disabled) + LPFB_QRS_RECIPE (104 ms, axis +118°)',
    auditNotes:
      'Right axis deviation (+118°), rS in I/aVL, qR in II/III/aVF, QRS duration 104 ms (<120 ms).',
    category: 'BUNDLE_AND_FASCICULAR_BLOCK',
    description:
      'Right axis deviation (+118°) with rS in I/aVL, qR in II/III/aVF, and QRS 104 ms (<120 ms).',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'LPF' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 104 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 118 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: LPFB_QRS_RECIPE,
      },
    ],
  },

  // ==========================================================================
  // 4. ATRIOVENTRICULAR CONDUCTION BLOCKS (4)
  // ==========================================================================
  AVB_1ST_DEGREE: {
    id: 'AVB_1ST_DEGREE',
    name: 'First-Degree AV Block',
    nameJa: '第1度房室ブロック',
    status: 'IMPLEMENTED',
    primaryDomain: 'Conduction (AV_NODE fixed prolongation, PR=256 ms)',
    auditNotes:
      'Every P wave conducts 1:1 to a narrow QRS (90 ms) with a constant prolonged PR interval of 256 ms (>200 ms).',
    category: 'AV_CONDUCTION_BLOCK',
    description:
      'Sinus rhythm (72 bpm) with 1:1 AV conduction and constant prolonged PR interval (256 ms).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 72 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 256 },
    ],
  },

  AVB_WENCKEBACH: {
    id: 'AVB_WENCKEBACH',
    name: 'Second-Degree AV Block (Mobitz Type I / Wenckebach)',
    nameJa: '第2度房室ブロック (Wenckebach型 / Mobitz I型)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (AV_NODE DECREMENTAL fatigue/recovery -> progressive PR lengthening & grouped beating)',
    auditNotes:
      'Progressive PR prolongation (e.g. 175 -> 235 -> 295 ms) followed by a non-conducted sinus P wave and shortened post-block PR.',
    category: 'AV_CONDUCTION_BLOCK',
    description:
      'Decremental AV nodal conduction with progressive PR prolongation culminating in a blocked P wave (grouped beating).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 78 },
      {
        type: 'MODIFY_CONDUCTION_PATH',
        pathId: 'AV_NODE',
        changes: {
          baseDelayMs: 110,
          behavior: 'DECREMENTAL',
          decrementalConfig: {
            fatigueIncrementPerImpulse: 0.42,
            fatigueRecoveryTauMs: 1450,
            maxDelayIncrementMs: 165,
            blockFatigueThreshold: 0.92,
          },
        },
      },
    ],
  },

  AVB_MOBITZ_II: {
    id: 'AVB_MOBITZ_II',
    name: 'Second-Degree AV Block (Mobitz Type II)',
    nameJa: '第2度房室ブロック (Mobitz II型)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (HIS INTERMITTENT_BLOCK 4:3 with constant PR=168 ms on conducted beats)',
    auditNotes:
      'Constant PR interval (168 ms) on all conducted beats with sudden intermittent failure of His-Purkinje conduction (4:3 ratio).',
    category: 'AV_CONDUCTION_BLOCK',
    description:
      'Fixed PR interval (168 ms) across conducted beats with sudden intermittent non-conducted sinus P waves (4:3 conduction).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 76 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 168 },
      {
        type: 'MODIFY_CONDUCTION_PATH',
        pathId: 'HIS',
        changes: {
          behavior: 'INTERMITTENT_BLOCK',
          intermittentBlockConfig: {
            conductionRatioN: 4,
            dropEveryKthAttempt: 4,
          },
        },
      },
    ],
  },

  AVB_COMPLETE: {
    id: 'AVB_COMPLETE',
    name: 'Third-Degree (Complete) AV Block',
    nameJa: '第3度 (完全) 房室ブロック',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Conduction (AV_NODE disabled) + Independent Sinus (82 bpm) & Narrow Junctional Escape (44 bpm)',
    auditNotes:
      'Complete AV dissociation: regular sinus P waves at 82 bpm (PP=732 ms) and independent regular junctional escape narrow QRS at 44 bpm (RR=1364 ms).',
    category: 'AV_CONDUCTION_BLOCK',
    description:
      'Complete AV dissociation with regular sinus P waves (82 bpm) and independent regular narrow-QRS junctional escape rhythm (44 bpm).',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'AV_NODE' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 92 },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'SINUS_NODE',
            id: 'SA_DISSOCIATED',
            enabled: true,
            rateBpm: 82,
            regularityJitterRatio: 0,
          },
          {
            type: 'JUNCTIONAL_ESCAPE',
            id: 'JUNCTIONAL_ESCAPE_CHB',
            enabled: true,
            escapeRateBpm: 44,
            isPrimaryAccelerated: false,
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // 5. SUPRAVENTRICULAR & PRE-EXCITATION ARRHYTHMIAS (5)
  // ==========================================================================
  ATRIAL_FIBRILLATION: {
    id: 'ATRIAL_FIBRILLATION',
    name: 'Atrial Fibrillation (AF)',
    nameJa: '心房細動 (AF)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Fibrillatory Atrial Wavelets + Stochastic AV Nodal Filtering (Irregularly Irregular RR)',
    auditNotes:
      'Complete absence of organized sinus P waves, continuous fine/coarse f-wave baseline undulation, irregularly irregular narrow QRS (~92 bpm).',
    category: 'SUPRAVENTRICULAR_AND_PREEXCITATION',
    description:
      'Absent sinus P waves, continuous fibrillatory f-waves, and irregularly irregular narrow QRS ventricular response (~92 bpm).',
    modifiers: [
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'ATRIAL_FIBRILLATION',
            id: 'AF_SOURCE',
            enabled: true,
            meanVentricularResponseBpm: 92,
            irregularityIndex: 0.28,
            fWaveAmplitudeMv: 0.085,
            fWaveFrequencyHz: 6.4,
          },
        ],
      },
    ],
  },

  ATRIAL_FLUTTER: {
    id: 'ATRIAL_FLUTTER',
    name: 'Atrial Flutter (Typical 4:1 Conduction)',
    nameJa: '心房粗動 (典型型 4:1伝導・鋸歯状F波)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Macro-reentrant Atrial Flutter (300 bpm F waves) + 4:1 AV Nodal Filtering (~75 bpm Ventricular Rate)',
    auditNotes:
      'Continuous 300 bpm negative sawtooth F waves in II/III/aVF with regular 4:1 AV conduction (ventricular rate 75 bpm) for unmistakable F-wave visibility.',
    category: 'SUPRAVENTRICULAR_AND_PREEXCITATION',
    description:
      'Macro-reentrant atrial flutter at 300 bpm (sawtooth F waves in II/III/aVF) with regular 4:1 AV conduction (ventricular rate 75 bpm).',
    modifiers: [
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'ATRIAL_FLUTTER',
            id: 'FLUTTER_300',
            enabled: true,
            atrialRateBpm: 300,
          },
        ],
      },
      {
        type: 'MODIFY_CONDUCTION_PATH',
        pathId: 'AV_NODE',
        changes: {
          refractoryPeriodMs: 680,
        },
      },
    ],
  },

  WPW_SYNDROME: {
    id: 'WPW_SYNDROME',
    name: 'Wolff-Parkinson-White (WPW) Pre-excitation Syndrome',
    nameJa: 'WPW症候群 (デルタ波・短縮PR)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Parallel Accessory Pathway (Bundle of Kent) + WPW_PREEXCITED_QRS_RECIPE (PR 96 ms, QRS 128 ms)',
    auditNotes:
      'Short PR interval (96 ms <120 ms), slurred initial delta wave widening QRS to 128 ms, and mild secondary repolarization discordance.',
    category: 'SUPRAVENTRICULAR_AND_PREEXCITATION',
    description:
      'Sinus rhythm with accessory pathway pre-excitation: short PR (96 ms), slurred delta wave onset, and broadened QRS (128 ms).',
    modifiers: [
      {
        type: 'MODIFY_CONDUCTION_PATH',
        pathId: 'ACCESSORY_PATHWAY',
        changes: {
          enabled: true,
          baseDelayMs: 22,
        },
      },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 96 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 128 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: WPW_PREEXCITED_QRS_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.45,
      },
    ],
  },

  JUNCTIONAL_RHYTHM: {
    id: 'JUNCTIONAL_RHYTHM',
    name: 'AV Junctional Escape Rhythm',
    nameJa: '房室接合部調律',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Junctional Pacemaker (48 bpm) + Narrow Purkinje QRS (88 ms) + Short Retrograde Inverted P (-90°)',
    auditNotes:
      'Regular bradycardic rhythm at 48 bpm, narrow supraventricular QRS (88 ms), and inverted retrograde P wave in II/III/aVF (upright in aVR).',
    category: 'SUPRAVENTRICULAR_AND_PREEXCITATION',
    description:
      'Regular AV junctional rhythm at 48 bpm with narrow QRS (88 ms) and retrograde negative P waves in II, III, aVF.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 88 },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'JUNCTIONAL_ESCAPE',
            id: 'PRIMARY_JUNCTIONAL',
            enabled: true,
            escapeRateBpm: 48,
            isPrimaryAccelerated: false,
            retrogradeAtrialOffsetMs: -54,
            retrogradeAtrialAmplitudeScale: 0.78,
            retrogradeAtrialAxisDeg: -90,
          },
        ],
      },
    ],
  },

  PSVT_REGULAR_NARROW: {
    id: 'PSVT_REGULAR_NARROW',
    name: 'Paroxysmal Supraventricular Tachycardia (PSVT - AVNRT Pattern)',
    nameJa: '発作性上室頻拍 (PSVT / AVNRT典型型)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'AV Nodal Reentrant Tachycardia (185 bpm, narrow QRS 82 ms) + Short-RP Retrograde Atrial Wave (pseudo-r\' V1 / pseudo-S II,III,aVF)',
    auditNotes:
      'Regular narrow-QRS tachycardia at 185 bpm (RR=324 ms), absent preceding sinus P, retrograde P at +58 ms producing pseudo-r\' in V1 and pseudo-S in II/III/aVF.',
    category: 'SUPRAVENTRICULAR_AND_PREEXCITATION',
    description:
      'Regular narrow-complex tachycardia at 185 bpm (QRS 82 ms) with retrograde P buried at terminal QRS (pseudo-r\' in V1, pseudo-S in II/III/aVF).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 82 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 245 },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'JUNCTIONAL_ESCAPE',
            id: 'AVNRT_REENTRANT_CIRCUIT',
            enabled: true,
            escapeRateBpm: 185,
            isPrimaryAccelerated: true,
            retrogradeAtrialOffsetMs: 58,
            retrogradeAtrialAmplitudeScale: 0.75,
            retrogradeAtrialAxisDeg: -90,
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // 6. VENTRICULAR ARRHYTHMIAS (2)
  // ==========================================================================
  VENTRICULAR_TACHYCARDIA: {
    id: 'VENTRICULAR_TACHYCARDIA',
    name: 'Sustained Monomorphic Ventricular Tachycardia (VT)',
    nameJa: '持続性単形性心室頻拍 (Monomorphic VT)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Ventricular Ectopic Tachycardia (168 bpm) + Wide ECTOPIC_RV_QRS_RECIPE (156 ms) + Secondary Discordance',
    auditNotes:
      'Regular wide-complex tachycardia at 168 bpm (QRS 156 ms), consistent monomorphic ventricular morphology, discordant ST-T.',
    category: 'VENTRICULAR_ARRHYTHMIA',
    description:
      'Sustained regular wide-QRS tachycardia at 168 bpm (QRS 156 ms) with discordant ST-T segments.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 156 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 280 },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'VENTRICULAR_TACHYCARDIA',
            id: 'VT_MONO',
            enabled: true,
            rateBpm: 168,
            polymorphicTwistHz: 0,
          },
        ],
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.9,
      },
    ],
  },

  TORSADES_DE_POINTES: {
    id: 'TORSADES_DE_POINTES',
    name: 'Torsades de Pointes (Polymorphic VT)',
    nameJa: 'Torsades de Pointes (多形性心室頻拍)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Polymorphic VT (215 bpm, twist=0.42 Hz) with continuous 3D QRS axis & amplitude rotation around baseline',
    auditNotes:
      'Rapid polymorphic wide-QRS tachycardia (215 bpm) with waxing/waning spindle-shaped envelope and twisting QRS axis.',
    category: 'VENTRICULAR_ARRHYTHMIA',
    description:
      'Rapid polymorphic ventricular tachycardia (215 bpm) with characteristic sinusoidal twisting of QRS axis and amplitude around the baseline.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 152 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 240 },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'VENTRICULAR_TACHYCARDIA',
            id: 'TORSADES_SOURCE',
            enabled: true,
            rateBpm: 215,
            polymorphicTwistHz: 0.42,
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // 7. MYOCARDIAL INFARCTION & ISCHEMIA (8)
  // ==========================================================================
  ANTEROSEPTAL_MI_ACUTE: {
    id: 'ANTEROSEPTAL_MI_ACUTE',
    name: 'Acute Anteroseptal STEMI',
    nameJa: '急性前壁中隔心筋梗塞 (Acute Anteroseptal STEMI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Loss of Septal/Anterior R (QS/QR in V1-V4) + Anterior Epicardial Injury Vector (+Z, +septal, +rvAnterior)',
    auditNotes:
      'Convex ST elevation and hyperacute T waves in V1-V4, loss of anterior R waves, mild reciprocal inferior ST depression.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Acute anteroseptal STEMI with QS/pathological Q and convex ST elevation in V1–V4 plus hyperacute anterior T waves.',
    modifiers: [
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: {
          id: 'QRS_ANTEROSEPTAL_STEMI',
          name: 'Anteroseptal Infarction Activation (Loss of Septal/Anterior Force)',
          referenceAxisDeg: 62,
          components: [
            {
              id: 'AS_MI_QS_ONSET',
              description: 'Loss of anterior septal force -> posterior escape vector (QS in V1-V3)',
              startFraction: 0.0,
              durationFraction: 42 / 94,
              magnitude: 0.85,
              kernel: { type: 'BETA', alpha: 2.3, beta: 2.5 },
              spatialDirection: {
                global: { x: +0.25, y: +0.35, z: -0.92 },
                regional: {
                  septal: -0.95,
                  rvAnterior: -0.88,
                  lvLateral: +0.25,
                  inferior: +0.2,
                  posterobasal: +0.35,
                },
              },
            },
            CANONICAL_NORMAL_QRS_RECIPE.components[2]!,
            CANONICAL_NORMAL_QRS_RECIPE.components[3]!,
          ],
        },
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_ANTEROSEPTAL_STEMI',
          enabled: true,
          injurySource: {
            global: { x: +0.18, y: -0.22, z: +0.96 },
            regional: {
              septal: +1.15,
              rvAnterior: +1.25,
              lvLateral: +0.18,
              inferior: -0.32,
              posterobasal: -0.25,
            },
          },
          magnitudeMv: 0.34,
          plateauSlope: 0.18,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        tAmplitudeScale: 1.45,
      },
    ],
  },

  ANTEROSEPTAL_MI_OLD: {
    id: 'ANTEROSEPTAL_MI_OLD',
    name: 'Prior (Old) Anteroseptal Myocardial Infarction',
    nameJa: '陳旧性前壁中隔心筋梗塞 (Prior Anteroseptal MI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Persistent Anterior Necrosis Vector (QS in V1-V3) + Isoelectric ST + Anterior T Inversion',
    auditNotes:
      'Pathological QS complexes in V1-V3 with poor R progression, baseline (isoelectric) ST segments, and chronic anterior T inversion.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Prior anteroseptal myocardial infarction with persistent QS complexes in V1–V3, resolved (isoelectric) ST segment, and chronic anterior T inversion.',
    modifiers: [
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: {
          id: 'QRS_ANTEROSEPTAL_OLD_MI',
          name: 'Prior Anteroseptal Infarction Activation (Persistent QS V1-V3)',
          referenceAxisDeg: 62,
          components: [
            {
              id: 'AS_OLD_QS_ONSET',
              description: 'Permanent loss of anterior septal force (0-45 ms)',
              startFraction: 0.0,
              durationFraction: 45 / 94,
              magnitude: 0.92,
              kernel: { type: 'BETA', alpha: 2.3, beta: 2.5 },
              spatialDirection: {
                global: { x: +0.25, y: +0.35, z: -0.95 },
                regional: {
                  septal: -1.05,
                  rvAnterior: -0.92,
                  lvLateral: +0.25,
                  inferior: +0.2,
                  posterobasal: +0.35,
                },
              },
            },
            CANONICAL_NORMAL_QRS_RECIPE.components[2]!,
            CANONICAL_NORMAL_QRS_RECIPE.components[3]!,
          ],
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.45,
        tAmplitudeScale: 0.78,
      },
    ],
  },

  INFERIOR_MI_ACUTE: {
    id: 'INFERIOR_MI_ACUTE',
    name: 'Acute Inferior STEMI',
    nameJa: '急性下壁心筋梗塞 (Acute Inferior STEMI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Inferior Q + Inferior Epicardial Injury Vector (+Y, +inferior, -lvLateral) -> STE in II/III/aVF & Reciprocal STD in I/aVL',
    auditNotes:
      'Marked ST elevation in II, III, aVF with developing inferior Q waves and classic mirror-image reciprocal ST depression in I and aVL.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Acute inferior STEMI with ST elevation and early Q waves in II, III, aVF and reciprocal ST depression in I and aVL.',
    modifiers: [
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: {
          id: 'QRS_INFERIOR_STEMI',
          name: 'Inferior Infarction Activation (Initial Superior Q Vector)',
          referenceAxisDeg: 35,
          components: [
            {
              id: 'INF_MI_Q',
              description: 'Initial superiorly directed depolarization away from infarcted inferior wall (0-38 ms)',
              startFraction: 0.0,
              durationFraction: 38 / 92,
              magnitude: 0.78,
              kernel: { type: 'BETA', alpha: 2.2, beta: 2.5 },
              spatialDirection: {
                global: { x: +0.32, y: -0.88, z: +0.35 },
                regional: {
                  septal: +0.45,
                  rvAnterior: +0.25,
                  lvLateral: +0.38,
                  inferior: -0.95,
                  posterobasal: 0,
                },
              },
            },
            CANONICAL_NORMAL_QRS_RECIPE.components[2]!,
            CANONICAL_NORMAL_QRS_RECIPE.components[3]!,
          ],
        },
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_INFERIOR_STEMI',
          enabled: true,
          injurySource: {
            global: { x: -0.42, y: +0.96, z: -0.15 },
            regional: {
              septal: 0,
              rvAnterior: +0.1,
              lvLateral: -0.65,
              inferior: +1.35,
              posterobasal: +0.25,
            },
          },
          magnitudeMv: 0.32,
          plateauSlope: 0.16,
        },
      },
    ],
  },

  INFERIOR_MI_OLD: {
    id: 'INFERIOR_MI_OLD',
    name: 'Prior (Old) Inferior Myocardial Infarction',
    nameJa: '陳旧性下壁心筋梗塞 (Prior Inferior MI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Persistent Pathological Q in II/III/aVF + Isoelectric ST + Inferior T Flattening/Inversion',
    auditNotes:
      'Deep wide pathological Q waves (>=40 ms) in II, III, aVF with resolved (isoelectric) ST segments and chronic inferior T inversion.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Prior inferior myocardial infarction with pathological Q waves in II, III, aVF, isoelectric ST segments, and chronic inferior T inversion.',
    modifiers: [
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: {
          id: 'QRS_INFERIOR_OLD_MI',
          name: 'Prior Inferior Infarction Activation (Deep Inferior Pathological Q)',
          referenceAxisDeg: 28,
          components: [
            {
              id: 'INF_OLD_PATH_Q',
              description: 'Broad initial superior vector (pathological Q in II/III/aVF, 0-42 ms)',
              startFraction: 0.0,
              durationFraction: 42 / 94,
              magnitude: 0.94,
              kernel: { type: 'BETA', alpha: 2.2, beta: 2.4 },
              spatialDirection: {
                global: { x: +0.35, y: -0.94, z: +0.32 },
                regional: {
                  septal: +0.45,
                  rvAnterior: +0.22,
                  lvLateral: +0.42,
                  inferior: -1.12,
                  posterobasal: 0,
                },
              },
            },
            CANONICAL_NORMAL_QRS_RECIPE.components[2]!,
            CANONICAL_NORMAL_QRS_RECIPE.components[3]!,
          ],
        },
      },
      {
        type: 'SET_SPATIAL_AXIS',
        target: 'T',
        axisDeg: -25,
      },
    ],
  },

  LATERAL_MI_ACUTE: {
    id: 'LATERAL_MI_ACUTE',
    name: 'Acute Lateral STEMI',
    nameJa: '急性側壁心筋梗塞 (Acute Lateral STEMI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_LATERAL_MI_RECIPE + Lateral Epicardial Injury Vector (+X, -Y, +lvLateral) -> STE in I/aVL/V5/V6 & Reciprocal STD in II/III/aVF',
    auditNotes:
      'Promoted to IMPLEMENTED: ST elevation and Q waves in I, aVL, V5, V6 with reciprocal ST depression in inferior leads II, III, aVF.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Acute lateral STEMI with ST elevation and pathological Q waves in I, aVL, V5, V6 and reciprocal ST depression in II, III, aVF.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 94 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 78 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_LATERAL_MI_RECIPE,
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_LATERAL_STEMI',
          enabled: true,
          injurySource: {
            global: { x: +0.88, y: -0.46, z: -0.25 },
            regional: {
              septal: -0.15,
              rvAnterior: -0.25,
              lvLateral: +1.25,
              inferior: -0.75,
              posterobasal: +0.18,
            },
          },
          magnitudeMv: 0.28,
          plateauSlope: 0.15,
        },
      },
    ],
  },

  LATERAL_MI_PRIOR: {
    id: 'LATERAL_MI_PRIOR',
    name: 'Prior (Old) Lateral Myocardial Infarction',
    nameJa: '陳旧性側壁心筋梗塞 (Prior Lateral MI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_LATERAL_MI_RECIPE (Pathological Q & Reduced R in I/aVL/V5/V6) + Isoelectric ST + Lateral T Inversion',
    auditNotes:
      'Pathological Q waves and reduced R amplitude in I, aVL, V5, V6, baseline ST segment (no acute STE), and lateral T-wave inversion.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Prior lateral myocardial infarction with persistent Q waves and reduced R waves in I, aVL, V5, V6, isoelectric ST, and lateral T inversion.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 94 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 78 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_LATERAL_MI_RECIPE,
      },
      {
        type: 'SET_SPATIAL_AXIS',
        target: 'T',
        axisDeg: 105,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        tAmplitudeScale: 0.72,
      },
    ],
  },

  POSTERIOR_MI_ACUTE: {
    id: 'POSTERIOR_MI_ACUTE',
    name: 'Acute Posterior Myocardial Infarction',
    nameJa: '急性後壁心筋梗塞 (Acute Posterior MI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_POSTERIOR_MI_RECIPE (Tall Broad R in V1-V3) + Posterior Injury Vector (-Z, -rvAnterior) -> Horizontal STD in V1-V3 + Upright Anterior T',
    auditNotes:
      'Mirror-image acute posterior STEMI in V1-V3: horizontal ST depression (-0.22 mV), tall broad R waves (R/S > 1), and prominent upright T waves in V1-V3.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Acute posterior MI presenting in V1–V3 as horizontal ST depression, tall broad R waves (R/S > 1), and upright anterior T waves.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 96 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 55 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_POSTERIOR_MI_RECIPE,
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_POSTERIOR_STEMI_MIRROR',
          enabled: true,
          injurySource: {
            global: { x: -0.1, y: +0.18, z: -0.96 },
            regional: {
              septal: -0.85,
              rvAnterior: -1.28,
              lvLateral: -0.1,
              inferior: +0.22,
              posterobasal: +1.15,
            },
          },
          magnitudeMv: 0.28,
          plateauSlope: 0.05,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_POSTERIOR_MI_ACUTE_RECIPE,
        tAmplitudeScale: 1.25,
      },
    ],
  },

  POSTERIOR_MI_PRIOR: {
    id: 'POSTERIOR_MI_PRIOR',
    name: 'Prior (Old) Posterior Myocardial Infarction',
    nameJa: '陳旧性後壁心筋梗塞 (Prior Posterior MI)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_POSTERIOR_MI_RECIPE (Persistent Tall Broad R in V1-V3 as Posterior Q Equivalent) + Isoelectric ST',
    auditNotes:
      'Persistent tall broad R waves (R/S > 1) in V1-V3 (mirror image of posterior pathological Q wave), normal QRS duration (<120 ms), and no acute ST depression.',
    category: 'MYOCARDIAL_INFARCTION',
    description:
      'Prior posterior MI with persistent tall broad R waves (R/S > 1) and upright T waves in V1–V3 without acute ST segment depression.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 96 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 55 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_POSTERIOR_MI_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_POSTERIOR_MI_ACUTE_RECIPE,
        tAmplitudeScale: 1.0,
      },
    ],
  },

  // ==========================================================================
  // 8. ELECTROLYTE & REPOLARIZATION SYNDROMES (5)
  // ==========================================================================
  HYPERKALEMIA: {
    id: 'HYPERKALEMIA',
    name: 'Hyperkalemia (Moderate-to-Severe)',
    nameJa: '高カリウム血症 (テント状T波・PR延長・QRS幅増大)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Peaked Narrow-Base Symmetric T Wave + Flattened/Broadened P + PR Prolongation (215 ms) + QRS Widening (112 ms)',
    auditNotes:
      'Tall symmetric tented T waves across V2-V5 and II, reduced P amplitude, PR 215 ms, QRS 112 ms.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Tall symmetric peaked ("tented") T waves, flattened P waves, prolonged PR interval (215 ms), and widened QRS (112 ms).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'pAmplitudeScale', value: 0.45 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 118 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 215 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 112 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 350 },
      { type: 'SET_PARAMETER', key: 'tAmplitudeScale', value: 2.45 },
    ],
  },

  HYPOKALEMIA: {
    id: 'HYPOKALEMIA',
    name: 'Hypokalemia',
    nameJa: '低カリウム血症 (T波平低化・ST低下・著明なU波)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Flattened T Wave + Mild ST Depression + Prominent Post-T U Wave (V2-V5, II)',
    auditNotes:
      'Reduced T amplitude (0.38x), mild diffuse ST depression (-0.08 mV), and prominent upright U waves in V2-V5 and II.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Flattened T waves, mild ST segment depression, and prominent upright U waves (best seen in V2–V5 and Lead II).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'tAmplitudeScale', value: 0.38 },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_HYPOKALEMIA',
          enabled: true,
          injurySource: makeSpatialDirection(-135, -0.45, 0.85, {
            rvAnterior: -0.35,
            lvLateral: -0.45,
            inferior: -0.35,
          }),
          magnitudeMv: 0.11,
          plateauSlope: -0.05,
        },
      },
      {
        type: 'SET_U_RECIPE',
        uRecipe: {
          enabled: true,
          delayAfterTEndMs: 8,
          durationMs: 165,
          magnitude: 0.26,
          spatialDirection: makeSpatialDirection(48, +0.48, 0.9, {
            rvAnterior: +0.52,
            lvLateral: +0.48,
            inferior: +0.35,
          }),
        },
      },
    ],
  },

  HYPERCALCEMIA: {
    id: 'HYPERCALCEMIA',
    name: 'Hypercalcemia (Short QT Pattern)',
    nameJa: '高カルシウム血症 (ST部分消失・QT短縮)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Markedly Shortened Ventricular Repolarization (QT=275 ms, QTc ~ 300 ms)',
    auditNotes:
      'Shortened QT interval (275 ms at 72 bpm, QTc ~ 301 ms) due to virtual absence of the ST plateau.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Abbreviated ST segment with early-peaking T wave and markedly shortened QT interval (QT 275 ms, QTc ~301 ms).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 72 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 275 },
    ],
  },

  HYPOCALCEMIA: {
    id: 'HYPOCALCEMIA',
    name: 'Hypocalcemia (Prolonged ST Segment & Long QT)',
    nameJa: '低カルシウム血症 (ST部分延長によるQT延長)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Prolonged Isoelectric ST Segment Extending QT Interval (QT=475 ms)',
    auditNotes:
      'Prolonged QT interval (475 ms at 72 bpm, QTc ~ 520 ms) with normal T wave width following a long isoelectric ST segment.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Prolonged QT interval (475 ms, QTc ~520 ms) driven by lengthening of the isoelectric ST segment with preserved T morphology.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 72 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 475 },
    ],
  },

  LONG_QT_PATTERN: {
    id: 'LONG_QT_PATTERN',
    name: 'Congenital / Acquired Long QT Syndrome Pattern (LQTS)',
    nameJa: 'QT延長症候群パターン (Long QT Syndrome)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Prolonged Ventricular Repolarization Episode (QT=495 ms at 68 bpm, QTc=527 ms) + REPOL_LONG_QT_RECIPE',
    auditNotes:
      'Sinus rhythm at 68 bpm (RR=882 ms), normal QRS (88 ms), markedly prolonged QT (495 ms, Bazett QTc=527 ms) with broad late-peaking T wave.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Sinus rhythm (68 bpm) with prolonged ventricular repolarization (QT 495 ms, QTc 527 ms) and broad, late-terminating T waves in II and V2–V6.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 68 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 88 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 495 },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_LONG_QT_RECIPE,
        tAmplitudeScale: 1.15,
      },
    ],
  },

  // ==========================================================================
  // 9. PERICARDIAL & CHANNELOPATHY DISORDERS (4)
  // ==========================================================================
  ACUTE_PERICARDITIS: {
    id: 'ACUTE_PERICARDITIS',
    name: 'Acute Pericarditis',
    nameJa: '急性心膜炎 (広範な凹型ST上昇・PR低下・aVR PR上昇)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Global Epicardial ST Vector (Diffuse Concave STE, aVR STD) + Explicit Atrial Repolarization Source (PR Depression in I/II/V3-V6 & PR Elevation in aVR)',
    auditNotes:
      'Widespread concave ST elevation across I, II, III, aVL, aVF, V2-V6 with ST depression in aVR, PLUS explicit atrial repolarization injury producing PR depression in II/V3-V6 and PR elevation in aVR.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Diffuse concave ST elevation (I, II, III, aVF, V2–V6) with ST depression in aVR, accompanied by PR depression in limb/precordial leads and PR elevation in aVR.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 88 },
      {
        type: 'SET_ATRIAL_REPOLARIZATION',
        config: {
          enabled: true,
          magnitudeMv: 0.11,
        },
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_DIFFUSE_PERICARDITIS',
          enabled: true,
          injurySource: {
            global: { x: +0.68, y: +0.74, z: +0.42 },
            regional: {
              septal: +0.25,
              rvAnterior: +0.38,
              lvLateral: +0.68,
              inferior: +0.65,
              posterobasal: +0.2,
            },
          },
          magnitudeMv: 0.22,
          plateauSlope: -0.15,
        },
      },
    ],
  },

  LARGE_PERICARDIAL_EFFUSION_PATTERN: {
    id: 'LARGE_PERICARDIAL_EFFUSION_PATTERN',
    name: 'Large Pericardial Effusion / Tamponade (Low Voltage + Electrical Alternans)',
    nameJa: '大量心嚢液貯留・心タンポナーデ (低電位＋電気的交互脈)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Sinus Tachycardia (108 bpm) + Low Voltage Attenuation (0.42x) + Beat-to-Beat Electrical Alternans (±22° axis & ±30% amplitude)',
    auditNotes:
      'Sinus tachycardia (108 bpm), diffuse low QRS voltage (<0.5 mV limb, <1.0 mV precordial), and unmistakable beat-to-beat electrical alternans in QRS amplitude and axis.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Sinus tachycardia (108 bpm) with diffuse low QRS voltage and beat-to-beat electrical alternans caused by pendular cardiac motion in a large pericardial effusion.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 108 },
      { type: 'SET_PARAMETER', key: 'pAmplitudeScale', value: 0.68 },
      { type: 'SET_PARAMETER', key: 'qrsAmplitudeScale', value: 0.42 },
      { type: 'SET_PARAMETER', key: 'tAmplitudeScale', value: 0.52 },
      {
        type: 'SET_ELECTRICAL_ALTERNANS',
        config: {
          enabled: true,
          axisSwingDeg: 22,
          amplitudeSwingRatio: 0.3,
          anteriorSwingZ: 0.24,
        },
      },
    ],
  },

  BRUGADA_TYPE_1: {
    id: 'BRUGADA_TYPE_1',
    name: 'Brugada Syndrome Pattern (Type 1 Coved ST Elevation)',
    nameJa: 'Brugada症候群 (Type 1 Coved型 ST上昇)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'RV Outflow Tract J-Point / ST Current (+rvAnterior, +septal) + Negative T in V1-V2',
    auditNotes:
      'High take-off coved ST elevation (>=0.2 mV) restricted to V1-V2 descending into a symmetric negative T wave, without diffuse STEMI spill.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Coved-type ST segment elevation (>=2 mm) in V1–V2 followed by a negative T wave (Brugada Type 1 pattern).',
    modifiers: [
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_BRUGADA_COVED',
          enabled: true,
          injurySource: {
            global: { x: -0.18, y: -0.08, z: +0.85 },
            regional: {
              septal: +0.75,
              rvAnterior: +1.35,
              lvLateral: -0.25,
              inferior: 0,
              posterobasal: -0.2,
            },
          },
          magnitudeMv: 0.32,
          plateauSlope: -0.35,
          jWaveComponent: {
            enabled: true,
            durationFraction: 0.35,
            magnitude: 0.42,
            kernel: { type: 'BETA', alpha: 1.8, beta: 3.2 },
            spatialDirection: {
              global: { x: -0.25, y: 0, z: +0.92 },
              regional: {
                septal: +0.68,
                rvAnterior: +1.42,
                lvLateral: -0.22,
                inferior: 0,
                posterobasal: 0,
              },
            },
          },
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.88,
      },
    ],
  },

  BRUGADA_TYPE_2: {
    id: 'BRUGADA_TYPE_2',
    name: 'Brugada Syndrome Pattern (Type 2 Saddle-Back ST Elevation)',
    nameJa: 'Brugada症候群 (Type 2 Saddle-back型 ST上昇)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'RVOT r\' / J-Wave + Concave Saddle-Back ST Elevation in V1-V2 + Positive/Biphasic T',
    auditNotes:
      'High r\' J-wave onset in V1-V2 followed by a saddle-back elevated ST trough (>=1 mm) and positive T wave in V2.',
    category: 'ELECTROLYTE_AND_CHANNELOPATHY',
    description:
      'Saddle-back ST elevation in V1–V2 with high r\' J-point takeoff, elevated ST trough, and positive T wave in V2.',
    modifiers: [
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_BRUGADA_SADDLE',
          enabled: true,
          injurySource: {
            global: { x: -0.12, y: +0.08, z: +0.72 },
            regional: {
              septal: +0.62,
              rvAnterior: +1.12,
              lvLateral: -0.15,
              inferior: 0,
              posterobasal: 0,
            },
          },
          magnitudeMv: 0.22,
          plateauSlope: 0.12,
          jWaveComponent: {
            enabled: true,
            durationFraction: 0.28,
            magnitude: 0.36,
            kernel: { type: 'BETA', alpha: 2.0, beta: 2.8 },
            spatialDirection: {
              global: { x: -0.22, y: 0, z: +0.88 },
              regional: {
                septal: +0.62,
                rvAnterior: +1.25,
                lvLateral: -0.18,
                inferior: 0,
                posterobasal: 0,
              },
            },
          },
        },
      },
    ],
  },

  // ==========================================================================
  // 10. CHAMBER ENLARGEMENT & OVERLOAD (4)
  // ==========================================================================
  P_PULMONALE_PATTERN: {
    id: 'P_PULMONALE_PATTERN',
    name: 'Right Atrial Enlargement / Overload (P Pulmonale)',
    nameJa: '右房負荷 (P pulmonale・II/III/aVF 尖鋭高電位P波)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'ATRIAL_P_PULMONALE_RECIPE (Tall Peaked P_RA >= 0.27 mV in II/III/aVF, Normal P Duration 102 ms)',
    auditNotes:
      'Tall peaked P waves (>=0.25 mV / 2.5 mm) in inferior leads II, III, aVF with normal P duration (102 ms < 120 ms) and prominent initial positive P in V1.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Right atrial overload (P pulmonale) with tall peaked P waves (>=0.25 mV) in II, III, aVF and normal P duration (102 ms).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 82 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 102 },
      { type: 'SET_SPATIAL_AXIS', target: 'P', axisDeg: 68 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'ATRIA',
        recipe: ATRIAL_P_PULMONALE_RECIPE,
      },
    ],
  },

  P_MITRALE_PATTERN: {
    id: 'P_MITRALE_PATTERN',
    name: 'Left Atrial Enlargement / Overload (P Mitrale)',
    nameJa: '左房負荷 (P mitrale・II誘導 二峰性広幅P波＋V1陰性終末成分)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'ATRIAL_P_MITRALE_RECIPE (Prolonged P Duration 134 ms >= 120 ms, Bifid P in II, Deep Terminal Negative P in V1)',
    auditNotes:
      'Broad notched bifid P wave in Lead II (duration 134 ms >= 120 ms) and prominent deep terminal negative P component in V1 from delayed posterior LA depolarization.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Left atrial overload (P mitrale) with wide bifid M-shaped P wave in Lead II (134 ms) and deep terminal negative P component in V1.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 76 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 134 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 178 },
      { type: 'SET_SPATIAL_AXIS', target: 'P', axisDeg: 40 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'ATRIA',
        recipe: ATRIAL_P_MITRALE_RECIPE,
      },
    ],
  },

  LVH_WITH_STRAIN: {
    id: 'LVH_WITH_STRAIN',
    name: 'Left Ventricular Hypertrophy (LVH) with Strain Pattern',
    nameJa: '左室肥大 (高電位＋側壁ストレイン型ST-T変化)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_LVH_RECIPE (Deep S in V1/V2 + Tall R in V5/V6, SV1+RV5 > 3.5 mV) + Lateral LV Strain ST-T Discordance',
    auditNotes:
      'High precordial voltage (deep S in V1-V2, tall R in V5-V6, SV1+RV5 > 3.5 mV), mild left axis (+18°), QRS 102 ms (<120 ms), and asymmetric lateral ST depression/T inversion in I, aVL, V5, V6.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Left ventricular hypertrophy with deep S in V1–V2, tall R in V5–V6 (SV1 + RV5 > 3.5 mV), and lateral secondary ST depression / T inversion ("LV strain").',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 72 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 102 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 18 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_LVH_RECIPE,
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_LVH_STRAIN',
          enabled: true,
          injurySource: {
            global: { x: -0.62, y: -0.18, z: +0.58 },
            regional: {
              septal: +0.42,
              rvAnterior: +0.48,
              lvLateral: -0.88,
              inferior: -0.15,
              posterobasal: -0.2,
            },
          },
          magnitudeMv: 0.16,
          plateauSlope: -0.12,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.85,
      },
    ],
  },

  RVH_WITH_STRAIN: {
    id: 'RVH_WITH_STRAIN',
    name: 'Right Ventricular Hypertrophy (RVH) with Strain Pattern',
    nameJa: '右室肥大 (右軸偏位・V1高R波・右前胸部ストレイン)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'QRS_RVH_RECIPE (RAD +122°, V1 Dominant R with R/S > 1, Deep S in I/V5/V6, QRS 98 ms) + Right Precordial RV Strain',
    auditNotes:
      'Right axis deviation (+122°), dominant R wave in V1 (R/S > 1), deep S in I, V5, V6, normal QRS duration (98 ms < 120 ms), and right precordial ST depression / T inversion in V1-V3.',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Right ventricular hypertrophy with right axis deviation (+122°), dominant R in V1 (R/S > 1), deep lateral S waves, and right precordial ST-T strain in V1–V3.',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 78 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 98 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 122 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_RVH_RECIPE,
      },
      {
        type: 'SET_ST_RECIPE',
        stRecipe: {
          id: 'ST_RVH_STRAIN',
          enabled: true,
          injurySource: {
            global: { x: +0.28, y: -0.12, z: -0.78 },
            regional: {
              septal: -0.58,
              rvAnterior: -0.92,
              lvLateral: +0.25,
              inferior: 0,
              posterobasal: 0,
            },
          },
          magnitudeMv: 0.15,
          plateauSlope: -0.1,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.82,
      },
    ],
  },

  // ==========================================================================
  // 11. PACEMAKER RHYTHMS (2)
  // ==========================================================================
  PACEMAKER_VVI: {
    id: 'PACEMAKER_VVI',
    name: 'Ventricular Demand Pacemaker Rhythm (VVI - RV Apical Pacing)',
    nameJa: 'VVIペースメーカ調律 (右室心尖部ペーシング・V1陰性LBBB様波形)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Device VVI Engine (65 bpm) + PACED_RV_APEX_QRS_RECIPE (150 ms, Axis -60°, Negative QS in V1)',
    auditNotes:
      'Ventricular pacing spikes followed by wide LBBB-like QRS (150 ms) with strongly negative QS morphology in V1-V3 and superior axis (-60°).',
    category: 'DEVICE_AND_ANATOMY',
    description:
      'VVI demand ventricular pacing (65 bpm) with pacing spikes preceding wide LBBB-like QRS complexes (negative QS in V1–V3, superior axis -60°).',
    modifiers: [
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 150 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: -60 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: PACED_RV_APEX_QRS_RECIPE,
      },
      {
        type: 'SET_RHYTHM_SOURCES',
        sources: [
          {
            type: 'SINUS_NODE',
            id: 'SLOW_SINUS_UNDER_VVI',
            enabled: true,
            rateBpm: 38,
            regularityJitterRatio: 0,
          },
        ],
      },
      {
        type: 'CONFIGURE_DEVICE',
        device: {
          enabled: true,
          mode: 'VVI',
          lowerRateBpm: 65,
          ventricularOutputMv: 3.5,
          captureSuccessProbability: 1.0,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.85,
      },
    ],
  },

  PACEMAKER_DDD: {
    id: 'PACEMAKER_DDD',
    name: 'Dual-Chamber Sequential Pacemaker Rhythm (DDD - AV Sequential)',
    nameJa: 'DDDペースメーカ調律 (房室順次ペーシング・V1陰性LBBB様波形)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Device DDD Engine (70 bpm, AV Delay 160 ms) + Atrial Spike/P + Ventricular Spike/PACED_RV_APEX_QRS_RECIPE',
    auditNotes:
      'Sequential atrial pacing spike -> paced P wave -> 160 ms AV delay -> ventricular pacing spike -> wide RV apical paced QRS (negative V1, -60° axis).',
    category: 'DEVICE_AND_ANATOMY',
    description:
      'AV sequential dual-chamber DDD pacing at 70 bpm (AV delay 160 ms) with atrial and ventricular pacing spikes and LBBB-like negative V1 QRS.',
    modifiers: [
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'SA_EXIT' },
      { type: 'DISABLE_CONDUCTION_PATH', pathId: 'AV_NODE' },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 150 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: -60 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: PACED_RV_APEX_QRS_RECIPE,
      },
      {
        type: 'CONFIGURE_DEVICE',
        device: {
          enabled: true,
          mode: 'DDD',
          lowerRateBpm: 70,
          avDelayMs: 160,
          atrialOutputMv: 2.5,
          ventricularOutputMv: 3.5,
          captureSuccessProbability: 1.0,
        },
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        secondaryDiscordanceFactor: 0.85,
      },
    ],
  },

  // ==========================================================================
  // 12. AXIS & POSITIONAL VARIANTS (3)
  // ==========================================================================
  LEFT_AXIS_DEVIATION: {
    id: 'LEFT_AXIS_DEVIATION',
    name: 'Left Axis Deviation (LAD)',
    nameJa: '左軸偏位 (-42°)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Spatial QRS Axis Rotation (-42°): Positive I/aVL, Negative II/III/aVF',
    auditNotes:
      'Frontal QRS axis at -42° (positive in I and aVL, negative in II, III, and aVF) with normal QRS duration (90 ms).',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Normal sinus rhythm with frontal plane left axis deviation (-42°: upright QRS in I/aVL, negative in II/III/aVF).',
    modifiers: [{ type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: -42 }],
  },

  RIGHT_AXIS_DEVIATION: {
    id: 'RIGHT_AXIS_DEVIATION',
    name: 'Right Axis Deviation (RAD)',
    nameJa: '右軸偏位 (+115°)',
    status: 'IMPLEMENTED',
    primaryDomain: 'Spatial QRS Axis Rotation (+115°): Negative I, Positive II/III/aVF',
    auditNotes:
      'Frontal QRS axis at +115° (negative in Lead I, positive in Leads II, III, and aVF) with normal QRS duration (90 ms).',
    category: 'PERICARDIAL_AND_CHAMBER_AXIS',
    description:
      'Normal sinus rhythm with frontal plane right axis deviation (+115°: negative QRS in Lead I, positive in II/III/aVF).',
    modifiers: [{ type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 115 }],
  },

  DEXTROCARDIA: {
    id: 'DEXTROCARDIA',
    name: 'Mirror-Image Dextrocardia (Situs Inversus)',
    nameJa: '右胸心 (Dextrocardia・I/aVL陰性P-QRS-T＋V1〜V6 R波漸減)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'Anatomical Situs Inversus Mirror Transform (-X, reversed regional LV/RV projection -> Diminishing R from V1 to V6)',
    auditNotes:
      'Inverted P, QRS, and T in Lead I and aVL, positive QRS in aVR, AND progressive decrease in QRS amplitude from V1 to V6 (distinguishing true Dextrocardia from LA-RA cable reversal).',
    category: 'DEVICE_AND_ANATOMY',
    description:
      'Mirror-image dextrocardia: negative P-QRS-T in Lead I, upright aVR, and progressively diminishing R-wave voltage from V1 across to V6.',
    modifiers: [
      {
        type: 'SET_ANATOMY',
        anatomy: {
          orientation: 'DEXTROCARDIA',
        },
      },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 30 },
    ],
  },

  // ==========================================================================
  // 13. PEDIATRIC NORMAL ECGS BY AGE GROUP (5)
  // ==========================================================================
  PEDIATRIC_NORMAL_NEONATE: {
    id: 'PEDIATRIC_NORMAL_NEONATE',
    name: 'Pediatric Normal ECG: Neonate (0–30 Days)',
    nameJa: '小児正常心電図：新生児 (0〜30日・HR 145 bpm・右軸偏位・V1高R波)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'PatientAgeGroup=NEONATE + HR 145 bpm + Short PR (102 ms) / QRS (62 ms) + RAD (+125°) + Neonatal RV Dominance + Juvenile Negative T (V1-V3)',
    auditNotes:
      'Physiological neonatal sinus tachycardia (145 bpm), short PR (102 ms) and QRS (62 ms), right axis deviation (+125°), dominant R in V1 (R/S > 1), and juvenile negative T in V1-V3.',
    category: 'PEDIATRIC_NORMAL',
    description:
      'Age-normal neonate (0–30 days): HR 145 bpm, PR 102 ms, QRS 62 ms, physiological right axis (+125°), dominant R in V1, and juvenile negative T in V1–V3.',
    modifiers: [
      { type: 'SET_PATIENT_AGE_GROUP', ageGroup: 'NEONATE' },
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 145 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 72 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 102 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 62 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 265 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 125 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_PEDIATRIC_NEONATE_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_JUVENILE_T_RECIPE,
      },
    ],
  },

  PEDIATRIC_NORMAL_INFANT: {
    id: 'PEDIATRIC_NORMAL_INFANT',
    name: 'Pediatric Normal ECG: Infant (1–12 Months)',
    nameJa: '小児正常心電図：乳児 (1〜12か月・HR 126 bpm・V1 R優位・Juvenile T)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'PatientAgeGroup=INFANT + HR 126 bpm + PR 112 ms + QRS 68 ms + Axis +95° + Infant RV/LV Balance + Juvenile Negative T (V1-V3)',
    auditNotes:
      'Age-normal infant rhythm (126 bpm), PR 112 ms, QRS 68 ms, frontal axis +95°, prominent V1 R wave (R >= S), and juvenile negative T in V1-V3.',
    category: 'PEDIATRIC_NORMAL',
    description:
      'Age-normal infant (1–12 months): HR 126 bpm, PR 112 ms, QRS 68 ms, axis +95°, tall V1 R wave, and juvenile negative T in V1–V3.',
    modifiers: [
      { type: 'SET_PATIENT_AGE_GROUP', ageGroup: 'INFANT' },
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 126 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 78 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 112 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 68 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 285 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 95 },
      {
        type: 'REPLACE_ACTIVATION_RECIPE',
        chamber: 'VENTRICLES',
        recipe: QRS_PEDIATRIC_INFANT_RECIPE,
      },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_JUVENILE_T_RECIPE,
      },
    ],
  },

  PEDIATRIC_NORMAL_1_TO_5_Y: {
    id: 'PEDIATRIC_NORMAL_1_TO_5_Y',
    name: 'Pediatric Normal ECG: Early Childhood (1–5 Years)',
    nameJa: '小児正常心電図：幼児 (1〜5歳・HR 105 bpm・軸 +75°・Juvenile T)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'PatientAgeGroup=CHILD_1_TO_5_Y + HR 105 bpm + PR 124 ms + QRS 74 ms + Axis +75° + Juvenile Negative T in V1-V2',
    auditNotes:
      'Age-normal early childhood ECG (105 bpm), PR 124 ms, QRS 74 ms, frontal axis +75°, progressive LV transition, and juvenile negative T in V1-V2.',
    category: 'PEDIATRIC_NORMAL',
    description:
      'Age-normal young child (1–5 years): HR 105 bpm, PR 124 ms, QRS 74 ms, axis +75°, and physiological juvenile negative T wave in V1–V2.',
    modifiers: [
      { type: 'SET_PATIENT_AGE_GROUP', ageGroup: 'CHILD_1_TO_5_Y' },
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 105 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 84 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 124 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 74 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 315 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 75 },
      {
        type: 'MODIFY_REPOLARIZATION',
        recipe: REPOL_JUVENILE_T_RECIPE,
      },
    ],
  },

  PEDIATRIC_NORMAL_6_TO_12_Y: {
    id: 'PEDIATRIC_NORMAL_6_TO_12_Y',
    name: 'Pediatric Normal ECG: School-Age Child (6–12 Years)',
    nameJa: '小児正常心電図：学童 (6〜12歳・HR 86 bpm・軸 +65°)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'PatientAgeGroup=CHILD_6_TO_12_Y + HR 86 bpm + PR 138 ms + QRS 80 ms + Axis +65°',
    auditNotes:
      'Age-normal school-age child ECG (86 bpm), PR 138 ms, QRS 80 ms, frontal axis +65°, adult-like LV precordial progression with negative/flat V1 T.',
    category: 'PEDIATRIC_NORMAL',
    description:
      'Age-normal school-age child (6–12 years): HR 86 bpm, PR 138 ms, QRS 80 ms, axis +65°, and V3 precordial transition.',
    modifiers: [
      { type: 'SET_PATIENT_AGE_GROUP', ageGroup: 'CHILD_6_TO_12_Y' },
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 86 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 90 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 138 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 80 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 350 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 65 },
    ],
  },

  PEDIATRIC_NORMAL_ADOLESCENT: {
    id: 'PEDIATRIC_NORMAL_ADOLESCENT',
    name: 'Pediatric Normal ECG: Adolescent (13–17 Years)',
    nameJa: '小児正常心電図：思春期 (13〜17歳・HR 76 bpm・成人近似波形)',
    status: 'IMPLEMENTED',
    primaryDomain:
      'PatientAgeGroup=ADOLESCENT + HR 76 bpm + PR 150 ms + QRS 86 ms + Axis +60°',
    auditNotes:
      'Age-normal adolescent ECG (76 bpm), PR 150 ms, QRS 86 ms, QT 372 ms, axis +60°, adult-equivalent precordial R/S progression.',
    category: 'PEDIATRIC_NORMAL',
    description:
      'Age-normal adolescent (13–17 years): HR 76 bpm, PR 150 ms, QRS 86 ms, axis +60°, and adult-like precordial progression.',
    modifiers: [
      { type: 'SET_PATIENT_AGE_GROUP', ageGroup: 'ADOLESCENT' },
      { type: 'SET_PARAMETER', key: 'heartRateBpm', value: 76 },
      { type: 'SET_PARAMETER', key: 'pDurationMs', value: 96 },
      { type: 'SET_PARAMETER', key: 'prIntervalMs', value: 150 },
      { type: 'SET_PARAMETER', key: 'qrsDurationMs', value: 86 },
      { type: 'SET_PARAMETER', key: 'qtIntervalMs', value: 372 },
      { type: 'SET_SPATIAL_AXIS', target: 'QRS', axisDeg: 60 },
    ],
  },
};

export function getClinicalPreset(
  id: ClinicalPresetId
): ClinicalPresetDefinition {
  return CLINICAL_PRESETS[id] ?? CLINICAL_PRESETS.NORMAL_SINUS;
}

export const resolveConfiguration = resolveSimulationConfig;

export const CLINICAL_PRESET_LIST = Object.values(CLINICAL_PRESETS);

export function resolveSimulationConfig(
  scenario: SimulationScenario
): ResolvedSimulationConfig {
  const config = createCanonicalNormalConfig();
  const preset = getClinicalPreset(scenario.presetId);

  for (const mod of preset.modifiers) {
    applyModifier(config, mod);
  }

  const ov = scenario.overrides;
  if (ov) {
    if (ov.heartRateBpm !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'heartRateBpm',
        value: clamp(ov.heartRateBpm, 25, 260),
      });
    }
    if (ov.pDurationMs !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'pDurationMs',
        value: clamp(ov.pDurationMs, 40, 180),
      });
    }
    if (ov.prIntervalMs !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'prIntervalMs',
        value: clamp(ov.prIntervalMs, 70, 420),
      });
    }
    if (ov.qrsDurationMs !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'qrsDurationMs',
        value: clamp(ov.qrsDurationMs, 50, 220),
      });
    }
    if (ov.qtIntervalMs !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'qtIntervalMs',
        value: clamp(ov.qtIntervalMs, 200, 620),
      });
    }
    if (ov.pAxisDeg !== undefined) {
      applyModifier(config, {
        type: 'SET_SPATIAL_AXIS',
        target: 'P',
        axisDeg: ov.pAxisDeg,
      });
    }
    if (ov.qrsAxisDeg !== undefined) {
      applyModifier(config, {
        type: 'SET_SPATIAL_AXIS',
        target: 'QRS',
        axisDeg: ov.qrsAxisDeg,
      });
    }
    if (ov.tAxisDeg !== undefined) {
      applyModifier(config, {
        type: 'SET_SPATIAL_AXIS',
        target: 'T',
        axisDeg: ov.tAxisDeg,
      });
    }
    if (ov.pAmplitudeScale !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'pAmplitudeScale',
        value: clamp(ov.pAmplitudeScale, 0, 3),
      });
    }
    if (ov.qrsAmplitudeScale !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'qrsAmplitudeScale',
        value: clamp(ov.qrsAmplitudeScale, 0.1, 3),
      });
    }
    if (ov.tAmplitudeScale !== undefined) {
      applyModifier(config, {
        type: 'SET_PARAMETER',
        key: 'tAmplitudeScale',
        value: clamp(ov.tAmplitudeScale, 0, 3),
      });
    }
    if (ov.electrolyteSeverity !== undefined) {
      const sev = clamp(ov.electrolyteSeverity, 0, 1);
      if (scenario.presetId === 'HYPERKALEMIA') {
        applyHyperkalemiaSeverity(config, sev);
      } else if (scenario.presetId === 'HYPOKALEMIA') {
        config.tAmplitudeScale = Math.max(0.15, 1.0 - 0.7 * sev);
        config.uWaveRecipe.enabled = sev > 0.05;
        config.uWaveRecipe.magnitude = 0.36 * sev;
      }
    }
    if (ov.pacCount !== undefined) {
      config.pacCount = clamp(Math.round(ov.pacCount), 0, 20);
    }
    if (ov.pvcCount !== undefined) {
      config.pvcCount = clamp(Math.round(ov.pvcCount), 0, 20);
    }
    if (ov.pvcOrigin === 'RV' || ov.pvcOrigin === 'LV') {
      config.pvcOrigin = ov.pvcOrigin;
    }
  }

  return config;
}

export const CANONICAL_HYPERKALEMIA_SEVERITY = 0.74;

export function applyHyperkalemiaSeverity(
  config: ResolvedSimulationConfig,
  severity: number
): void {
  const s = clamp(severity, 0, 1);
  config.tAmplitudeScale = Math.round((1.0 + 1.96 * s) * 100) / 100;
  config.pAmplitudeScale =
    Math.round(Math.max(0.12, 1.0 - 0.743 * s) * 100) / 100;
  config.pDurationMs = Math.round(100 + 24.3 * s);
  config.prIntervalMs = Math.round(160 + 74.3 * s);
  config.qrsDurationMs = Math.round(90 + 29.7 * s);
  config.qtIntervalMs = Math.round(380 - 40.5 * s);
  applyModifier(config, {
    type: 'SET_PARAMETER',
    key: 'prIntervalMs',
    value: config.prIntervalMs,
  });
}
