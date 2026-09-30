/**
 * Preset Diagnostic Matrix Generator
 *
 * Runs every declared ClinicalPreset through `simulateECG` and compiles a complete
 * diagnostic matrix of Configured vs Episode vs Measured intervals, morphology checks,
 * U/QU metrics, Brugada localization, Lead I net polarity, timeline checks,
 * implementation status, and validation error/warning counts.
 */

import {
  CLINICAL_PRESET_LIST,
  ClinicalPresetId,
  createDefaultScenario,
  DominantQrsPolarity,
  ExplicitIntervalMetrics,
  ExplicitRhythmAndAtrialMetrics,
  ExplicitUMetrics,
  ImplementationStatus,
  simulateECG,
} from '../index';

export type PresetDiagnosticRow = {
  presetId: ClinicalPresetId;
  name: string;
  status: ImplementationStatus;
  primaryDomain: string;
  hrBpm: number;
  pDurationMs: number;
  prIntervalMs: number;
  qrsDurationMs: number;
  qrsAxisDeg: number;
  qtMs: number;
  quMs: number;
  qtcFridericiaMs: number;
  qtcBazettMs: number;
  transitionZone: string;
  leadIDominantPolarity: DominantQrsPolarity;
  leadINetAreaMvMs: number;
  intervalMetrics: ExplicitIntervalMetrics;
  uWaveMetrics: ExplicitUMetrics;
  rhythmMetrics: ExplicitRhythmAndAtrialMetrics;
  keyMorphologySummary: string;
  timelineSummary: string;
  validationPassed: boolean;
  validationErrors: number;
  validationWarnings: number;
  failedCheckMessages: string[];
};

export function generatePresetDiagnosticMatrix(): PresetDiagnosticRow[] {
  return CLINICAL_PRESET_LIST.map((preset) => {
    const scenario = createDefaultScenario(preset.id);
    // Use 8000 ms window for thorough multi-cycle evaluation
    scenario.durationMs = 8000;
    const res = simulateECG(scenario);
    const f = res.ecg.features;

    const keyMorphologySummary = `I(${f.perLead.I.dominantQrsPolarity},area=${f.perLead.I.netQrsAreaMvMs},R=${f.perLead.I.rAmplitudeMv}), V1(R=${f.perLead.V1.rAmplitudeMv}/S=${f.perLead.V1.sAmplitudeMv}), V6(R=${f.perLead.V6.rAmplitudeMv}/S=${f.perLead.V6.sAmplitudeMv},notch=${f.perLead.V6.hasNotchOrSlur}), ST(V1=${f.perLead.V1.stDeviationMv},V2=${f.perLead.V2.stDeviationMv},V3=${f.perLead.V3.stDeviationMv},III=${f.perLead.III.stDeviationMv})`;
    const blockedCount = res.timeline.events.filter(
      (e) => e.type === 'CONDUCTION_BLOCKED'
    ).length;
    const timelineSummary = `Events=${res.timeline.events.length}, Episodes=${res.timeline.episodes.length}, Blocked=${blockedCount}`;
    const failedCheckMessages = res.validation.items
      .filter((i) => i.severity === 'ERROR' && !i.passed)
      .map((i) => `${i.id}: ${i.message}`);

    return {
      presetId: preset.id,
      name: preset.name,
      status: preset.status,
      primaryDomain: preset.primaryDomain,
      hrBpm: f.heartRateBpm,
      pDurationMs: f.pDurationMs,
      prIntervalMs: f.prIntervalMs,
      qrsDurationMs: f.qrsDurationMs,
      qrsAxisDeg: f.qrsAxisDeg,
      qtMs: f.qtIntervalMs,
      quMs: f.uWaveMetrics.measuredQuMs,
      qtcFridericiaMs: f.qtcFridericiaMs,
      qtcBazettMs: f.qtcBazettMs,
      transitionZone: f.transitionZone,
      leadIDominantPolarity: f.perLead.I.dominantQrsPolarity,
      leadINetAreaMvMs: f.perLead.I.netQrsAreaMvMs,
      intervalMetrics: f.intervalMetrics,
      uWaveMetrics: f.uWaveMetrics,
      rhythmMetrics: f.rhythmMetrics,
      keyMorphologySummary,
      timelineSummary,
      validationPassed: res.validation.passed,
      validationErrors: res.validation.errorCount,
      validationWarnings: res.validation.warningCount,
      failedCheckMessages,
    };
  });
}

export function formatDiagnosticMatrixMarkdown(
  rows: PresetDiagnosticRow[] = generatePresetDiagnosticMatrix()
): string {
  const header =
    '| Preset | Status | HR | P (cfg/ep/meas) | PR (cfg/phys/meas) | QRS (cfg/ep/meas) | Axis (°) | QT / QU / QTcF | Trans | Morphology & Localization Summary | Timeline Summary | Errors | Warnings |\n' +
    '| :--- | :--- | ---: | :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- | ---: | ---: |';

  const body = rows
    .map((r) => {
      const im = r.intervalMetrics;
      const pCol = `${im.configuredPDurationMs}/${im.episodePDurationMs}/${im.measuredPDurationMs}`;
      const prCol = `${im.configuredPrMs}/${im.physiologicalPrMs}/${im.measuredPrMs}`;
      const qrsCol = `${im.configuredQrsDurationMs}/${im.episodeQrsDurationMs}/${im.measuredQrsDurationMs}`;
      const qtCol = `${r.qtMs}/${r.quMs}/${r.qtcFridericiaMs}`;
      return `| \`${r.presetId}\` | **${r.status}** | ${r.hrBpm} | ${pCol} | ${prCol} | ${qrsCol} | ${r.qrsAxisDeg}° | ${qtCol} | ${r.transitionZone} | ${r.keyMorphologySummary} | ${r.timelineSummary} | ${r.validationErrors} | ${r.validationWarnings} |`;
    })
    .join('\n');

  return `${header}\n${body}`;
}
