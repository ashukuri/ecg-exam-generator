/**
 * 12-Lead ECG Exam PNG & PDF Export Pipeline
 *
 * Provides:
 * 1. High-resolution 300 DPI PNG export (3508 x 2480 px for A4 Landscape)
 * 2. Pure Vector PDF 1.4 Generator:
 *    - `buildExamQuestionSetPdfBytes` (Unlimited multi-page Question Set PDF, 3x4 + 10s Lead II, zero answer leakage)
 *    - `buildExamAnswerKeyPdfBytes` (Separate Answer Key PDF)
 *    - `buildMeasurementWorksheetPdfBytes` (Printable Blank Student ECG Analysis Sheet PDF)
 *    - `buildMeasurementAnswerKeyPdfBytes` (Detailed Student Measurement Answer Key PDF)
 */

import { getClinicalPresetMetadata, LeadName } from '../ecg-engine';
import {
  describeExamCaseModifiers,
  renderExamSheetSvg,
  SimulatedExamCaseResult,
  simulateExamEcgCase,
} from './examEcgRenderer';
import {
  EXAM_CALIBRATION_PULSE_MS,
  EXAM_CALIBRATION_PULSE_MV,
  EXAM_FIXED_12_LEAD_GRID,
  EXAM_GAIN_MM_PER_MV,
  EXAM_PAPER_SPEED_MM_PER_S,
  EXAM_SHEET_GEOMETRY_MM,
  ExamEcgCaseConfig,
} from './examTypes';

const MM_TO_PT = 72 / 25.4; // 1 mm = 2.83464567 pt
const A4_WIDTH_PT = Number((297 * MM_TO_PT).toFixed(2)); // 841.89 pt
const A4_HEIGHT_PT = Number((210 * MM_TO_PT).toFixed(2)); // 595.28 pt

function mmXToPt(xMm: number): number {
  return xMm * MM_TO_PT;
}

function mmYToPt(yMm: number): number {
  return (EXAM_SHEET_GEOMETRY_MM.pageHeightMm - yMm) * MM_TO_PT;
}

