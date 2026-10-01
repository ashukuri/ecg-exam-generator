import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderExamSheetSvg, simulateExamEcgCase } from '../exam/examEcgRenderer';
import { buildExamQuestionSetPdfBytes, buildMeasurementWorksheetPdfBytes } from '../exam/examExporter';
import {
  buildExamSimulationScenario,
  createDefaultExamCase,
  EXAM_FIXED_12_LEAD_GRID,
  EXAM_SHEET_GEOMETRY_MM,
} from '../exam/examTypes';

const mmToPt = 72 / 25.4;

describe('Simultaneous 3x4 lead display', () => {
  it('renders the same fixed 2.5 seconds in all SVG/PDF panels and the full 10 seconds below', () => {
    const startMs = 0;
    const examCase = createDefaultExamCase('PVC', 202601);
    const sim = simulateExamEcgCase(examCase);
    const svg = renderExamSheetSvg(sim, { examMode: true });
    const pdfBytes = buildExamQuestionSetPdfBytes([examCase]);
    const pdf = new TextDecoder().decode(pdfBytes);
    const pdfWaveforms = Array.from(pdf.matchAll(/0\.05 0\.08 0\.14 RG 0\.96 w 1 J 1 j\n([^\n]+) S/g), m => m[1]);
    expect(pdfWaveforms).toHaveLength(13); // 12 panels + continuous Lead II
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

    const rhythmSamples = sim.simulation.ecg.final.II.filter(p => p.t >= 0 && p.t <= 10000);
    const rhythmCoords = rhythmSamples.map(p => ({
      x: geo.leadAreaXMm + p.t / 1000 * 25,
      y: Math.max(geo.gridYMm + 3 * geo.leadRowHeightMm + 0.6,
        Math.min(geo.gridYMm + 4 * geo.leadRowHeightMm - 0.6, geo.rowBaselinesYMm[3] - p.v * 10)),
    }));
    expect(rhythm.match(/points="([^"]+)"/)![1]).toBe(rhythmCoords.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '));
    expect(pdfWaveforms[12]).toBe(rhythmCoords.map((p, i) => `${(p.x * mmToPt).toFixed(2)} ${((geo.pageHeightMm - p.y) * mmToPt).toFixed(2)} ${i === 0 ? 'm' : 'l'}`).join(' '));
    const worksheet = new TextDecoder().decode(buildMeasurementWorksheetPdfBytes([examCase]));
    const worksheetWaveforms = Array.from(worksheet.matchAll(/0\.05 0\.08 0\.14 RG 0\.96 w 1 J 1 j\n([^\n]+) S/g), m => m[1]);
    expect(worksheetWaveforms).toEqual(pdfWaveforms);

    // Intermediate layout QA artifacts; labels are ASCII-only.
    const outDir = path.resolve(__dirname, '../../diagnostics');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'synchronous-pvc.pdf'), pdfBytes);
    fs.writeFileSync(path.join(outDir, 'synchronous-pvc.svg'), svg);
  });

  it.each(['RV', 'LV'] as const)('displays a %s PVC at the same instant in all 12 panels', pvcOrigin => {
    const examCase = { ...createDefaultExamCase('PVC', 202601), pvcOrigin };
    const sim = simulateExamEcgCase(examCase);
    const pvc = sim.simulation.timeline.episodes.find(ep => ep.type === 'VENTRICULAR_ACTIVATION' && ep.recipeVariant === `ECTOPIC_${pvcOrigin}`)!;
    const window = { startMs: 0, endMs: 2500 };
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

  it.each([0, 2500, 5000, 7500])('ignores a formerly saved %s ms display choice', leadWindowStartMs => {
    const examCase = createDefaultExamCase('PVC', 202601);
    const restored = JSON.parse(JSON.stringify({ ...examCase, leadWindowStartMs }));
    expect(buildExamSimulationScenario(restored)).toEqual(buildExamSimulationScenario(examCase));
    const original = simulateExamEcgCase(examCase);
    const legacy = simulateExamEcgCase(restored);
    expect(legacy.simulation.ecg.final).toEqual(original.simulation.ecg.final);
    expect(renderExamSheetSvg(legacy)).toBe(renderExamSheetSvg(original));
    expect(buildExamQuestionSetPdfBytes([restored])).toEqual(buildExamQuestionSetPdfBytes([examCase]));
  });
});
