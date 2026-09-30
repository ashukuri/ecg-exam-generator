/**
 * 12-Lead ECG Exam Sheet SVG Renderer (3x4 Sequential + Mandatory 10-Sec Lead II Rhythm Strip)
 *
 * Guarantees:
 * 1. Fixed 3x4 + 10s Lead II layout ONLY:
 *      Row 0: I      aVR    V1     V4   (each 2.5 s = 62.5 mm)
 *      Row 1: II     aVL    V2     V5   (each 2.5 s = 62.5 mm)
 *      Row 2: III    aVF    V3     V6   (each 2.5 s = 62.5 mm)
 *      Row 3: II (Continuous 0.0 - 10.0 s = 250.0 mm Rhythm Strip)
 * 2. Fixed clinical scale:
 *      Paper speed = 25 mm/s (exact 25.0 SVG mm per second)
 *      Gain        = 10 mm/mV (exact 10.0 SVG mm per millivolt)
 *      Auto-gain is strictly prohibited.
 * 3. Standard 1 mV calibration pulse on all 4 rows:
 *      Height = 10.0 mm (1.0 mV), Width = 5.0 mm (200 ms)
 * 4. Zero patient demographics (no Name, Age, Sex, ID, Date, Hospital, Machine).
 * 5. Zero answer leakage when examMode = true.
 */

import {
  getClinicalPresetMetadata,
  LeadName,
  simulateECG,
  SimulationResult,
} from '../ecg-engine';
import {
  buildExamSimulationScenario,
  EXAM_CALIBRATION_PULSE_MS,
  EXAM_CALIBRATION_PULSE_MV,
  EXAM_FIXED_12_LEAD_GRID,
  EXAM_GAIN_MM_PER_MV,
  EXAM_PAPER_SPEED_MM_PER_S,
  EXAM_SHEET_GEOMETRY_MM,
  ExamEcgCaseConfig,
} from './examTypes';

export interface RenderExamSheetOptions {
  /** If true (default), strictly hides all diagnosis, preset ID, HR, seed, and parameters */
  examMode?: boolean;
  /** Optional question label such as "Question 1" or "問 1" */
  questionLabel?: string;
  /** Whether to render the questionLabel on the sheet header */
  showQuestionLabel?: boolean;
}