function pdfEscapeText(str: string): string {
  const ascii = str.replace(/[^\x20-\x7E]/g, ' ');
  return ascii
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Builds the PDF vector content stream for a single 12-Lead + 10s Lead II Exam Question Page (A4 Landscape).
 * Strictly excludes all diagnosis, presetId, HR, seed, and parameter strings.
 */
function buildQuestionPageContentStream(
  sim: SimulatedExamCaseResult,
  questionLabel?: string
): string {
  const ops: string[] = [];
  const {
    gridXMm,
    gridYMm,
    gridWidthMm,
    gridHeightMm,
    leadAreaXMm,
    leadColumnWidthMm,
    leadRowHeightMm,
    rowBaselinesYMm,
    columnDurationSec,
  } = EXAM_SHEET_GEOMETRY_MM;

  // 1. White sheet background
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)} re f`);

  // 2. Minor 1 mm grid lines (#f9d2d2 -> 0.976 0.824 0.824)
  ops.push('0.976 0.824 0.824 RG');
  ops.push('0.35 w');
  const totalColsMm = Math.round(gridWidthMm);
  const totalRowsMm = Math.round(gridHeightMm);

  for (let dx = 0; dx <= totalColsMm; dx++) {
    if (dx % 5 === 0) continue;
    const xPt = mmXToPt(gridXMm + dx).toFixed(2);
    const yTopPt = mmYToPt(gridYMm).toFixed(2);
    const yBotPt = mmYToPt(gridYMm + gridHeightMm).toFixed(2);
    ops.push(`${xPt} ${yTopPt} m ${xPt} ${yBotPt} l S`);
  }

  for (let dy = 0; dy <= totalRowsMm; dy++) {
    if (dy % 5 === 0) continue;
    const yPt = mmYToPt(gridYMm + dy).toFixed(2);
    const xLeftPt = mmXToPt(gridXMm).toFixed(2);
    const xRightPt = mmXToPt(gridXMm + gridWidthMm).toFixed(2);
    ops.push(`${xLeftPt} ${yPt} m ${xRightPt} ${yPt} l S`);
  }

  // 3. Major 5 mm grid lines (#ea9696 -> 0.918 0.588 0.588)
  ops.push('0.918 0.588 0.588 RG');
  ops.push('0.75 w');
  for (let dx = 0; dx <= totalColsMm; dx += 5) {
    const xPt = mmXToPt(gridXMm + dx).toFixed(2);
    const yTopPt = mmYToPt(gridYMm).toFixed(2);
    const yBotPt = mmYToPt(gridYMm + gridHeightMm).toFixed(2);
    ops.push(`${xPt} ${yTopPt} m ${xPt} ${yBotPt} l S`);
  }
  for (let dy = 0; dy <= totalRowsMm; dy += 5) {
    const yPt = mmYToPt(gridYMm + dy).toFixed(2);
    const xLeftPt = mmXToPt(gridXMm).toFixed(2);
    const xRightPt = mmXToPt(gridXMm + gridWidthMm).toFixed(2);
    ops.push(`${xLeftPt} ${yPt} m ${xRightPt} ${yPt} l S`);
  }

  // 4. Outer border, calibration separator, and Row 3 rhythm strip separator
  const yRhythmSeparator = gridYMm + 3 * leadRowHeightMm;
  ops.push('0.831 0.416 0.416 RG');
  ops.push('1.10 w');
  ops.push(
    `${mmXToPt(gridXMm).toFixed(2)} ${mmYToPt(gridYMm + gridHeightMm).toFixed(2)} ${mmXToPt(gridWidthMm).toFixed(2)} ${(gridHeightMm * MM_TO_PT).toFixed(2)} re S`
  );
  ops.push(
    `${mmXToPt(leadAreaXMm).toFixed(2)} ${mmYToPt(gridYMm).toFixed(2)} m ${mmXToPt(leadAreaXMm).toFixed(2)} ${mmYToPt(gridYMm + gridHeightMm).toFixed(2)} l S`
  );
  ops.push(
    `${mmXToPt(gridXMm).toFixed(2)} ${mmYToPt(yRhythmSeparator).toFixed(2)} m ${mmXToPt(gridXMm + gridWidthMm).toFixed(2)} ${mmYToPt(yRhythmSeparator).toFixed(2)} l S`
  );

  // 5. 1 mV Calibration pulses (10 mm tall, 5 mm wide) on all 4 rows (Rows 0..2 + Row 3 Lead II)
  ops.push('0.06 0.09 0.16 RG');
  ops.push('1.05 w');
  const pulseHeightMm = EXAM_CALIBRATION_PULSE_MV * EXAM_GAIN_MM_PER_MV; // 10 mm
  const pulseWidthMm =
    (EXAM_CALIBRATION_PULSE_MS / 1000) * EXAM_PAPER_SPEED_MM_PER_S; // 5 mm
  for (let r = 0; r < 4; r++) {
    const yBase = rowBaselinesYMm[r]!;
    const x0 = gridXMm + 1.0;
    const xRise = gridXMm + 2.5;
    const xFall = xRise + pulseWidthMm;
    const xEnd = gridXMm + 9.0;
    const yTop = yBase - pulseHeightMm;

    ops.push(
      [
        `${mmXToPt(x0).toFixed(2)} ${mmYToPt(yBase).toFixed(2)} m`,
        `${mmXToPt(xRise).toFixed(2)} ${mmYToPt(yBase).toFixed(2)} l`,
        `${mmXToPt(xRise).toFixed(2)} ${mmYToPt(yTop).toFixed(2)} l`,
        `${mmXToPt(xFall).toFixed(2)} ${mmYToPt(yTop).toFixed(2)} l`,
        `${mmXToPt(xFall).toFixed(2)} ${mmYToPt(yBase).toFixed(2)} l`,
        `${mmXToPt(xEnd).toFixed(2)} ${mmYToPt(yBase).toFixed(2)} l S`,
      ].join(' ')
    );
  }

  // 6. 3x4 Simultaneous 12-Lead Waveforms & Lead Labels (Rows 0..2)
  for (let r = 0; r < 3; r++) {
    const rowLeads = EXAM_FIXED_12_LEAD_GRID[r]!;
    const yBase = rowBaselinesYMm[r]!;
    const yRowTop = gridYMm + r * leadRowHeightMm + 0.6;
    const yRowBottom = gridYMm + (r + 1) * leadRowHeightMm - 0.6;

    for (let c = 0; c < 4; c++) {
      const leadName: LeadName = rowLeads[c]!;
      const xCellStart = leadAreaXMm + c * leadColumnWidthMm;
      const tStartMs = 0;
      const tEndMs = Math.round(columnDurationSec * 1000);

      // Column divider tick
      ops.push('0.25 0.30 0.38 RG 0.65 w');
      ops.push(
        `${mmXToPt(xCellStart).toFixed(2)} ${mmYToPt(yBase - 12.5).toFixed(2)} m ${mmXToPt(xCellStart).toFixed(2)} ${mmYToPt(yBase + 12.5).toFixed(2)} l S`
      );

      // Lead Label text
      ops.push('BT /F2 10.0 Tf 0.06 0.09 0.16 rg');
      ops.push(
        `${mmXToPt(xCellStart + 1.8).toFixed(2)} ${mmYToPt(yBase - 13.0).toFixed(2)} Td`
      );
      ops.push(`(${pdfEscapeText(leadName)}) Tj ET`);

      // Waveform polyline
      const points = sim.simulation.ecg.final[leadName] ?? [];
      const pathCmds: string[] = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        if (pt.t < tStartMs || pt.t > tEndMs) continue;
        const dtSec = (pt.t - tStartMs) / 1000;
        const xMm = xCellStart + dtSec * EXAM_PAPER_SPEED_MM_PER_S;
        const rawYMm = yBase - pt.v * EXAM_GAIN_MM_PER_MV;
        const yMm = Math.max(yRowTop, Math.min(yRowBottom, rawYMm));
        const cmd = pathCmds.length === 0 ? 'm' : 'l';
        pathCmds.push(
          `${mmXToPt(xMm).toFixed(2)} ${mmYToPt(yMm).toFixed(2)} ${cmd}`
        );
      }
      if (pathCmds.length > 1) {
        ops.push('0.05 0.08 0.14 RG 0.96 w 1 J 1 j');
        ops.push(`${pathCmds.join(' ')} S`);
      }
    }
  }

  // 7. Row 3: Mandatory 10.0-Second Continuous Lead II Rhythm Strip (0.0 - 10.0 s = 250.0 mm)
  const yRhythmBase = rowBaselinesYMm[3]!;
  const yRhythmTop = yRhythmSeparator + 0.6;
  const yRhythmBottom = gridYMm + gridHeightMm - 0.6;

  ops.push('0.25 0.30 0.38 RG 0.65 w');
  ops.push(
    `${mmXToPt(leadAreaXMm).toFixed(2)} ${mmYToPt(yRhythmBase - 12.5).toFixed(2)} m ${mmXToPt(leadAreaXMm).toFixed(2)} ${mmYToPt(yRhythmBase + 12.5).toFixed(2)} l S`
  );
  ops.push('BT /F2 10.0 Tf 0.06 0.09 0.16 rg');
  ops.push(
    `${mmXToPt(leadAreaXMm + 1.8).toFixed(2)} ${mmYToPt(yRhythmBase - 13.0).toFixed(2)} Td`
  );
  ops.push('(II) Tj ET');

  const leadIIPoints = sim.simulation.ecg.final.II ?? [];
  const rhythmCmds: string[] = [];
  for (let i = 0; i < leadIIPoints.length; i++) {
    const pt = leadIIPoints[i]!;
    if (pt.t < 0 || pt.t > 10000) continue;
    const tSec = pt.t / 1000;
    const xMm = leadAreaXMm + tSec * EXAM_PAPER_SPEED_MM_PER_S;
    const rawYMm = yRhythmBase - pt.v * EXAM_GAIN_MM_PER_MV;
    const yMm = Math.max(yRhythmTop, Math.min(yRhythmBottom, rawYMm));
    const cmd = rhythmCmds.length === 0 ? 'm' : 'l';
    rhythmCmds.push(
      `${mmXToPt(xMm).toFixed(2)} ${mmYToPt(yMm).toFixed(2)} ${cmd}`
    );
  }
  if (rhythmCmds.length > 1) {
    ops.push('0.05 0.08 0.14 RG 0.96 w 1 J 1 j');
    ops.push(`${rhythmCmds.join(' ')} S`);
  }

  // 8. Header labels (Strictly ONLY Question number if provided + fixed 25 mm/s 10 mm/mV scale)
  if (questionLabel) {
    ops.push('BT /F2 13 Tf 0.06 0.09 0.16 rg');
    ops.push(`${mmXToPt(gridXMm).toFixed(2)} ${mmYToPt(11.8).toFixed(2)} Td`);
    ops.push(`(${pdfEscapeText(questionLabel)}) Tj ET`);
  }

  ops.push('BT /F2 10.5 Tf 0.12 0.16 0.23 rg');
  ops.push(
    `${mmXToPt(gridXMm + gridWidthMm - 44).toFixed(2)} ${mmYToPt(11.8).toFixed(2)} Td`
  );
  ops.push('(25 mm/s   10 mm/mV) Tj ET');

  return ops.join('\n');
}

/**
 * Builds the PDF vector content stream for a Blank Student ECG Analysis Worksheet Page (A4 Landscape).
 * Contains the 12-Lead + 10s Lead II strip on the left/top and structured student measurement fill-in boxes on the bottom/right.
 */
function buildMeasurementWorksheetPageContentStream(
  sim: SimulatedExamCaseResult,
  questionNumber: number,
  title: string
): string {
  const ops: string[] = [];
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)} re f`);

  // Header bar
  ops.push('0.06 0.09 0.16 rg');
  ops.push(
    `${mmXToPt(14).toFixed(2)} ${mmYToPt(22).toFixed(2)} ${(269 * MM_TO_PT).toFixed(2)} ${(11 * MM_TO_PT).toFixed(2)} re f`
  );
  ops.push('BT /F2 11.0 Tf 1 1 1 rg');
  ops.push(`${mmXToPt(18).toFixed(2)} ${mmYToPt(18.2).toFixed(2)} Td`);
  ops.push(
    `(${pdfEscapeText(`${title} - 12-Lead ECG Student Measurement Worksheet | Case #${questionNumber} [25 mm/s, 10 mm/mV]`)}) Tj ET`
  );

  // Student Name / ID line
  ops.push('BT /F1 9.5 Tf 0.12 0.16 0.23 rg');
  ops.push(`${mmXToPt(14).toFixed(2)} ${mmYToPt(29.0).toFixed(2)} Td`);
  ops.push(
    '(Student ID / Gakuseki: ____________________  Name / Shimei: ________________________  Date: ____/____/____) Tj ET'
  );

  // Structured Measurement Boxes (8 fill-in cards across 2 columns, y = 34..196 mm)
  const boxes = [
    {
      title: '1. Heart Rate (HR) & Rhythm Analysis',
      lines: [
        'Heart Rate (HR): ________ bpm     [  ] Normal (60-100)   [  ] Bradycardia (<60)   [  ] Tachycardia (>100)',
        'Rhythm Regularity: [  ] Regular (Sei)   [  ] Irregular (Fusei: PAC / PVC / AF / Block)',
        'Origin: [  ] Sinus Node (Dosei)   [  ] Non-Sinus (Ictopic / Junctional / Ventricular)   [  ] Normal / [  ] Abnormal',
      ],
    },
    {
      title: '2. P Wave (Lead II / V1)',
      lines: [
        'P Wave: [  ] Present (Arimasu)   [  ] Absent (f-wave / F-wave / None)   Polarity: [  ] Upright   [  ] Inverted',
        'Duration: ________ ms (____ mm)     Amplitude: ________ mV (____ mm)',
        'Morphology: [  ] Normal   [  ] Peaked (P Pulmonale / Uyobo)   [  ] Bifid (P Mitrale / Sabobo)   [  ] Retrograde',
      ],
    },
    {
      title: '3. PQ (PR) Interval',
      lines: [
        'PR Interval: ________ ms (____ mm)     [  ] Not Measurable (AF / Complete AV Block)',
        'Judgment: [  ] Normal (120-200 ms)   [  ] Prolonged (1st deg AVB >200ms)   [  ] Shortened (WPW <120ms)',
        'PR Segment Shift: [  ] Isoelectric (Heitan)   [  ] PR Depression (Shinmaken)   [  ] PR Elevation (aVR)',
      ],
    },
    {
      title: '4. QRS Complex & Frontal Electrical Axis',
      lines: [
        'QRS Duration: ________ ms (____ mm)   [  ] Narrow (<120 ms)   [  ] Wide (>=120 ms: RBBB / LBBB / PVC)',
        'Frontal Axis: [  ] Normal (-30 to +90 deg)   [  ] LAD (Left Axis)   [  ] RAD (Right Axis)   (Est: ______ deg)',
        'Morphology: [  ] Normal   [  ] rsR prime (RBBB)   [  ] Broad R / QS (LBBB)   [  ] Delta wave (WPW)   [  ] High Voltage',
      ],
    },
    {
      title: '5. ST Segment & T Wave (ST-T Analysis)',
      lines: [
        'ST Shift: ________ mV (____ mm) in Leads: ____________________   [  ] Isoelectric (Heitan)',
        'ST Type: [  ] Normal   [  ] Elevation (STEMI / Pericarditis)   [  ] Depression (Ischemia / Strain / Digoxin)',
        'T Wave: [  ] Normal Upright   [  ] Inverted (Insei-T)   [  ] Tall Tent-T (K-kessho)   [  ] Flat   U-Wave: [  ] No  [  ] Yes',
      ],
    },
    {
      title: '6. QT / QTc Interval & Final Diagnosis',
      lines: [
        'Measured QT: ________ ms (Lead: _____)     Corrected QTc (Bazett): ________ ms   [  ] Normal   [  ] Prolonged',
        'Primary ECG Diagnosis (Shindan-mei): ___________________________________________________________',
        'Key Findings (Tokucho-teki Shoken): ___________________________________________________________',
      ],
    },
  ];

  boxes.forEach((box, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const xMm = 14 + col * 136;
    const yTopMm = 35 + row * 52;
    const wMm = 131;
    const hMm = 48;

    ops.push('0.98 0.99 1.00 rg 0.72 0.78 0.85 RG 0.8 w');
    ops.push(
      `${mmXToPt(xMm).toFixed(2)} ${mmYToPt(yTopMm + hMm).toFixed(2)} ${(wMm * MM_TO_PT).toFixed(2)} ${(hMm * MM_TO_PT).toFixed(2)} re B`
    );

    ops.push('BT /F2 10.5 Tf 0.06 0.09 0.16 rg');
    ops.push(`${mmXToPt(xMm + 4).toFixed(2)} ${mmYToPt(yTopMm + 8).toFixed(2)} Td`);
    ops.push(`(${pdfEscapeText(box.title)}) Tj ET`);

    box.lines.forEach((line, lIdx) => {
      ops.push('BT /F1 8.5 Tf 0.15 0.20 0.28 rg');
      ops.push(
        `${mmXToPt(xMm + 4).toFixed(2)} ${mmYToPt(yTopMm + 19 + lIdx * 11).toFixed(2)} Td`
      );
      ops.push(`(${pdfEscapeText(line)}) Tj ET`);
    });
  });

  // Footer reference note
  ops.push('BT /F1 8.0 Tf 0.35 0.40 0.48 rg');
  ops.push(`${mmXToPt(14).toFixed(2)} ${mmYToPt(202).toFixed(2)} Td`);
  const ageGroup = sim.simulation.resolvedConfig.patientAgeGroup;
  ops.push(
    `(${pdfEscapeText(`Reference Context: Age Group = ${ageGroup} | Paper Speed = 25 mm/s (1 mm = 40 ms, 5 mm = 200 ms) | Gain = 10 mm/mV (1 mm = 0.1 mV)`)}) Tj ET`
  );

  return ops.join('\n');
}

