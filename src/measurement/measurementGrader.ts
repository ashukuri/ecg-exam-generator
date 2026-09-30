/**
 * Student ECG Measurement Practice & Auto-Grading Engine
 *
 * Provides:
 * 1. Age-Aware Normal Reference Ranges (Adult, Neonate, Infant, Child 1-5y, Child 6-12y, Adolescent)
 * 2. Expected Measurement Answer Key extraction from SimulationResult + Author Manual Overrides
 * 3. Configurable Tolerance Auto-Grading (`heartRateToleranceBpm`, `intervalToleranceMs`, `amplitudeToleranceMv`)
 */

import { LeadName, PatientAgeGroup } from '../ecg-engine';
import { SimulatedExamCaseResult } from '../exam/examEcgRenderer';

export interface MeasurementToleranceConfig {
  heartRateToleranceBpm: number;
  intervalToleranceMs: number;
  amplitudeToleranceMv: number;
}

export const DEFAULT_MEASUREMENT_TOLERANCE: MeasurementToleranceConfig = {
  heartRateToleranceBpm: 5,
  intervalToleranceMs: 20, // 0.5 mm at 25 mm/s
  amplitudeToleranceMv: 0.1, // 1.0 mm at 10 mm/mV
};

export interface AgeSpecificReferenceRange {
  ageGroup: PatientAgeGroup;
  labelJa: string;
  hrMinBpm: number;
  hrMaxBpm: number;
  prMinMs: number;
  prMaxMs: number;
  qrsMaxMs: number;
  axisMinDeg: number;
  axisMaxDeg: number;
  qtcMaxMs: number;
  v1NegativeTNormal: boolean;
  v1DominantRNormal: boolean;
}

export const AGE_REFERENCE_RANGES: Record<
  PatientAgeGroup,
  AgeSpecificReferenceRange
> = {
  ADULT: {
    ageGroup: 'ADULT',
    labelJa: '成人 (Adult >= 18歳)',
    hrMinBpm: 60,
    hrMaxBpm: 100,
    prMinMs: 120,
    prMaxMs: 200,
    qrsMaxMs: 110,
    axisMinDeg: -30,
    axisMaxDeg: 90,
    qtcMaxMs: 450,
    v1NegativeTNormal: true, // V1 alone can be flat/negative; V2-V3 negative is juvenile/abnormal in adult
    v1DominantRNormal: false,
  },
  NEONATE: {
    ageGroup: 'NEONATE',
    labelJa: '新生児 (Neonate 0〜30日)',
    hrMinBpm: 100,
    hrMaxBpm: 180,
    prMinMs: 70,
    prMaxMs: 135,
    qrsMaxMs: 80,
    axisMinDeg: 60,
    axisMaxDeg: 180,
    qtcMaxMs: 460,
    v1NegativeTNormal: true,
    v1DominantRNormal: true,
  },
  INFANT: {
    ageGroup: 'INFANT',
    labelJa: '乳児 (Infant 1〜12か月)',
    hrMinBpm: 100,
    hrMaxBpm: 165,
    prMinMs: 75,
    prMaxMs: 145,
    qrsMaxMs: 85,
    axisMinDeg: 30,
    axisMaxDeg: 135,
    qtcMaxMs: 450,
    v1NegativeTNormal: true,
    v1DominantRNormal: true,
  },
  CHILD_1_TO_5_Y: {
    ageGroup: 'CHILD_1_TO_5_Y',
    labelJa: '幼児 (Young Child 1〜5歳)',
    hrMinBpm: 80,
    hrMaxBpm: 140,
    prMinMs: 85,
    prMaxMs: 160,
    qrsMaxMs: 90,
    axisMinDeg: 10,
    axisMaxDeg: 110,
    qtcMaxMs: 450,
    v1NegativeTNormal: true,
    v1DominantRNormal: false,
  },
  CHILD_6_TO_12_Y: {
    ageGroup: 'CHILD_6_TO_12_Y',
    labelJa: '学童 (School-Age 6〜12歳)',
    hrMinBpm: 65,
    hrMaxBpm: 120,
    prMinMs: 95,
    prMaxMs: 175,
    qrsMaxMs: 95,
    axisMinDeg: -10,
    axisMaxDeg: 100,
    qtcMaxMs: 450,
    v1NegativeTNormal: true,
    v1DominantRNormal: false,
  },
  ADOLESCENT: {
    ageGroup: 'ADOLESCENT',
    labelJa: '思春期 (Adolescent 13〜17歳)',
    hrMinBpm: 60,
    hrMaxBpm: 105,
    prMinMs: 110,
    prMaxMs: 190,
    qrsMaxMs: 105,
    axisMinDeg: -20,
    axisMaxDeg: 95,
    qtcMaxMs: 450,
    v1NegativeTNormal: true,
    v1DominantRNormal: false,
  },
};

