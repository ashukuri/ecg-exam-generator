import { describe, expect, it } from 'vitest';
import { createDefaultScenario, LEAD_NAMES, simulateECG } from '../ecg-engine';
import { ClinicalPresetId, PvcOrigin } from '../ecg-engine/scenario/types';
import { ECGPoint } from '../ecg-engine/core/types';
import { simulateExamEcgCase, renderExamSheetSvg } from '../exam/examEcgRenderer';
import { createDefaultExamCase, ExamEcgCaseConfig, ExamQuestionSet } from '../exam/examTypes';

function dominantDeflection(signal: ECGPoint[], start: number, end: number): number {
  const values = signal.filter(p => p.t > start && p.t < end).map(p => p.v);
  const positive = Math.max(...values);
  const negative = Math.min(...values);
  return Math.abs(positive) > Math.abs(negative) ? positive : negative;
}

function makeCase(origin: PvcOrigin, presetId: ClinicalPresetId = 'PVC', seed = 202601): ExamEcgCaseConfig {
  return { ...createDefaultExamCase(presetId, seed), pvcCount: 2, pvcOrigin: origin };
}

describe('PVC ventricular origin', () => {
  it.each(['RV', 'LV'] as const)('%s produces distinct wide QRS and discordant T in V1/V6', (origin) => {
    const result = simulateExamEcgCase(makeCase(origin));
    const sim = result.simulation;
    const variant = origin === 'RV' ? 'ECTOPIC_RV' : 'ECTOPIC_LV';
    const qrsEpisodes = sim.timeline.episodes.filter(ep =>
      ep.type === 'VENTRICULAR_ACTIVATION' && ep.recipeVariant === variant);
    expect(qrsEpisodes).toHaveLength(2);
    expect(result.measuredPvcCount).toBe(2);
    expect(sim.validation.errorCount).toBe(0);
    for (const qrs of qrsEpisodes) {
      expect(qrs.duration).toBeGreaterThanOrEqual(120);
      const repol = sim.timeline.episodes.find(ep =>
        ep.type === 'VENTRICULAR_REPOLARIZATION' && ep.sourceEventId === qrs.sourceEventId)!;
      for (const lead of ['V1', 'V6'] as const) {
        const qrsValue = dominantDeflection(sim.ecg.clean[lead], qrs.startTime, qrs.endTime);
        const tValue = dominantDeflection(sim.ecg.clean[lead], repol.startTime + repol.duration * 0.25, repol.endTime);
        const expectedSign = (origin === 'RV' ? -1 : 1) * (lead === 'V1' ? 1 : -1);
        expect(Math.sign(qrsValue)).toBe(expectedSign);
        expect(Math.abs(qrsValue)).toBeGreaterThan(0.4);
        expect(Math.sign(tValue)).toBe(-expectedSign);
      }
    }
    for (const lead of LEAD_NAMES) {
      expect(sim.ecg.clean[lead].every(p => Number.isFinite(p.v))).toBe(true);
    }
  });

  it.each([202601, 42, 173])('preserves timing, compensatory pauses and non-PVC signals (seed %s)', seed => {
    const rv = simulateExamEcgCase(makeCase('RV', 'NORMAL_SINUS', seed)).simulation;
    const lv = simulateExamEcgCase(makeCase('LV', 'NORMAL_SINUS', seed)).simulation;
    expect(lv.annotations).toEqual(rv.annotations);
    expect(lv.timeline.events.map(({ timestamp, type }) => ({ timestamp, type })))
      .toEqual(rv.timeline.events.map(({ timestamp, type }) => ({ timestamp, type })));
    const pvcWindows = lv.timeline.episodes.filter(ep =>
      (ep.type === 'VENTRICULAR_ACTIVATION' || ep.type === 'VENTRICULAR_REPOLARIZATION') && ep.recipeVariant === 'ECTOPIC_LV');
    for (const lead of LEAD_NAMES) {
      const unchangedSamples = lv.ecg.clean[lead].filter(p =>
        !pvcWindows.some(ep => p.t >= ep.startTime && p.t <= ep.endTime));
      const rvByTime = new Map(rv.ecg.clean[lead].map(p => [p.t, p.v]));
      expect(unchangedSamples.every(p => p.v === rvByTime.get(p.t))).toBe(true);
    }
  });

  it('reads legacy JSON without an origin as RV with identical signals', () => {
    const legacy = makeCase('RV');
    delete legacy.pvcOrigin;
    const restored = JSON.parse(JSON.stringify({ version: '2.0.0', title: 'Legacy', createdAt: '', questions: [legacy] })) as ExamQuestionSet;
    const oldResult = simulateExamEcgCase(restored.questions[0]);
    const explicitRv = simulateExamEcgCase({ ...legacy, pvcOrigin: 'RV' });
    expect(oldResult.simulation.ecg.clean).toEqual(explicitRv.simulation.ecg.clean);
    expect(oldResult.simulation.resolvedConfig.pvcOrigin).toBe('RV');
  });

  it('round-trips LV through question-set JSON and hides the origin on exam sheets', () => {
    const examCase = makeCase('LV');
    const restored = JSON.parse(JSON.stringify({ version: '2.0.0', title: 'LV', createdAt: '', questions: [examCase] })) as ExamQuestionSet;
    const sim = simulateExamEcgCase(restored.questions[0]);
    expect(restored.questions[0].pvcOrigin).toBe('LV');
    expect(sim.simulation.ecg.clean).toEqual(simulateExamEcgCase(examCase).simulation.ecg.clean);
    const sheet = renderExamSheetSvg(sim, { examMode: true });
    expect(sheet).not.toContain('ECTOPIC_LV');
    expect(sheet).not.toContain('左室起源');
  });

  it('supports the engine PVC source without an explicit count', () => {
    const scenario = createDefaultScenario('PVC');
    scenario.overrides = { pvcOrigin: 'LV' };
    const sim = simulateECG(scenario);
    expect(sim.timeline.episodes.some(ep => ep.type === 'VENTRICULAR_ACTIVATION' && ep.recipeVariant === 'ECTOPIC_LV')).toBe(true);
    expect(sim.validation.errorCount).toBe(0);
  });

  it('does not change PAC or pacing morphology when no PVC is requested', () => {
    for (const presetId of ['PAC', 'PACEMAKER_VVI', 'PACEMAKER_DDD'] as const) {
      const rvCase = { ...createDefaultExamCase(presetId), pvcOrigin: 'RV' as const };
      const lvCase = { ...rvCase, pvcOrigin: 'LV' as const };
      expect(simulateExamEcgCase(lvCase).simulation.ecg.clean)
        .toEqual(simulateExamEcgCase(rvCase).simulation.ecg.clean);
    }
  });
});