/**
 * Builds the PDF vector content stream for an Answer Key Page (up to 6 questions per page).
 */
function buildAnswerKeyPageContentStream(
  title: string,
  casesWithIndex: Array<{ questionNumber: number; sim: SimulatedExamCaseResult }>,
  pageIndex: number,
  totalPages: number
): string {
  const ops: string[] = [];
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)} re f`);

  // Header Banner
  ops.push('0.06 0.09 0.16 rg');
  ops.push(
    `${mmXToPt(14).toFixed(2)} ${mmYToPt(28).toFixed(2)} ${(269 * MM_TO_PT).toFixed(2)} ${(16 * MM_TO_PT).toFixed(2)} re f`
  );

  ops.push('BT /F2 14 Tf 1 1 1 rg');
  ops.push(`${mmXToPt(20).toFixed(2)} ${mmYToPt(22.2).toFixed(2)} Td`);
  ops.push(
    `(${pdfEscapeText(`${title} - ECG Exam & Measurement Answer Key (Page ${pageIndex + 1}/${totalPages})`)}) Tj ET`
  );

  casesWithIndex.forEach(({ questionNumber, sim }, idx) => {
    const yTopMm = 34 + idx * 27;
    const yBotMm = yTopMm + 24.5;
    const c = sim.examCase;
    const meta = getClinicalPresetMetadata(c.presetId);
    const feat = sim.simulation.ecg.features;
    const ov = c.manualAnswerOverrides;
    const { noiseText, electrodeText } = describeExamCaseModifiers(c);

    const hrVal = ov?.heartRateBpm ?? Math.round(feat.heartRateBpm);
    const prVal = ov?.prIntervalMs ?? Math.round(feat.prIntervalMs);
    const qrsVal = ov?.qrsDurationMs ?? Math.round(feat.qrsDurationMs);
    const qtcVal = ov?.qtcMs ?? Math.round(feat.qtcBazettMs);
    const axisVal = ov?.qrsAxisDeg ?? Math.round(feat.qrsAxisDeg);

    // Card background
    ops.push(idx % 2 === 0 ? '0.97 0.98 0.99 rg' : '1 1 1 rg');
    ops.push('0.78 0.83 0.88 RG 0.8 w');
    ops.push(
      `${mmXToPt(14).toFixed(2)} ${mmYToPt(yBotMm).toFixed(2)} ${(269 * MM_TO_PT).toFixed(2)} ${(24.5 * MM_TO_PT).toFixed(2)} re B`
    );

    // Question badge
    ops.push('0.06 0.09 0.16 rg');
    ops.push(
      `${mmXToPt(14).toFixed(2)} ${mmYToPt(yBotMm).toFixed(2)} ${(24 * MM_TO_PT).toFixed(2)} ${(24.5 * MM_TO_PT).toFixed(2)} re f`
    );
    ops.push('BT /F2 12 Tf 1 1 1 rg');
    ops.push(`${mmXToPt(18).toFixed(2)} ${mmYToPt(yTopMm + 14).toFixed(2)} Td`);
    ops.push(`(Q${questionNumber}) Tj ET`);

    // Line 1: Preset ID & Diagnosis Title
    ops.push('BT /F2 10.5 Tf 0.06 0.09 0.16 rg');
    ops.push(`${mmXToPt(42).toFixed(2)} ${mmYToPt(yTopMm + 7.2).toFixed(2)} Td`);
    ops.push(
      `(${pdfEscapeText(`Diagnosis: ${meta.title} [${c.presetId}] | Mode: ${c.questionMode ?? 'DIAGNOSIS_AND_MEASUREMENT'} | Age: ${sim.simulation.resolvedConfig.patientAgeGroup} | Seed: ${c.seed}`)}) Tj ET`
    );

    // Line 2: HR, P, PR, QRS, QTc, Axis
    ops.push('BT /F1 9.2 Tf 0.12 0.16 0.23 rg');
    ops.push(`${mmXToPt(42).toFixed(2)} ${mmYToPt(yTopMm + 14.2).toFixed(2)} Td`);
    ops.push(
      `(${pdfEscapeText(`Expected Measurements: HR ${hrVal} bpm | P ${Math.round(feat.pDurationMs)}ms (${feat.perLead.II.pAmplitudeMv.toFixed(2)}mV) | PR ${prVal}ms | QRS ${qrsVal}ms | Axis ${axisVal} deg | QT ${Math.round(feat.qtIntervalMs)}ms (QTc ${qtcVal}ms)`)}) Tj ET`
    );

    // Line 3: Electrode error, Noise, Ectopics
    ops.push('BT /F1 8.8 Tf 0.20 0.25 0.33 rg');
    ops.push(`${mmXToPt(42).toFixed(2)} ${mmYToPt(yTopMm + 20.6).toFixed(2)} Td`);
    ops.push(
      `(${pdfEscapeText(`PAC: ${c.pacCount} | PVC: ${c.pvcCount} | Electrode Error: ${electrodeText} | Artifact: ${noiseText}`)}) Tj ET`
    );
  });

  return ops.join('\n');
}

/**
 * Packs an array of PDF page content streams into a valid PDF 1.4 binary Uint8Array.
 */
export function compilePdf14Document(pageStreams: string[]): Uint8Array {
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObj('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObj('');
  const fontRegularId = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  );
  const fontBoldId = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  );

  const pageObjIds: number[] = [];
  for (const stream of pageStreams) {
    const streamBytesLength = new TextEncoder().encode(stream).length;
    const contentId = addObj(
      `<< /Length ${streamBytesLength} >>\nstream\n${stream}\nendstream`
    );
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageObjIds.push(pageId);
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;

  let pdfText = '%PDF-1.4\n';
  const offsets: number[] = [];
  const encoder = new TextEncoder();

  for (let i = 0; i < objects.length; i++) {
    offsets.push(encoder.encode(pdfText).length);
    pdfText += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(pdfText).length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdfText += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(pdfText);
}

/**
 * Generates an unlimited single-page or multi-page Question Set PDF (A4 Landscape, 297x210 mm).
 * Every page is rendered in strict Exam Mode (zero answer leakage, 3x4 + 10s Lead II).
 */
export function buildExamQuestionSetPdfBytes(
  cases: ExamEcgCaseConfig[],
  showQuestionNumbers = true
): Uint8Array {
  const streams = cases.map((examCase, idx) => {
    const sim = simulateExamEcgCase(examCase);
    const qLabel = showQuestionNumbers
      ? examCase.questionLabel?.trim() || `Question ${idx + 1}`
      : undefined;
    return buildQuestionPageContentStream(sim, qLabel);
  });
  return compilePdf14Document(streams);
}

/**
 * Generates the Printable Student ECG Measurement Worksheet PDF (2 pages per case:
 * Page 1 = 12-Lead + 10s Lead II ECG Sheet, Page 2 = Blank Student Measurement Analysis Sheet).
 */
export function buildMeasurementWorksheetPdfBytes(
  cases: ExamEcgCaseConfig[],
  title = '12-Lead ECG Student Measurement Worksheet'
): Uint8Array {
  const streams: string[] = [];
  cases.forEach((examCase, idx) => {
    const sim = simulateExamEcgCase(examCase);
    const qLabel = examCase.questionLabel?.trim() || `Question ${idx + 1}`;
    streams.push(buildQuestionPageContentStream(sim, qLabel));
    streams.push(buildMeasurementWorksheetPageContentStream(sim, idx + 1, title));
  });
  return compilePdf14Document(streams);
}

/**
 * Generates the Separate Answer Key PDF (A4 Landscape, 297x210 mm) containing
 * Question #, ClinicalPresetId, Diagnosis, Expected Measurements, PAC/PVC count, Noise, Electrode Error, and Seed.
 */
export function buildExamAnswerKeyPdfBytes(
  cases: ExamEcgCaseConfig[],
  title = '12-Lead ECG Exam Question Set'
): Uint8Array {
  const simulated = cases.map((examCase, idx) => ({
    questionNumber: idx + 1,
    sim: simulateExamEcgCase(examCase),
  }));

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(simulated.length / pageSize));
  const streams: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const chunk = simulated.slice(p * pageSize, (p + 1) * pageSize);
    streams.push(buildAnswerKeyPageContentStream(title, chunk, p, totalPages));
  }

  return compilePdf14Document(streams);
}

export function triggerBrowserDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): void {
  if (typeof document === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportExamCaseToPngDownload(
  examCase: ExamEcgCaseConfig,
  questionLabel?: string,
  filename = `ecg_exam_q_${examCase.seed}.png`
): Promise<void> {
  if (typeof document === 'undefined') return;

  const sim = simulateExamEcgCase(examCase);
  const svgString = renderExamSheetSvg(sim, {
    examMode: true,
    questionLabel,
    showQuestionLabel: Boolean(questionLabel),
  });

  const widthPx = 3508;
  const heightPx = 2480;

  const svgBlob = new Blob([svgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
    );
    if (pngBlob) {
      const dlUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1500);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