export interface StudentMeasurementSubmission {
  // 1. P Wave
  pWavePresent: 'PRESENT' | 'ABSENT';
  pDurationMs: number;
  pAmplitudeMv: number;
  pMorphology:
    | 'NORMAL'
    | 'PEAKED'
    | 'NOTCHED'
    | 'BIPHASIC'
    | 'INVERTED'
    | 'ABSENT';
  pLead: 'II' | 'V1';
  pJudgment: 'NORMAL' | 'ABNORMAL';

  // 2. Rhythm
  rhythmRegularity:
    | 'REGULAR'
    | 'REGULARLY_IRREGULAR'
    | 'IRREGULARLY_IRREGULAR';
  rhythmOrigin: 'SINUS' | 'NON_SINUS';
  rhythmDescription: string;
  rhythmJudgment: 'NORMAL' | 'ABNORMAL';

  // 3. Heart Rate
  heartRateBpm: number;
  hrJudgment: 'NORMAL' | 'BRADYCARDIA' | 'TACHYCARDIA';

  // 4. PQ(PR) Interval
  prIntervalMs: number;
  prNotMeasurable: boolean;
  prJudgment: 'NORMAL' | 'PROLONGED' | 'SHORTENED' | 'NOT_MEASURABLE';

  // 5. QRS Complex
  qrsDurationMs: number;
  qrsAmplitudeMv: number;
  qrsLead: LeadName;
  qrsMorphology:
    | 'NARROW_NORMAL'
    | 'RSR_PRIME'
    | 'BROAD_SLURRED'
    | 'QS_OR_PATH_Q'
    | 'DELTA_WAVE'
    | 'WIDE_ECTOPIC';
  qrsAxisCategory: 'NORMAL' | 'LAD' | 'RAD' | 'EXTREME';
  qrsJudgment: 'NORMAL' | 'ABNORMAL';

  // 6. ST-T
  stDeviationMv: number;
  stLead: LeadName;
  tAmplitudeMv: number;
  tLead: LeadName;
  tPolarity: 'POSITIVE' | 'NEGATIVE' | 'BIPHASIC' | 'FLAT' | 'PEAKED';
  stTJudgment: 'NORMAL' | 'ABNORMAL';

  // 7. QT / QTc
  qtIntervalMs: number;
  qtLead: LeadName;
  qtcMs: number;
  qtJudgment: 'NORMAL' | 'PROLONGED' | 'SHORTENED' | 'UNSURE';
}

export interface ExpectedMeasurementKey {
  ageGroup: PatientAgeGroup;
  ageRef: AgeSpecificReferenceRange;

  // 1. P Wave
  pWavePresent: 'PRESENT' | 'ABSENT';
  pDurationMs: number;
  pAmplitudeLeadIIMv: number;
  pMorphology: StudentMeasurementSubmission['pMorphology'];
  pJudgment: 'NORMAL' | 'ABNORMAL';