export interface SimulatedExamCaseResult {
  examCase: ExamEcgCaseConfig;
  simulation: SimulationResult;
  measuredPacCount: number;
  measuredPvcCount: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Runs the biophysical 12-Lead ECG Engine for a given ExamEcgCaseConfig.
 */
export function simulateExamEcgCase(
  examCase: ExamEcgCaseConfig
): SimulatedExamCaseResult {
  const scenario = buildExamSimulationScenario(examCase);
  const simulation = simulateECG(scenario);

  const measuredPacCount = simulation.timeline.events.filter(
    (e) =>
      e.type === 'ATRIAL_ECTOPIC_IMPULSE' &&
      (e.sourceId === 'EXAM_PAC' || e.sourceId === 'PAC_FOCUS')
  ).length;

  const measuredPvcCount = simulation.timeline.events.filter(
    (e) =>
      e.type === 'VENTRICULAR_ECTOPIC_IMPULSE' &&
      (e.sourceId === 'EXAM_PVC' || e.sourceId === 'PVC_FOCUS')
  ).length;

  return {
    examCase,
    simulation,
    measuredPacCount,
    measuredPvcCount,
  };
}

/**
 * Builds the 1 mV calibration pulse SVG path (height = 10 mm, width = 5 mm = 200 ms)
 * on a given row baseline `yBaseMm` within the 10.0 mm left calibration strip
 * (x = 18.5..28.5 mm), finishing at x = 27.5 mm (1.0 mm before waveform start at 28.5 mm).
 */
export function buildCalibrationPulsePathMm(
  xStripStartMm: number,
  yBaseMm: number
): string {
  const pulseHeightMm = EXAM_CALIBRATION_PULSE_MV * EXAM_GAIN_MM_PER_MV; // 10.0 mm
  const pulseWidthMm =
    (EXAM_CALIBRATION_PULSE_MS / 1000) * EXAM_PAPER_SPEED_MM_PER_S; // 5.0 mm
  const xStart = xStripStartMm + 1.0; // 19.5 mm
  const xRise = xStripStartMm + 2.5; // 21.0 mm
  const xFall = xRise + pulseWidthMm; // 26.0 mm
  const xEnd = xStripStartMm + 9.0; // 27.5 mm (< 28.5 mm leadAreaXMm -> zero overlap with waveform!)
  const yTop = yBaseMm - pulseHeightMm;

  return [
    `M ${xStart.toFixed(2)} ${yBaseMm.toFixed(2)}`,
    `L ${xRise.toFixed(2)} ${yBaseMm.toFixed(2)}`,
    `L ${xRise.toFixed(2)} ${yTop.toFixed(2)}`,
    `L ${xFall.toFixed(2)} ${yTop.toFixed(2)}`,
    `L ${xFall.toFixed(2)} ${yBaseMm.toFixed(2)}`,
    `L ${xEnd.toFixed(2)} ${yBaseMm.toFixed(2)}`,
  ].join(' ');
}

/**
 * Renders the 12-Lead Exam ECG Sheet as a self-contained A4 Landscape SVG (297 mm x 210 mm).
 *
 * Coordinate system: 1 SVG unit = 1.000 millimeter.
 * - Paper speed: 25.0 mm/s
 * - Gain: 10.0 mm/mV
 * - Sequential 3x4 layout (Rows 0..2) + 10.0s Continuous Lead II Rhythm Strip (Row 3):
 *     Column 0 (I, II, III):    0.0 - 2.5 s (62.5 mm)
 *     Column 1 (aVR, aVL, aVF): 2.5 - 5.0 s (62.5 mm)
 *     Column 2 (V1, V2, V3):    5.0 - 7.5 s (62.5 mm)
 *     Column 3 (V4, V5, V6):    7.5 - 10.0 s (62.5 mm)
 *     Row 3    (II Rhythm):     0.0 - 10.0 s (250.0 mm)
 */
export function renderExamSheetSvg(
  simResult: SimulatedExamCaseResult,
  options: RenderExamSheetOptions = {}
): string {
  const examMode = options.examMode ?? true;
  const showQuestionLabel =
    options.showQuestionLabel ?? Boolean(options.questionLabel);
  const questionLabel = options.questionLabel?.trim() || '';

  const {
    pageWidthMm,
    pageHeightMm,
    gridXMm,
    gridYMm,
    gridWidthMm,
    gridHeightMm,
    leadAreaXMm,
    leadColumnWidthMm,
    rhythmStripWidthMm,
    leadRowHeightMm,
    rowBaselinesYMm,
    columnDurationSec,
    rhythmStripDurationSec,
  } = EXAM_SHEET_GEOMETRY_MM;

  // 1. Build 1 mm minor grid & 5 mm major grid lines
  const minorGridLines: string[] = [];
  const majorGridLines: string[] = [];

  const totalColsMm = Math.round(gridWidthMm); // 260 mm
  const totalRowsMm = Math.round(gridHeightMm); // 180 mm

  for (let dx = 0; dx <= totalColsMm; dx++) {
    const x = (gridXMm + dx).toFixed(2);
    const line = `<line x1="${x}" y1="${gridYMm}" x2="${x}" y2="${gridYMm + gridHeightMm}" />`;
    if (dx % 5 === 0) {
      majorGridLines.push(line);
    } else {
      minorGridLines.push(line);
    }
  }

  for (let dy = 0; dy <= totalRowsMm; dy++) {
    const y = (gridYMm + dy).toFixed(2);
    const line = `<line x1="${gridXMm}" y1="${y}" x2="${gridXMm + gridWidthMm}" y2="${y}" />`;
    if (dy % 5 === 0) {
      majorGridLines.push(line);
    } else {
      minorGridLines.push(line);
    }
  }

  // 2. Build 1 mV calibration pulses on all 4 rows (Rows 0..2 for 3x4 + Row 3 for 10s Lead II)
  const calibrationPaths: string[] = [];
  for (let r = 0; r < 4; r++) {
    const yBase = rowBaselinesYMm[r]!;
    const d = buildCalibrationPulsePathMm(gridXMm, yBase);
    calibrationPaths.push(
      `<path d="${d}" fill="none" stroke="#111827" stroke-width="0.38" stroke-linecap="square" stroke-linejoin="miter" data-calibration-row="${r}" data-height-mm="10" data-width-mm="5" data-x-end-mm="${(gridXMm + 9.0).toFixed(2)}" />`
    );
  }

  // 3. Build 3x4 Sequential Lead Waveform Paths & Lead Labels (Rows 0..2)
  const leadElements: string[] = [];

  for (let r = 0; r < 3; r++) {
    const rowLeads = EXAM_FIXED_12_LEAD_GRID[r]!;
    const yBase = rowBaselinesYMm[r]!;
    const yRowTop = gridYMm + r * leadRowHeightMm + 0.6;
    const yRowBottom = gridYMm + (r + 1) * leadRowHeightMm - 0.6;

    for (let c = 0; c < 4; c++) {
      const leadName: LeadName = rowLeads[c]!;
      const xCellStart = leadAreaXMm + c * leadColumnWidthMm;
      const xCellEnd = xCellStart + leadColumnWidthMm;
      const tStartMs = Math.round(c * columnDurationSec * 1000);
      const tEndMs = Math.round((c + 1) * columnDurationSec * 1000);

      const points = simResult.simulation.ecg.final[leadName] ?? [];
      const coords: string[] = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        if (pt.t < tStartMs || pt.t > tEndMs) continue;
        const dtSec = (pt.t - tStartMs) / 1000;
        const xMm = xCellStart + dtSec * EXAM_PAPER_SPEED_MM_PER_S;
        const rawYMm = yBase - pt.v * EXAM_GAIN_MM_PER_MV;
        const yMm = Math.max(yRowTop, Math.min(yRowBottom, rawYMm));
        coords.push(`${xMm.toFixed(3)},${yMm.toFixed(3)}`);
      }

      // Column transition marker tick
      const tickX = xCellStart.toFixed(2);
      leadElements.push(
        `<line x1="${tickX}" y1="${(yBase - 12.5).toFixed(2)}" x2="${tickX}" y2="${(yBase + 12.5).toFixed(2)}" stroke="#111827" stroke-width="0.24" stroke-dasharray="0.8,0.8" />`
      );

      // Lead Label
      leadElements.push(
        `<text x="${(xCellStart + 1.8).toFixed(2)}" y="${(yBase - 13.0).toFixed(2)}" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="3.5" font-weight="700" fill="#0f172a" data-lead-label="${leadName}">${leadName}</text>`
      );

      // Waveform Polyline
      if (coords.length > 0) {
        leadElements.push(
          `<polyline points="${coords.join(' ')}" fill="none" stroke="#0f172a" stroke-width="0.36" stroke-linejoin="round" stroke-linecap="round" data-lead-wave="${leadName}" data-col-index="${c}" data-t-start-ms="${tStartMs}" data-t-end-ms="${tEndMs}" data-x-start-mm="${xCellStart.toFixed(2)}" data-x-end-mm="${xCellEnd.toFixed(2)}" data-cell-width-mm="${leadColumnWidthMm.toFixed(1)}" data-segment-duration-s="${columnDurationSec.toFixed(1)}" data-paper-speed="25" data-gain="10" />`
        );
      }
    }
  }

