/**
 * CLI Calibration & Verification Report Runner
 */

import {
  CANONICAL_LEAD_FIELD_V1,
  createDefaultScenario,
  evaluateLeadFieldRegularization,
  runStage1BasisProbes,
  simulateECG,
} from '../index';

export function generateCalibrationReportText(): string {
  const probes = runStage1BasisProbes(CANONICAL_LEAD_FIELD_V1);
  const reg = evaluateLeadFieldRegularization(CANONICAL_LEAD_FIELD_V1);
  const canonicalSim = simulateECG(createDefaultScenario('NORMAL_SINUS'));
  const f = canonicalSim.ecg.features;

  const lines: string[] = [
    `=== Lead-Field Calibration Report (${CANONICAL_LEAD_FIELD_V1.version}) ===`,
    `Disclaimer: ${CANONICAL_LEAD_FIELD_V1.disclaimer}`,
    '',
    '1. Stage 1 Basis Probes (I, II, aVR, V1, V3, V6 in mV):',
  ];

  for (const p of probes) {
    lines.push(
      `  - ${p.probe.padEnd(18)}: I=${p.leads.I.toFixed(3)}, II=${p.leads.II.toFixed(3)}, aVR=${p.leads.aVR.toFixed(3)}, V1=${p.leads.V1.toFixed(3)}, V3=${p.leads.V3.toFixed(3)}, V6=${p.leads.V6.toFixed(3)}`
    );
  }

  lines.push(
    '',
    '2. Stage 2 Regularization Penalties:',
    `  - Precordial V1->V6 Smoothness Penalty : ${reg.precordialSmoothnessPenalty.toFixed(4)}`,
    `  - Regional Sparsity Penalty (L1)       : ${reg.regionalSparsityPenalty.toFixed(4)}`,
    `  - Limb Regional Leakage Penalty (L2)   : ${reg.limbRegionalLeakagePenalty.toFixed(6)}`,
    `  - Parameter Magnitude Penalty (L2)     : ${reg.parameterMagnitudePenalty.toFixed(4)}`,
    `  - Total Regularization Loss            : ${reg.totalRegularizationLoss.toFixed(4)}`,
    '',
    '3. Stage 2 Canonical Normal Adult v1 Fit Summary:',
    `  - HR: ${f.heartRateBpm} bpm | PR: ${f.prIntervalMs} ms | QRS: ${f.qrsDurationMs} ms (${f.qrsAxisDeg} deg) | QT: ${f.qtIntervalMs} ms`,
    `  - Precordial R Progression (mV): V1=${f.precordialRProgression.V1}, V2=${f.precordialRProgression.V2}, V3=${f.precordialRProgression.V3}, V4=${f.precordialRProgression.V4}, V5=${f.precordialRProgression.V5}, V6=${f.precordialRProgression.V6}`,
    `  - Precordial R/S Ratios        : V1=${f.perLead.V1.rsRatio}, V2=${f.perLead.V2.rsRatio}, V3=${f.perLead.V3.rsRatio}, V4=${f.perLead.V4.rsRatio}, V5=${f.perLead.V5.rsRatio}, V6=${f.perLead.V6.rsRatio}`,
    `  - Transition Zone              : ${f.transitionZone}`,
  );

  return lines.join('\n');
}