  // 2. Rhythm
  rhythmRegularity: StudentMeasurementSubmission['rhythmRegularity'];
  rhythmOrigin: StudentMeasurementSubmission['rhythmOrigin'];
  rhythmJudgment: 'NORMAL' | 'ABNORMAL';

  // 3. Heart Rate
  heartRateBpm: number;
  hrJudgment: StudentMeasurementSubmission['hrJudgment'];

  // 4. PR Interval
  prIntervalMs: number;
  prNotMeasurable: boolean;
  prJudgment: StudentMeasurementSubmission['prJudgment'];

  // 5. QRS
  qrsDurationMs: number;
  qrsAxisDeg: number;
  qrsAxisCategory: StudentMeasurementSubmission['qrsAxisCategory'];
  qrsMorphology: StudentMeasurementSubmission['qrsMorphology'];
  qrsJudgment: 'NORMAL' | 'ABNORMAL';

  // 6. ST-T
  stJudgment: 'NORMAL' | 'ABNORMAL';

  // 7. QT / QTc
  qtIntervalMs: number;
  qtcMs: number;
  qtJudgment: 'NORMAL' | 'PROLONGED' | 'SHORTENED';
}

export interface MeasurementFieldGradeItem {
  id: string;
  sectionTitle: string;
  fieldLabel: string;
  studentValueText: string;
  expectedValueText: string;
  passed: boolean;
  feedbackJa: string;
}

export interface MeasurementGradingReport {
  totalChecks: number;
  passedChecks: number;
  scorePercent: number;
  ageGroupUsed: PatientAgeGroup;
  items: MeasurementFieldGradeItem[];
}

/**
 * Derives the authoritative ExpectedMeasurementKey for any SimulatedExamCaseResult,
 * incorporating age-specific reference thresholds and any teacher manualAnswerOverrides.
 */