  // 4. Build Row 3: Mandatory 10.0-Second Continuous Lead II Rhythm Strip (0.0 - 10.0 s = 250.0 mm)
  const yRhythmSeparator = gridYMm + 3 * leadRowHeightMm; // 151.0 mm
  const yRhythmBase = rowBaselinesYMm[3]!; // 173.5 mm
  const yRhythmTop = yRhythmSeparator + 0.6;
  const yRhythmBottom = gridYMm + gridHeightMm - 0.6;
  const leadIIPoints = simResult.simulation.ecg.final.II ?? [];
  const rhythmCoords: string[] = [];

  for (let i = 0; i < leadIIPoints.length; i++) {
    const pt = leadIIPoints[i]!;
    if (pt.t < 0 || pt.t > 10000) continue;
    const tSec = pt.t / 1000;
    const xMm = leadAreaXMm + tSec * EXAM_PAPER_SPEED_MM_PER_S;
    const rawYMm = yRhythmBase - pt.v * EXAM_GAIN_MM_PER_MV;
    const yMm = Math.max(yRhythmTop, Math.min(yRhythmBottom, rawYMm));
    rhythmCoords.push(`${xMm.toFixed(3)},${yMm.toFixed(3)}`);
  }

  // Horizontal separator line above the 10-second Lead II rhythm strip
  leadElements.push(
    `<line x1="${gridXMm.toFixed(2)}" y1="${yRhythmSeparator.toFixed(2)}" x2="${(gridXMm + gridWidthMm).toFixed(2)}" y2="${yRhythmSeparator.toFixed(2)}" stroke="#d46a6a" stroke-width="0.34" data-rhythm-separator="true" />`
  );

