/**
 * Pure TypeScript Fixed-Scale 12-Lead ECG SVG Exporter
 *
 * Generates self-contained, clinical-standard SVG files at strictly fixed:
 *   - Paper speed: 25 mm/s (1 mm = 40 ms)
 *   - Voltage gain: 10 mm/mV (10 mm = 1.0 mV)
 *   - NO auto-gain or per-lead vertical normalization
 *
 * Used for golden waveform visual inspection and development diagnostics
 * (`diagnostics/waveforms/<PRESET_ID>.svg`).
 */

import { LeadName } from '../core/types';
import { CLINICAL_PRESETS } from '../presets/clinicalPresets';
import { SimulationResult } from '../simulation/simulateECG';

const MM_TO_PX = 3.6;
const PX_PER_MS = (25 / 1000) * MM_TO_PX; // 0.09 px/ms
const PX_PER_MV = 10 * MM_TO_PX; // 36 px/mV

const COLUMNS: [LeadName, LeadName, LeadName, LeadName][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvgPath(
  points: { t: number; v: number }[],
  tStartMs: number,
  tEndMs: number,
  xOffsetPx: number,
  yBaselinePx: number
): string {
  const parts: string[] = [];
  for (const pt of points) {
    if (pt.t < tStartMs || pt.t > tEndMs) continue;
    const x = xOffsetPx + (pt.t - tStartMs) * PX_PER_MS;
    const y = yBaselinePx - pt.v * PX_PER_MV;
    parts.push(
      `${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    );
  }
  return parts.join(' ');
}

function buildCalibrationPulsePath(xStartPx: number, yBaselinePx: number): string {
  const w1Mm = 1 * MM_TO_PX;
  const wPulse = 5 * MM_TO_PX;
  const h1Mv = 1 * PX_PER_MV;
  return [
    `M ${xStartPx.toFixed(1)},${yBaselinePx.toFixed(1)}`,
    `L ${(xStartPx + w1Mm).toFixed(1)},${yBaselinePx.toFixed(1)}`,
    `L ${(xStartPx + w1Mm).toFixed(1)},${(yBaselinePx - h1Mv).toFixed(1)}`,
    `L ${(xStartPx + w1Mm + wPulse).toFixed(1)},${(yBaselinePx - h1Mv).toFixed(1)}`,
    `L ${(xStartPx + w1Mm + wPulse).toFixed(1)},${yBaselinePx.toFixed(1)}`,
    `L ${(xStartPx + 2 * w1Mm + wPulse).toFixed(1)},${yBaselinePx.toFixed(1)}`,
  ].join(' ');
}

export function renderTwelveLeadSvgString(result: SimulationResult): string {
  const preset =
    CLINICAL_PRESETS[result.scenario.presetId] ?? CLINICAL_PRESETS.NORMAL_SINUS;
  const f = result.ecg.features;
  const signals = result.ecg.final;

  const totalWidthMm = 260;
  const totalHeightMm = 175;
  const svgWidth = totalWidthMm * MM_TO_PX;
  const svgHeight = totalHeightMm * MM_TO_PX;
  const leftMarginPx = 10 * MM_TO_PX;
  const colDurationMs = 2500;
  const colWidthPx = colDurationMs * PX_PER_MS;

  const rowBaselinesMm = [42, 84, 126];
  const rhythmBaselineMm = 158;

  const paths: string[] = [];

  // 4x3 standard columns (2.5s per column)
  rowBaselinesMm.forEach((baseMm, rowIdx) => {
    const yBasePx = baseMm * MM_TO_PX;
    const rowLeads = COLUMNS[rowIdx]!;
    const calPath = buildCalibrationPulsePath(2 * MM_TO_PX, yBasePx);
    paths.push(
      `<path d="${calPath}" fill="none" stroke="#334155" stroke-width="1.2" />`
    );

    rowLeads.forEach((leadName, colIdx) => {
      const tStart = colIdx * colDurationMs;
      const tEnd = (colIdx + 1) * colDurationMs;
      const xStart = leftMarginPx + colIdx * colWidthPx;
      const traceD = buildSvgPath(
        signals[leadName],
        tStart,
        tEnd,
        xStart,
        yBasePx
      );
      paths.push(
        `<line x1="${xStart.toFixed(1)}" y1="${(yBasePx - 12 * MM_TO_PX).toFixed(1)}" x2="${xStart.toFixed(1)}" y2="${(yBasePx + 12 * MM_TO_PX).toFixed(1)}" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="2 2" />`
      );
      paths.push(
        `<text x="${(xStart + 4).toFixed(1)}" y="${(yBasePx - 9 * MM_TO_PX).toFixed(1)}" font-size="11" font-weight="700" font-family="monospace" fill="#0f172a">${leadName}</text>`
      );
      paths.push(
        `<path d="${traceD}" fill="none" stroke="#0f172a" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" />`
      );
    });
  });

  // 10-second continuous Lead II rhythm strip at bottom
  const rhythmY = rhythmBaselineMm * MM_TO_PX;
  const rhythmCal = buildCalibrationPulsePath(2 * MM_TO_PX, rhythmY);
  const rhythmTrace = buildSvgPath(
    signals.II,
    0,
    Math.min(10000, result.scenario.durationMs),
    leftMarginPx,
    rhythmY
  );
  paths.push(
    `<path d="${rhythmCal}" fill="none" stroke="#334155" stroke-width="1.2" />`
  );
  paths.push(
    `<text x="${(leftMarginPx + 4).toFixed(1)}" y="${(rhythmY - 9 * MM_TO_PX).toFixed(1)}" font-size="11" font-weight="700" font-family="monospace" fill="#0f172a">II (Rhythm Strip)</text>`
  );
  paths.push(
    `<path d="${rhythmTrace}" fill="none" stroke="#0f172a" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round" />`
  );

  // Header metadata
  const headerTitle = `${preset.id} [${preset.status}] — ${preset.name}`;
  const quInfo = f.uWaveMetrics.uWavePresent
    ? ` | QU: ${f.uWaveMetrics.measuredQuMs}ms (U=${f.uWaveMetrics.uAmplitudeMv}mV, T/U=${f.uWaveMetrics.tuAmplitudeRatio})`
    : '';
  const headerMetrics = `25 mm/s | 10 mm/mV (Fixed Scale, No Auto-Gain) | HR: ${f.heartRateBpm} bpm | P: ${f.pDurationMs}ms | PR: ${f.prIntervalMs}ms | QRS: ${f.qrsDurationMs}ms (${f.qrsAxisDeg} deg) | QT: ${f.qtIntervalMs}ms / QTcF: ${f.qtcFridericiaMs}ms${quInfo} | Trans: ${f.transitionZone}`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`,
    `  <defs>`,
    `    <pattern id="minorGrid" width="${MM_TO_PX}" height="${MM_TO_PX}" patternUnits="userSpaceOnUse">`,
    `      <path d="M ${MM_TO_PX} 0 L 0 0 0 ${MM_TO_PX}" fill="none" stroke="#fecdd3" stroke-width="0.45" />`,
    `    </pattern>`,
    `    <pattern id="majorGrid" width="${5 * MM_TO_PX}" height="${5 * MM_TO_PX}" patternUnits="userSpaceOnUse">`,
    `      <rect width="${5 * MM_TO_PX}" height="${5 * MM_TO_PX}" fill="url(#minorGrid)" />`,
    `      <path d="M ${5 * MM_TO_PX} 0 L 0 0 0 ${5 * MM_TO_PX}" fill="none" stroke="#fda4af" stroke-width="0.9" />`,
    `    </pattern>`,
    `  </defs>`,
    `  <rect width="100%" height="100%" fill="#fffafb" />`,
    `  <rect width="100%" height="100%" fill="url(#majorGrid)" />`,
    `  <rect x="0" y="0" width="${svgWidth}" height="24" fill="#0f172a" opacity="0.92" />`,
    `  <text x="10" y="15" font-size="10.5" font-weight="700" font-family="monospace" fill="#f8fafc">${escapeXml(headerTitle)}</text>`,
    `  <text x="${svgWidth - 10}" y="15" text-anchor="end" font-size="9.5" font-family="monospace" fill="#cbd5e1">${escapeXml(headerMetrics)}</text>`,
    ...paths.map((p) => `  ${p}`),
    `</svg>`,
  ].join('\n');
}