export function deriveExpectedMeasurementKey(
  simResult: SimulatedExamCaseResult
): ExpectedMeasurementKey {
  const c = simResult.examCase;
  const cfg = simResult.simulation.resolvedConfig;
  const feat = simResult.simulation.ecg.features;
  const ov = c.manualAnswerOverrides;

  const ageGroup: PatientAgeGroup = c.ageGroup ?? cfg.patientAgeGroup ?? 'ADULT';
  const ageRef = AGE_REFERENCE_RANGES[ageGroup] ?? AGE_REFERENCE_RANGES.ADULT;

  const presetId = c.presetId;

  // Heart rate & age-aware judgment
  const heartRateBpm = ov?.heartRateBpm ?? Math.round(feat.heartRateBpm);
  let hrJudgment: ExpectedMeasurementKey['hrJudgment'] = 'NORMAL';
  if (heartRateBpm < ageRef.hrMinBpm) hrJudgment = 'BRADYCARDIA';
  else if (heartRateBpm > ageRef.hrMaxBpm) hrJudgment = 'TACHYCARDIA';

  // P wave presence & morphology
  const isNoSinusP =
    presetId === 'ATRIAL_FIBRILLATION' ||
    presetId === 'ATRIAL_FLUTTER' ||
    presetId === 'VENTRICULAR_TACHYCARDIA' ||
    presetId === 'TORSADES_DE_POINTES';
  const pWavePresent: 'PRESENT' | 'ABSENT' =
    ov?.pWavePresent !== undefined
      ? ov.pWavePresent
        ? 'PRESENT'
        : 'ABSENT'
      : isNoSinusP
        ? 'ABSENT'
        : 'PRESENT';

  const pDurationMs = ov?.pDurationMs ?? Math.round(feat.pDurationMs);
  const pAmplitudeLeadIIMv =
    ov?.pAmplitudeMv ?? Number(feat.perLead.II.pAmplitudeMv.toFixed(2));

  let pMorphology: ExpectedMeasurementKey['pMorphology'] = 'NORMAL';
  if (pWavePresent === 'ABSENT') pMorphology = 'ABSENT';
  else if (presetId === 'P_PULMONALE_PATTERN') pMorphology = 'PEAKED';
  else if (presetId === 'P_MITRALE_PATTERN') pMorphology = 'NOTCHED';
  else if (
    presetId === 'JUNCTIONAL_RHYTHM' ||
    presetId === 'PSVT_REGULAR_NARROW' ||
    presetId === 'DEXTROCARDIA' ||
    c.electrodeError.reversal === 'RA_LA_REVERSAL'
  ) {
    pMorphology = 'INVERTED';
  }

  const pJudgment: 'NORMAL' | 'ABNORMAL' =
    pWavePresent === 'PRESENT' &&
    pMorphology === 'NORMAL' &&
    pDurationMs < 120 &&
    pAmplitudeLeadIIMv < 0.25
      ? 'NORMAL'
      : 'ABNORMAL';

  // Rhythm regularity & origin
  let rhythmRegularity: ExpectedMeasurementKey['rhythmRegularity'] = 'REGULAR';
  if (
    presetId === 'ATRIAL_FIBRILLATION' ||
    presetId === 'TORSADES_DE_POINTES'
  ) {
    rhythmRegularity = 'IRREGULARLY_IRREGULAR';
  } else if (
    presetId === 'SINUS_PAUSE_ARREST' ||
    presetId === 'SA_EXIT_BLOCK' ||
    presetId === 'AVB_WENCKEBACH' ||
    presetId === 'AVB_MOBITZ_II' ||
    presetId === 'PAC' ||
    presetId === 'PVC' ||
    c.pacCount > 0 ||
    c.pvcCount > 0
  ) {
    rhythmRegularity = 'REGULARLY_IRREGULAR';
  }

  const isNonSinusOrigin =
    isNoSinusP ||
    presetId === 'JUNCTIONAL_RHYTHM' ||
    presetId === 'PSVT_REGULAR_NARROW' ||
    presetId === 'PACEMAKER_VVI' ||
    presetId === 'PACEMAKER_DDD';
  const rhythmOrigin: ExpectedMeasurementKey['rhythmOrigin'] = isNonSinusOrigin
    ? 'NON_SINUS'
    : 'SINUS';
  const rhythmJudgment: 'NORMAL' | 'ABNORMAL' =
    rhythmOrigin === 'SINUS' &&
    rhythmRegularity === 'REGULAR' &&
    hrJudgment === 'NORMAL'
      ? 'NORMAL'
      : 'ABNORMAL';

  // PR Interval
  const prNotMeasurable =
    isNoSinusP ||
    presetId === 'AVB_COMPLETE' ||
    presetId === 'JUNCTIONAL_RHYTHM' ||
    presetId === 'PSVT_REGULAR_NARROW' ||
    presetId === 'PACEMAKER_VVI';
  const prIntervalMs = ov?.prIntervalMs ?? Math.round(feat.prIntervalMs);
  let prJudgment: ExpectedMeasurementKey['prJudgment'] = 'NORMAL';
  if (prNotMeasurable) prJudgment = 'NOT_MEASURABLE';
  else if (prIntervalMs > ageRef.prMaxMs || presetId === 'AVB_WENCKEBACH')
    prJudgment = 'PROLONGED';
  else if (prIntervalMs < ageRef.prMinMs) prJudgment = 'SHORTENED';

  // QRS Complex & Axis
  const qrsDurationMs = ov?.qrsDurationMs ?? Math.round(feat.qrsDurationMs);
  const qrsAxisDeg = ov?.qrsAxisDeg ?? Math.round(feat.qrsAxisDeg);

  let qrsAxisCategory: ExpectedMeasurementKey['qrsAxisCategory'] = 'NORMAL';
  if (qrsAxisDeg < ageRef.axisMinDeg) qrsAxisCategory = 'LAD';
  else if (qrsAxisDeg > ageRef.axisMaxDeg) qrsAxisCategory = 'RAD';

  let qrsMorphology: ExpectedMeasurementKey['qrsMorphology'] = 'NARROW_NORMAL';
  if (presetId === 'RBBB') qrsMorphology = 'RSR_PRIME';
  else if (presetId === 'LBBB' || presetId === 'PACEMAKER_VVI' || presetId === 'PACEMAKER_DDD')
    qrsMorphology = 'BROAD_SLURRED';
  else if (presetId === 'WPW_SYNDROME') qrsMorphology = 'DELTA_WAVE';
  else if (
    presetId === 'VENTRICULAR_TACHYCARDIA' ||
    presetId === 'TORSADES_DE_POINTES'
  ) {
    qrsMorphology = 'WIDE_ECTOPIC';
  } else if (
    presetId === 'ANTEROSEPTAL_MI_ACUTE' ||
    presetId === 'ANTEROSEPTAL_MI_OLD' ||
    presetId === 'INFERIOR_MI_ACUTE' ||
    presetId === 'INFERIOR_MI_OLD' ||
    presetId === 'LATERAL_MI_ACUTE' ||
    presetId === 'LATERAL_MI_PRIOR'
  ) {
    qrsMorphology = 'QS_OR_PATH_Q';
  }

  const isPediatricPreset = presetId.startsWith('PEDIATRIC_NORMAL_');
  const qrsJudgment: 'NORMAL' | 'ABNORMAL' =
    isPediatricPreset ||
    (qrsDurationMs <= ageRef.qrsMaxMs &&
      qrsMorphology === 'NARROW_NORMAL' &&
      qrsAxisCategory === 'NORMAL' &&
      presetId !== 'LVH_WITH_STRAIN' &&
      presetId !== 'RVH_WITH_STRAIN' &&
      presetId !== 'LARGE_PERICARDIAL_EFFUSION_PATTERN' &&
      presetId !== 'POSTERIOR_MI_ACUTE' &&
      presetId !== 'POSTERIOR_MI_PRIOR')
      ? 'NORMAL'
      : 'ABNORMAL';

  // ST-T
  const hasAbnormalStT =
    presetId.includes('_MI_') ||
    presetId === 'ACUTE_PERICARDITIS' ||
    presetId === 'BRUGADA_TYPE_1' ||
    presetId === 'BRUGADA_TYPE_2' ||
    presetId === 'HYPERKALEMIA' ||
    presetId === 'HYPOKALEMIA' ||
    presetId === 'LVH_WITH_STRAIN' ||
    presetId === 'RVH_WITH_STRAIN' ||
    presetId === 'RBBB' ||
    presetId === 'LBBB';
  const stJudgment: 'NORMAL' | 'ABNORMAL' =
    isPediatricPreset || !hasAbnormalStT ? 'NORMAL' : 'ABNORMAL';

  // QT / QTc
  const qtIntervalMs = ov?.qtIntervalMs ?? Math.round(feat.qtIntervalMs);
  const qtcMs = ov?.qtcMs ?? Math.round(feat.qtcBazettMs);
  let qtJudgment: ExpectedMeasurementKey['qtJudgment'] = 'NORMAL';
  if (
    presetId === 'LONG_QT_PATTERN' ||
    presetId === 'HYPOCALCEMIA' ||
    qtcMs > ageRef.qtcMaxMs
  ) {
    qtJudgment = 'PROLONGED';
  } else if (presetId === 'HYPERCALCEMIA' || qtcMs < 330) {
    qtJudgment = 'SHORTENED';
  }

  return {
    ageGroup,
    ageRef,
    pWavePresent,
    pDurationMs,
    pAmplitudeLeadIIMv,
    pMorphology,
    pJudgment,
    rhythmRegularity,
    rhythmOrigin,
    rhythmJudgment,
    heartRateBpm,
    hrJudgment,
    prIntervalMs,
    prNotMeasurable,
    prJudgment,
    qrsDurationMs,
    qrsAxisDeg,
    qrsAxisCategory,
    qrsMorphology,
    qrsJudgment,
    stJudgment,
    qtIntervalMs,
    qtcMs,
    qtJudgment,
  };
}