  // Rhythm strip start tick & "II" label
  leadElements.push(
    `<line x1="${leadAreaXMm.toFixed(2)}" y1="${(yRhythmBase - 12.5).toFixed(2)}" x2="${leadAreaXMm.toFixed(2)}" y2="${(yRhythmBase + 12.5).toFixed(2)}" stroke="#111827" stroke-width="0.24" stroke-dasharray="0.8,0.8" />`
  );
  leadElements.push(
    `<text x="${(leadAreaXMm + 1.8).toFixed(2)}" y="${(yRhythmBase - 13.0).toFixed(2)}" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="3.5" font-weight="700" fill="#0f172a" data-lead-label="II" data-rhythm-strip-label="II">II</text>`
  );

  if (rhythmCoords.length > 0) {
    leadElements.push(
      `<polyline points="${rhythmCoords.join(' ')}" fill="none" stroke="#0f172a" stroke-width="0.36" stroke-linejoin="round" stroke-linecap="round" data-rhythm-strip-wave="II" data-t-start-ms="0" data-t-end-ms="10000" data-x-start-mm="${leadAreaXMm.toFixed(2)}" data-x-end-mm="${(leadAreaXMm + rhythmStripWidthMm).toFixed(2)}" data-strip-width-mm="${rhythmStripWidthMm.toFixed(1)}" data-segment-duration-s="${rhythmStripDurationSec.toFixed(1)}" data-paper-speed="25" data-gain="10" />`
    );
  }

  // 5. Header Elements (Strictly controlled by examMode: ONLY Question number and 25 mm/s 10 mm/mV)
  const headerElements: string[] = [];
  if (showQuestionLabel && questionLabel) {
    headerElements.push(
      `<text x="${gridXMm.toFixed(2)}" y="11.8" font-family="'Inter', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="4.6" font-weight="800" fill="#0f172a" data-question-label="true">${escapeXml(questionLabel)}</text>`
    );
  }

  if (!examMode) {
    const meta = getClinicalPresetMetadata(simResult.examCase.presetId);
    const teacherSummary = `[教員用プレビュー / 出題時は非表示] ${meta.nameJa} (${meta.id}) | HR: ${Math.round(simResult.simulation.ecg.features.heartRateBpm)} bpm | PAC: ${simResult.examCase.pacCount} | PVC: ${simResult.examCase.pvcCount} | Seed: ${simResult.examCase.seed}`;
    headerElements.push(
      `<text x="${(showQuestionLabel && questionLabel ? gridXMm + 36 : gridXMm).toFixed(2)}" y="11.6" font-family="'Inter', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="3.2" font-weight="600" fill="#b91c1c" data-teacher-preview="true">${escapeXml(teacherSummary)}</text>`
    );
  }

