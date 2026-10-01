import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateECG } from '../ecg-engine';
import { renderExamSheetSvg, simulateExamEcgCase } from '../exam/examEcgRenderer';
import { buildExamQuestionSetPdfBytes } from '../exam/examExporter';
import { buildExamSimulationScenario, createDefaultExamCase } from '../exam/examTypes';

const seeds = [202601, 42, 173, 1, 2, 3];

describe('Arrhythmia presentation in the fixed 2.5-second panels', () => {
  it.each(['PAC', 'PVC'] as const)('includes the default single %s and preserves the requested count', presetId => {
    for (const seed of seeds.slice(0, 3)) {
      for (const heartRateBpm of [30, 72, 120]) {
        const examCase = { ...createDefaultExamCase(presetId, seed), useCustomHeartRate: true, heartRateBpm };
        const result = simulateExamEcgCase(examCase);
        const sourceId = presetId === 'PAC' ? 'EXAM_PAC' : 'EXAM_PVC';
        const impulse = result.simulation.timeline.events.find(e => 'sourceId' in e && e.sourceId === sourceId)!;
        const qrs = result.simulation.timeline.episodes.find(e => e.type === 'VENTRICULAR_ACTIVATION' && e.sourceEventId === impulse.id)!;
        expect(qrs.startTime).toBeGreaterThan(0);
        expect(qrs.endTime).toBeLessThan(2500);
        expect(result.measuredPacCount).toBe(presetId === 'PAC' ? 1 : 0);
        expect(result.measuredPvcCount).toBe(presetId === 'PVC' ? 1 : 0);
        expect(result.simulation.validation.errorCount).toBe(0);
      }
    }
  });

  it.each([[2, 0], [0, 2], [4, 0], [0, 4], [2, 2]])('retains %s PACs and %s PVCs over the recording', (pacCount, pvcCount) => {
    const result = simulateExamEcgCase({ ...createDefaultExamCase(), pacCount, pvcCount });
    expect(result.measuredPacCount).toBe(pacCount);
    expect(result.measuredPvcCount).toBe(pvcCount);
    expect(result.simulation.validation.errorCount).toBe(0);
  });

  it.each(seeds)('produces strongly variable AF intervals without sinus P waves (seed %s)', seed => {
    const result = simulateExamEcgCase(createDefaultExamCase('ATRIAL_FIBRILLATION', seed)).simulation;
    expect(result.ecg.features.qtMetrics.rrCoefficientOfVariation).toBeGreaterThan(0.2);
    expect(result.timeline.episodes.some(e => e.type === 'ATRIAL_ACTIVATION')).toBe(false);
    expect(result.timeline.episodes.some(e => e.type === 'FIBRILLATORY_BACKGROUND')).toBe(true);
    expect(result.validation.errorCount).toBe(0);
  });

  it('shows clear AF interval differences in the default 2.5-second display', () => {
    const examCase = createDefaultExamCase('ATRIAL_FIBRILLATION');
    const result = simulateExamEcgCase(examCase).simulation;
    const beats = result.timeline.episodes.filter(e => e.type === 'VENTRICULAR_ACTIVATION' && e.endTime < 2500).map(e => e.startTime);
    const intervals = beats.slice(1).map((time, i) => time - beats[i]);
    expect(intervals.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...intervals) - Math.min(...intervals)).toBeGreaterThan(250);
    expect(simulateExamEcgCase(examCase).simulation.ecg.final).toEqual(result.ecg.final);
  });

  it('keeps AF beat timing independent of the requested recording duration', () => {
    const scenario = buildExamSimulationScenario(createDefaultExamCase('ATRIAL_FIBRILLATION'));
    const full = simulateECG(scenario);
    const short = simulateECG({ ...scenario, durationMs: 2500 });
    const beatTimes = (sim: typeof full) => sim.timeline.episodes.filter(e => e.type === 'VENTRICULAR_ACTIVATION' && e.endTime <= 2500).map(e => e.startTime);
    expect(beatTimes(short)).toEqual(beatTimes(full));
  });

  it('exports default PAC, PVC and AF examples for layout inspection', () => {
    const outDir = path.resolve(__dirname, '../../diagnostics');
    fs.mkdirSync(outDir, { recursive: true });
    for (const presetId of ['PAC', 'PVC', 'ATRIAL_FIBRILLATION'] as const) {
      const examCase = createDefaultExamCase(presetId);
      const sim = simulateExamEcgCase(examCase);
      fs.writeFileSync(path.join(outDir, `rhythm-${presetId}.svg`), renderExamSheetSvg(sim));
      fs.writeFileSync(path.join(outDir, `rhythm-${presetId}.pdf`), buildExamQuestionSetPdfBytes([examCase]));
    }
  });
});