/**
 * Creates a default StudentMeasurementSubmission pre-populated with clean neutral values
 * (or optionally pre-filled with the expected key for quick teacher testing).
 */
export function createBlankStudentSubmission(): StudentMeasurementSubmission {
  return {
    pWavePresent: 'PRESENT',
    pDurationMs: 100,
    pAmplitudeMv: 0.15,
    pMorphology: 'NORMAL',
    pLead: 'II',
    pJudgment: 'NORMAL',

    rhythmRegularity: 'REGULAR',
    rhythmOrigin: 'SINUS',
    rhythmDescription: '',
    rhythmJudgment: 'NORMAL',

    heartRateBpm: 75,
    hrJudgment: 'NORMAL',

    prIntervalMs: 160,
    prNotMeasurable: false,
    prJudgment: 'NORMAL',

    qrsDurationMs: 90,
    qrsAmplitudeMv: 1.4,
    qrsLead: 'V5',
    qrsMorphology: 'NARROW_NORMAL',
    qrsAxisCategory: 'NORMAL',
    qrsJudgment: 'NORMAL',

    stDeviationMv: 0.0,
    stLead: 'II',
    tAmplitudeMv: 0.35,
    tLead: 'V5',
    tPolarity: 'POSITIVE',
    stTJudgment: 'NORMAL',

    qtIntervalMs: 380,
    qtLead: 'II',
    qtcMs: 410,
    qtJudgment: 'NORMAL',
  };
}