  headerElements.push(
    `<text x="${(gridXMm + gridWidthMm).toFixed(2)}" y="11.8" text-anchor="end" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.6" font-weight="700" fill="#1e293b" data-scale-label="true">25 mm/s    10 mm/mV</text>`
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidthMm} ${pageHeightMm}" width="100%" height="100%" data-exam-sheet="true" data-exam-mode="${examMode ? 'ON' : 'OFF'}" data-paper-speed-mm-s="${EXAM_PAPER_SPEED_MM_PER_S}" data-gain-mm-mv="${EXAM_GAIN_MM_PER_MV}" data-total-duration-s="10.0" data-cell-width-mm="62.5" data-rhythm-strip-width-mm="250.0">`,
    `  <rect x="0" y="0" width="${pageWidthMm}" height="${pageHeightMm}" fill="#ffffff" />`,
    `  <g id="exam-header">${headerElements.join('')}</g>`,
    `  <g id="ecg-minor-grid" stroke="#f9d2d2" stroke-width="0.13">${minorGridLines.join('')}</g>`,
    `  <g id="ecg-major-grid" stroke="#ea9696" stroke-width="0.28">${majorGridLines.join('')}</g>`,
    `  <rect x="${gridXMm}" y="${gridYMm}" width="${gridWidthMm}" height="${gridHeightMm}" fill="none" stroke="#d46a6a" stroke-width="0.42" />`,
    `  <line x1="${leadAreaXMm}" y1="${gridYMm}" x2="${leadAreaXMm}" y2="${gridYMm + gridHeightMm}" stroke="#d46a6a" stroke-width="0.32" />`,
    `  <g id="ecg-calibration-pulses">${calibrationPaths.join('')}</g>`,
    `  <g id="ecg-12-lead-waveforms">${leadElements.join('')}</g>`,
    `</svg>`,
  ].join('\n');
}

/**
 * Formats human-readable description of electrode error & noise for Answer Key PDF.
 */
export function describeExamCaseModifiers(examCase: ExamEcgCaseConfig): {
  noiseText: string;
  electrodeText: string;
} {
  const noiseParts: string[] = [];
  if (examCase.noise.emg !== 'NONE') {
    const targets = (examCase.noise.emgTargets ?? ['ALL']).join('+');
    noiseParts.push(`EMG(${examCase.noise.emg} @ ${targets})`);
  }
  if (examCase.noise.ac !== 'NONE') {
    const targets = (examCase.noise.acTargets ?? ['ALL']).join('+');
    noiseParts.push(
      `AC ${examCase.noise.acFrequencyHz}Hz(${examCase.noise.ac} @ ${targets})`
    );
  }
  const drift =
    examCase.noise.driftLevel ??
    (examCase.noise.baselineDrift ? 'DRIFT_SMALL' : 'DRIFT_NONE');
  if (drift !== 'DRIFT_NONE') {
    noiseParts.push(`Drift(${drift})`);
  }
  const noiseText = noiseParts.length > 0 ? noiseParts.join(', ') : 'NONE (Clean)';

  const elecParts: string[] = [];
  if (examCase.electrodeError.reversal !== 'NONE') {
    elecParts.push(examCase.electrodeError.reversal);
  }
  if (examCase.electrodeError.missing.length > 0) {
    elecParts.push(examCase.electrodeError.missing.join(', '));
  }
  const electrodeText =
    elecParts.length > 0 ? elecParts.join(' + ') : 'NONE (Normal Placement)';

  return { noiseText, electrodeText };
}

/**
 * Renders an A4 Landscape Answer Key Page SVG (up to 6 questions per page)
 */
