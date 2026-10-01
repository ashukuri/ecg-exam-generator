import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderExamSheetSvg, simulateExamEcgCase } from '../exam/examEcgRenderer';
import { buildExamQuestionSetPdfBytes, buildMeasurementWorksheetPdfBytes } from '../exam/examExporter';
import {
  buildExamSimulationScenario,
  createDefaultExamCase,
  EXAM_FIXED_12_LEAD_GRID,
  EXAM_LEAD_WINDOW_STARTS_MS,
  EXAM_SHEET_GEOMETRY_MM,
  getExamLeadWindow,
} from '../exam/examTypes';

const mmToPt = 72 / 25.4;

describe('Simultaneous 3x4 lead display', () => {
  it.each(EXAM_LEAD_WINDOW_STARTS_MS)('renders the exact same %s ms interval in every SVG/PDF lead panel', startMs => {
    const examCase = { ...createDefaultExamCase('PVC', 202601), leadWindowStartMs: startMs };
    const sim = simulateExamEcgCase(examCase);
    const svg = renderExamSheetSvg(sim, { examMode: true });
    const pdfBytes = buildExamQuestionSetPdfBytes([examCase]);
    const pdf = new TextDecoder().decode(pdfBytes);
    const pdfWaveforms = Array.from(pdf.matchAll(/0\.05 0\.08 0\.14 RG 0\.96 w 1 J 1 j\n([^\n]+) S/g), m => m[1]);
    expect(pdfWaveforms).toHaveLength(13); // 12 panels + continuous Lead II
    expect(pdf).toContain(`12 leads: ${getExamLeadWindow(examCase).label}`);
    const geo = EXAM_SHEET_GEOMETRY_MM;

    EXAM_FIXED_12_LEAD_GRID.forEach((row, r) => row.forEach((lead, c) => {
      const tag = svg.match(new RegExp(`<polyline[^>]*data-lead-wave="${lead}"[^>]*>`))![0];
      expect(tag).toContain(`data-t-start-ms="${startMs}"`);
      expect(tag).toContain(`data-t-end-ms="${startMs + 2500}"`);
      const actualCoords = tag.match(/points="([^"]+)"/)![1];
      const samples = sim.simulation.ecg.final[lead].filter(p => p.t >= startMs && p.t <= startMs + 2500);
      expect(samples).toHaveLength(1251);
      const yBase = geo.rowBaselinesYMm[r];
      const yTop = geo.gridYMm + r * geo.leadRowHeightMm + 0.6;
      const yBottom = geo.gridYMm + (r + 1) * geo.leadRowHeightMm - 0.6;
      const coords = samples.map(p => ({
        x: geo.leadAreaXMm + c * geo.leadColumnWidthMm + (p.t - startMs) / 1000 * 25,
        y: Math.max(yTop, Math.min(yBottom, yBase - p.v * 10)),
      }));
      expect(actualCoords).toBe(coords.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '));
      const expectedPdfPath = coords.map((p, i) => `${(p.x * mmToPt).toFixed(2)} ${((geo.pageHeightMm - p.y) * mmToPt).toFixed(2)} ${i === 0 ? 'm' : 'l'}`).join(' ');
      expect(pdfWaveforms[r * 4 + c]).toBe(expectedPdfPath);
    }));

    const rhythm = svg.match(/<polyline[^>]*data-rhythm-strip-wave="II"[^>]*>/)![0];
    expect(rhythm).toContain('data-t-start-ms="0"');
    expect(rhythm).toContain('data-t-end-ms="10000"');
    expect(rhythm.match(/points="([^"]+)"/)![1].split(' ')).toHaveLength(5001);

    // ASCII-only labels for PDF layout QA; this is an intermediate test artifact.
    if (startMs === 2500) {
      const outDir = path.resolve(__dirname, '../../diagnostics');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'synchronous-pvc.pdf'), pdfBytes);
      fs.writeFileSync(path.join(outDir, 'synchronous-pvc.svg'), svg);
    }
  });

  it('displays the same PVC instant in limb and precordial lead panels', () => {
    const examCase = createDefaultExamCase('PVC', 202601);
    const sim = simulateExamEcgCase(examCase);
    const pvc = sim.simulation.timeline.episodes.find(ep => ep.type === 'VENTRICULAR_ACTIVATION' && ep.recipeVariant === 'ECTOPIC_RV')!;
    const window = sim.leadWindow;
    expect(pvc.startTime).toBeGreaterThan(window.startMs);
    expect(pvc.endTime).toBeLessThan(window.endMs);
    const svg = renderExamSheetSvg(sim);
    const sampleTime = Math.round((pvc.startTime + pvc.duration * 0.5) / 2) * 2;
    const vertexIndex = (sampleTime - window.startMs) / 2;
    EXAM_FIXED_12_LEAD_GRID.forEach(row => row.forEach((lead, c) => {
      const tag = svg.match(new RegExp(`<polyline[^>]*data-lead-wave="${lead}"[^>]*>`))![0];
      const vertex = tag.match(/points="([^"]+)"/)![1].split(' ')[vertexIndex];
      const xWithinPanel = Number(vertex.split(',')[0]) - EXAM_SHEET_GEOMETRY_MM.leadAreaXMm - c * 62.5;
      expect(xWithinPanel).toBeCloseTo((sampleTime - window.startMs) / 1000 * 25, 3);
    }));
  });

  it('preserves the recording and rhythm strip when the display window changes', () => {
    const first = { ...createDefaultExamCase('PVC', 202601), leadWindowStartMs: 0 as const };
    const last = { ...first, leadWindowStartMs: 7500 as const };
    expect(buildExamSimulationScenario(first)).toEqual(buildExamSimulationScenario(last));
    const firstSim = simulateExamEcgCase(first);
    const lastSim = simulateExamEcgCase(last);
    expect(firstSim.simulation.ecg.final).toEqual(lastSim.simulation.ecg.final);
    const rhythmPath = (svg: string) => svg.match(/<polyline[^>]*data-rhythm-strip-wave="II"[^>]*>/)![0];
    expect(rhythmPath(renderExamSheetSvg(firstSim))).toBe(rhythmPath(renderExamSheetSvg(lastSim)));
  });

  it('round-trips the selected window in JSON and applies it to worksheet PDF exports', () => {
    const restored = JSON.parse(JSON.stringify({ ...createDefaultExamCase('NORMAL_SINUS'), leadWindowStartMs: 5000 }));
    expect(getExamLeadWindow(restored)).toEqual({ startMs: 5000, endMs: 7500, label: '5.0-7.5 s' });
    const worksheet = new TextDecoder().decode(buildMeasurementWorksheetPdfBytes([restored]));
    expect(worksheet).toContain('12 leads: 5.0-7.5 s');
    const legacy = createDefaultExamCase();
    delete legacy.leadWindowStartMs;
    expect(getExamLeadWindow(legacy).startMs).toBe(0);
    expect(getExamLeadWindow({ ...legacy, leadWindowStartMs: 9000 as never }).startMs).toBe(0);
  });

  it('automatically selects the earliest PAC/PVC window and honors a manual choice', () => {
    for (const presetId of ['PAC', 'PVC'] as const) {
      const examCase = createDefaultExamCase(presetId, 202601);
      const sim = simulateExamEcgCase(JSON.parse(JSON.stringify(examCase)));
      const firstEctopic = sim.simulation.timeline.events.find(e =>
        e.type === 'ATRIAL_ECTOPIC_IMPULSE' || e.type === 'VENTRICULAR_ECTOPIC_IMPULSE')!;
      expect(firstEctopic.timestamp).toBeGreaterThanOrEqual(sim.leadWindow.startMs);
      expect(firstEctopic.timestamp).toBeLessThan(sim.leadWindow.endMs);
      expect(simulateExamEcgCase({ ...examCase, leadWindowStartMs: 0 }).leadWindow.startMs).toBe(0);
    }
    expect(simulateExamEcgCase(createDefaultExamCase()).leadWindow.startMs).toBe(0);
  });
});