/**
 * Grades a StudentMeasurementSubmission against the SimulatedExamCaseResult using configurable tolerances.
 */
export function gradeStudentMeasurementSubmission(
  simResult: SimulatedExamCaseResult,
  sub: StudentMeasurementSubmission,
  tolerance: MeasurementToleranceConfig = DEFAULT_MEASUREMENT_TOLERANCE
): MeasurementGradingReport {
  const key = deriveExpectedMeasurementKey(simResult);
  const feat = simResult.simulation.ecg.features;
  const items: MeasurementFieldGradeItem[] = [];

  // 1. P Wave
  const pPresentOk = sub.pWavePresent === key.pWavePresent;
  items.push({
    id: 'GRADE_P_PRESENT',
    sectionTitle: '1. P波',
    fieldLabel: 'P波の有無',
    studentValueText: sub.pWavePresent === 'PRESENT' ? 'あり (Present)' : 'なし (Absent)',
    expectedValueText: key.pWavePresent === 'PRESENT' ? 'あり (Present)' : 'なし (Absent)',
    passed: pPresentOk,
    feedbackJa: pPresentOk
      ? 'P波の有無を正しく判定できています。'
      : `正解は「${key.pWavePresent === 'PRESENT' ? 'あり' : 'なし'}」です。`,
  });

  if (key.pWavePresent === 'PRESENT') {
    const pDurOk =
      Math.abs(sub.pDurationMs - key.pDurationMs) <=
      tolerance.intervalToleranceMs;
    items.push({
      id: 'GRADE_P_DURATION',
      sectionTitle: '1. P波',
      fieldLabel: 'P波幅 (ms)',
      studentValueText: `${sub.pDurationMs} ms`,
      expectedValueText: `${key.pDurationMs} ms (±${tolerance.intervalToleranceMs} ms)`,
      passed: pDurOk,
      feedbackJa: pDurOk
        ? '許容誤差内でP波幅を正確に計測できています。'
        : `実測P波幅は約 ${key.pDurationMs} ms (${(key.pDurationMs / 40).toFixed(1)} mm) です。`,
    });

    const leadP = feat.perLead[sub.pLead]?.pAmplitudeMv ?? key.pAmplitudeLeadIIMv;
    const pAmpOk =
      Math.abs(sub.pAmplitudeMv - Math.abs(leadP)) <=
      tolerance.amplitudeToleranceMv;
    items.push({
      id: 'GRADE_P_AMPLITUDE',
      sectionTitle: '1. P波',
      fieldLabel: `P波振幅 (${sub.pLead}誘導)`,
      studentValueText: `${sub.pAmplitudeMv.toFixed(2)} mV`,
      expectedValueText: `${Math.abs(leadP).toFixed(2)} mV (±${tolerance.amplitudeToleranceMv.toFixed(2)} mV)`,
      passed: pAmpOk,
      feedbackJa: pAmpOk
        ? '許容誤差内でP波振幅を正確に計測できています。'
        : `${sub.pLead}誘導のP波振幅は約 ${Math.abs(leadP).toFixed(2)} mV (${(Math.abs(leadP) * 10).toFixed(1)} mm) です。`,
    });
  }

  // 2. Rhythm
  const regOk = sub.rhythmRegularity === key.rhythmRegularity;
  items.push({
    id: 'GRADE_RHYTHM_REGULARITY',
    sectionTitle: '2. リズム',
    fieldLabel: 'RR間隔の整・不整',
    studentValueText: sub.rhythmRegularity,
    expectedValueText: key.rhythmRegularity,
    passed: regOk,
    feedbackJa: regOk
      ? 'リズムの規則性を正しく評価できています。'
      : `10秒Lead IIリズムストリップ全体のRR間隔から、正解は ${key.rhythmRegularity} です。`,
  });

  // 3. Heart Rate
  const hrDiff = Math.abs(sub.heartRateBpm - key.heartRateBpm);
  const hrOk = hrDiff <= tolerance.heartRateToleranceBpm;
  const hrJudgeOk = sub.hrJudgment === key.hrJudgment;
  items.push({
    id: 'GRADE_HEART_RATE',
    sectionTitle: '3. 心拍数',
    fieldLabel: `心拍数 (bpm) & 判定 [${key.ageRef.labelJa}]`,
    studentValueText: `${sub.heartRateBpm} bpm (${sub.hrJudgment})`,
    expectedValueText: `${key.heartRateBpm} bpm ±${tolerance.heartRateToleranceBpm} bpm (${key.hrJudgment})`,
    passed: hrOk && hrJudgeOk,
    feedbackJa:
      hrOk && hrJudgeOk
        ? `心拍数および年齢区分（${key.ageRef.labelJa}）に照らした判定が正確です。`
        : `実測心拍数は ${key.heartRateBpm} bpm、${key.ageRef.labelJa}の基準（${key.ageRef.hrMinBpm}〜${key.ageRef.hrMaxBpm} bpm）での判定は ${key.hrJudgment} です。`,
  });

  // 4. PQ(PR) Interval
  const prOk = key.prNotMeasurable
    ? sub.prNotMeasurable || sub.prJudgment === 'NOT_MEASURABLE'
    : !sub.prNotMeasurable &&
      Math.abs(sub.prIntervalMs - key.prIntervalMs) <=
        tolerance.intervalToleranceMs &&
      sub.prJudgment === key.prJudgment;
  items.push({
    id: 'GRADE_PR_INTERVAL',
    sectionTitle: '4. PQ(PR)時間',
    fieldLabel: 'PQ(PR)時間 (ms) & 判定',
    studentValueText: sub.prNotMeasurable
      ? '計測不能 (Not Measurable)'
      : `${sub.prIntervalMs} ms (${sub.prJudgment})`,
    expectedValueText: key.prNotMeasurable
      ? '計測不能 (Not Measurable)'
      : `${key.prIntervalMs} ms ±${tolerance.intervalToleranceMs} ms (${key.prJudgment})`,
    passed: prOk,
    feedbackJa: prOk
      ? 'PQ(PR)時間を正確に評価できています。'
      : key.prNotMeasurable
        ? '先行する洞P波との1対1伝導がないため、PQ(PR)時間は「計測不能」となります。'
        : `実測PQ(PR)時間は ${key.prIntervalMs} ms (${key.prJudgment}) です。`,
  });

  // 5. QRS Complex
  const qrsDurOk =
    Math.abs(sub.qrsDurationMs - key.qrsDurationMs) <=
    tolerance.intervalToleranceMs;
  const qrsJudgeOk = sub.qrsJudgment === key.qrsJudgment;
  items.push({
    id: 'GRADE_QRS_COMPLEX',
    sectionTitle: '5. QRS群',
    fieldLabel: 'QRS幅 (ms) & 正常/異常判定',
    studentValueText: `${sub.qrsDurationMs} ms (${sub.qrsJudgment} / 軸: ${sub.qrsAxisCategory})`,
    expectedValueText: `${key.qrsDurationMs} ms ±${tolerance.intervalToleranceMs} ms (${key.qrsJudgment} / 軸: ${key.qrsAxisCategory} [${key.qrsAxisDeg}°])`,
    passed: qrsDurOk && qrsJudgeOk,
    feedbackJa:
      qrsDurOk && qrsJudgeOk
        ? 'QRS幅および形態判定が正確です。'
        : `実測QRS幅は ${key.qrsDurationMs} ms (${(key.qrsDurationMs / 40).toFixed(1)} mm)、電気軸は ${key.qrsAxisDeg}° (${key.qrsAxisCategory})、判定は ${key.qrsJudgment} です。`,
  });

  // 6. ST-T
  const stLeadFeat = feat.perLead[sub.stLead] ?? feat.perLead.II;
  const stDevOk =
    Math.abs(sub.stDeviationMv - stLeadFeat.stDeviationMv) <=
    tolerance.amplitudeToleranceMv;
  const stJudgeOk = sub.stTJudgment === key.stJudgment;
  items.push({
    id: 'GRADE_ST_T',
    sectionTitle: '6. ST-T部分',
    fieldLabel: `ST偏位 (${sub.stLead}誘導) & 判定`,
    studentValueText: `${sub.stDeviationMv.toFixed(2)} mV (${sub.stTJudgment})`,
    expectedValueText: `${stLeadFeat.stDeviationMv.toFixed(2)} mV ±${tolerance.amplitudeToleranceMv.toFixed(2)} mV (${key.stJudgment})`,
    passed: stDevOk && stJudgeOk,
    feedbackJa:
      stDevOk && stJudgeOk
        ? 'ST-T偏位と正常/異常判定を正しく評価できています。'
        : `${sub.stLead}誘導のST偏位は約 ${stLeadFeat.stDeviationMv.toFixed(2)} mV、全体のST-T判定は ${key.stJudgment} です。`,
  });

  // 7. QT / QTc
  const qtDurOk =
    Math.abs(sub.qtIntervalMs - key.qtIntervalMs) <=
    tolerance.intervalToleranceMs * 1.25;
  const qtJudgeOk = sub.qtJudgment === key.qtJudgment;
  items.push({
    id: 'GRADE_QT_INTERVAL',
    sectionTitle: '7. QT時間',
    fieldLabel: 'QT実測値 (ms) / QTc & 判定',
    studentValueText: `QT ${sub.qtIntervalMs} ms / QTc ${sub.qtcMs} ms (${sub.qtJudgment})`,
    expectedValueText: `QT ${key.qtIntervalMs} ms / QTc ${key.qtcMs} ms (${key.qtJudgment})`,
    passed: qtDurOk && qtJudgeOk,
    feedbackJa:
      qtDurOk && qtJudgeOk
        ? 'QT時間およびQTcの判定が正確です。'
        : `実測QT時間は ${key.qtIntervalMs} ms、補正QTc (Bazett) は約 ${key.qtcMs} ms (${key.qtJudgment}) です。`,
  });

  const passedChecks = items.filter((i) => i.passed).length;
  const totalChecks = items.length;
  const scorePercent =
    totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

  return {
    totalChecks,
    passedChecks,
    scorePercent,
    ageGroupUsed: key.ageGroup,
    items,
  };
}