export function renderAnswerKeyPageSvg(
  title: string,
  casesWithIndex: Array<{ questionNumber: number; sim: SimulatedExamCaseResult }>,
  pageIndex: number,
  totalPages: number
): string {
  const pageWidthMm = 297;
  const pageHeightMm = 210;

  const rowsSvg: string[] = [];
  casesWithIndex.forEach(({ questionNumber, sim }, idx) => {
    const yTop = 34 + idx * 27;
    const c = sim.examCase;
    const meta = getClinicalPresetMetadata(c.presetId);
    const feat = sim.simulation.ecg.features;
    const { noiseText, electrodeText } = describeExamCaseModifiers(c);
    const modeLabel = c.questionMode ?? 'DIAGNOSIS_AND_MEASUREMENT';

    rowsSvg.push(`
      <g transform="translate(14, ${yTop})">
        <rect x="0" y="0" width="269" height="24.5" rx="1.8" fill="${idx % 2 === 0 ? '#f8fafc' : '#ffffff'}" stroke="#cbd5e1" stroke-width="0.3" />
        <rect x="0" y="0" width="22" height="24.5" rx="1.8" fill="#0f172a" />
        <text x="11" y="14.2" text-anchor="middle" font-family="'Inter', 'Hiragino Sans', sans-serif" font-size="4.4" font-weight="800" fill="#ffffff">問 ${questionNumber}</text>

        <text x="26" y="7.2" font-family="'Inter', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="3.9" font-weight="800" fill="#0f172a">${escapeXml(meta.nameJa)} — ${escapeXml(meta.title)}</text>
        <text x="265" y="7.0" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="2.9" font-weight="700" fill="#475569">Mode: ${escapeXml(modeLabel)} | PresetID: ${escapeXml(c.presetId)} | Seed: ${c.seed}</text>

        <text x="26" y="14.2" font-family="'Inter', 'Hiragino Sans', sans-serif" font-size="3.2" font-weight="600" fill="#1e293b">
          設定HR: ${c.useCustomHeartRate ? `${c.heartRateBpm} bpm (手動)` : `${Math.round(sim.simulation.resolvedConfig.heartRateBpm)} bpm (標準)`} | 実測心拍数: ${Math.round(feat.heartRateBpm)} bpm | PAC数: ${c.pacCount} (実測 ${sim.measuredPacCount}) | PVC数: ${c.pvcCount} (実測 ${sim.measuredPvcCount})
        </text>
        <text x="26" y="20.6" font-family="'Inter', 'Hiragino Sans', sans-serif" font-size="3.0" fill="#334155">
          電極設定: ${escapeXml(electrodeText)} | ノイズ設定: ${escapeXml(noiseText)} | 主要所見: PR ${Math.round(feat.prIntervalMs)}ms, QRS ${Math.round(feat.qrsDurationMs)}ms, QTc ${Math.round(feat.qtcBazettMs)}ms, 軸 ${Math.round(feat.qrsAxisDeg)}°${c.examinerNote ? ` | メモ: ${escapeXml(c.examinerNote)}` : ''}
        </text>
      </g>
    `);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidthMm} ${pageHeightMm}" width="100%" height="100%" data-answer-key-page="${pageIndex + 1}">`,
    `  <rect x="0" y="0" width="${pageWidthMm}" height="${pageHeightMm}" fill="#ffffff" />`,
    `  <rect x="14" y="12" width="269" height="16" rx="2" fill="#0f172a" />`,
    `  <text x="20" y="22.2" font-family="'Inter', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="5.2" font-weight="800" fill="#ffffff">${escapeXml(title)} — 解答・出題条件一覧 (Answer Key)</text>`,
    `  <text x="277" y="22.0" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="3.5" font-weight="600" fill="#cbd5e1">Page ${pageIndex + 1} / ${totalPages} | 25 mm/s · 10 mm/mV · 3x4 + 10s Lead II</text>`,
    rowsSvg.join('\n'),
    `</svg>`,
  ].join('\n');
}
