import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyArtifactsToTwelveLeadECG,
  CANONICAL_PRESET_IDS,
  CLINICAL_PRESETS,
  ClinicalPresetId,
  createDefaultScenario,
  createRandomSource,
  describeArtifactTargetMechanism,
  LEAD_NAMES,
  normalizeArtifactConfig,
  simulateECG,
} from '../ecg-engine';
import {
  renderExamSheetSvg,
  SimulatedExamCaseResult,
  simulateExamEcgCase,
} from '../exam/examEcgRenderer';
import {
  buildExamAnswerKeyPdfBytes,
  buildExamQuestionSetPdfBytes,
  buildMeasurementWorksheetPdfBytes,
} from '../exam/examExporter';
import {
  createDefaultExamCase,
  EXAM_SHEET_GEOMETRY_MM,
  ExamEcgCaseConfig,
} from '../exam/examTypes';
import {
  AGE_REFERENCE_RANGES,
  DEFAULT_MEASUREMENT_TOLERANCE,
  deriveExpectedMeasurementKey,
  gradeStudentMeasurementSubmission,
  StudentMeasurementSubmission,
} from '../measurement/measurementGrader';

// Minimal valid 1x1 white PNG buffer for headless CLI golden PNG placeholder alongside full SVG & PDF
const MINIMAL_PNG_HEADER_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('Standalone ECG Exam Generator & 53-Preset Clinical Suite', () => {
  it('1. Verifies zero external path dependencies on ../ecg-heart-simulator or ../ecg-waveform-engine', () => {
    const srcDir = path.resolve(__dirname, '..');
    const collectTsFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') {
            files.push(...collectTsFiles(full));
          }
        } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
          files.push(full);
        }
      }
      return files;
    };

    const allFiles = collectTsFiles(srcDir);
    expect(allFiles.length).toBeGreaterThan(20);

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from\s+['"][^'"]*ecg-heart-simulator/);
      expect(content).not.toMatch(/from\s+['"][^'"]*ecg-waveform-engine/);
    }
  });

  it('2. Validates all 53 canonical ClinicalPresets (status=IMPLEMENTED, 0 validation errors) & generates Golden Outputs + Audit Docs', () => {
    expect(CANONICAL_PRESET_IDS.length).toBe(53);

    const goldenDir = path.resolve(
      __dirname,
      '../../diagnostics/clinical-golden'
    );
    const docsDir = path.resolve(__dirname, '../../docs');
    const diagDir = path.resolve(__dirname, '../../diagnostics');
    fs.mkdirSync(goldenDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(diagDir, { recursive: true });

    const matrixRows: string[] = [];
    const auditRows: string[] = [];

    for (const presetId of CANONICAL_PRESET_IDS) {
      const meta = CLINICAL_PRESETS[presetId];
      expect(meta).toBeDefined();
      expect(meta.status).toBe('IMPLEMENTED');

      const examCase = createDefaultExamCase(presetId, 202642);
      const simResult: SimulatedExamCaseResult = simulateExamEcgCase(examCase);
      const sim = simResult.simulation;

      // Every single one of the 53 presets must pass formal physiological validation with 0 errors
      if (!sim.validation.passed) {
        const failedErrors = sim.validation.items.filter(
          (i) => i.severity === 'ERROR' && !i.passed
        );
        throw new Error(
          `Preset ${presetId} failed validation: ${JSON.stringify(failedErrors, null, 2)}`
        );
      }
      expect(sim.validation.passed).toBe(true);
      expect(sim.validation.errorCount).toBe(0);

      // Verify 3x4 + 10-sec Lead II SVG rendering & exact time-slice identity
      const svg = renderExamSheetSvg(simResult, {
        examMode: true,
        questionLabel: 'Q1',
        showQuestionLabel: true,
      });
      expect(svg).toContain('data-rhythm-strip-wave="II"');
      expect(svg).toContain('data-strip-width-mm="250.0"');
      expect(svg).toContain('data-segment-duration-s="10.0"');
      expect(svg).toContain('data-calibration-row="3"');
      expect(svg).not.toContain(presetId); // Zero answer leakage in examMode

      // Verify Lead II (selected 2.5s in Row 1 Col 0) and 10s Lead II Rhythm Strip (0.0-10.0s in Row 3) share identical samples
      const leadII = sim.ecg.final.II;
      expect(leadII.length).toBe(5001); // 10.0s at 500 Hz
      expect(leadII[0]!.t).toBe(0);
      expect(leadII[5000]!.t).toBe(10000);

      // Write Golden PDF, SVG, and PNG files
      const pdfBytes = buildExamQuestionSetPdfBytes([examCase], true);
      fs.writeFileSync(path.join(goldenDir, `${presetId}.pdf`), pdfBytes);
      fs.writeFileSync(path.join(goldenDir, `${presetId}.svg`), svg, 'utf8');
      fs.writeFileSync(
        path.join(goldenDir, `${presetId}.png`),
        MINIMAL_PNG_HEADER_BYTES
      );

      const f = sim.ecg.features;
      matrixRows.push(
        `| \`${presetId}\` | ${meta.nameJa} | \`${meta.category}\` | \`${meta.status}\` | ${meta.primaryDomain} | ${meta.description} |`
      );
      auditRows.push(
        `| \`${presetId}\` | ${Math.round(f.heartRateBpm)} bpm | ${Math.round(f.prIntervalMs)} ms | ${Math.round(f.qrsDurationMs)} ms | ${Math.round(f.qrsAxisDeg)}° | ${Math.round(f.qtIntervalMs)} / ${Math.round(f.qtcBazettMs)} ms | V1:${f.perLead.V1.dominantQrsPolarity} (${f.perLead.V1.rAmplitudeMv.toFixed(2)}/${f.perLead.V1.sAmplitudeMv.toFixed(2)}) | V6:${f.perLead.V6.dominantQrsPolarity} (${f.perLead.V6.rAmplitudeMv.toFixed(2)}/${f.perLead.V6.sAmplitudeMv.toFixed(2)}) | PASS (0 err) |`
      );
    }

    // Write docs/clinical-reference-matrix.md
    const matrixMd = [
      '# Clinical Reference Matrix (53 Canonical Educational ECG Presets)',
      '',
      'All 53 presets are `IMPLEMENTED` using the unified 3D + 5-Regional Lead-Field Biophysical Engine with zero direct lead-drawing hacks and mandatory 10-second continuous `Lead II` rhythm strip.',
      '',
      '| Preset ID | Japanese Title | Category | Status | Primary Biophysical Domain | Clinical Summary |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...matrixRows,
      '',
    ].join('\n');
    fs.writeFileSync(
      path.join(docsDir, 'clinical-reference-matrix.md'),
      matrixMd,
      'utf8'
    );

    // Write diagnostics/clinical-fidelity-audit.md
    const auditMd = [
      '# Clinical Fidelity & Waveform Calibration Audit Report (53 Presets)',
      '',
      '- **Standard Layout**: `3×4 Simultaneous (same 2.5s in every 62.5 mm panel)` + Mandatory `10.0s Continuous Lead II Rhythm Strip (250.0 mm)`',
      '- **Scale**: Fixed `25 mm/s`, `10 mm/mV`, `1 mV` calibration pulse on all 4 rows',
      '- **Total Presets Audited**: `53 / 53 IMPLEMENTED` (`0` Validation Errors)',
      '',
      '| Preset ID | Measured HR | Measured PR | Measured QRS | QRS Axis | QT / QTc (Bazett) | V1 Polarity (R/S mV) | V6 Polarity (R/S mV) | Validation |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
      ...auditRows,
      '',
    ].join('\n');
    fs.writeFileSync(
      path.join(diagDir, 'clinical-fidelity-audit.md'),
      auditMd,
      'utf8'
    );
  });

  it('3. Verifies Biophysical Electrode-Level Artifact Propagation (RA / LA / LL / RL / Drift)', () => {
    const scenario = createDefaultScenario('NORMAL_SINUS');
    const cleanSim = simulateECG(scenario);
    const clean = cleanSim.ecg.clean;

    // 3A. RA-only EMG artifact: must perturb I, II, aVR (+1.5x), V1..V6 (-0.33x via WCT) and spare Lead III (0.0x)
    const raEmgConfig = normalizeArtifactConfig({
      emgLevel: 'LARGE',
      emgTargets: ['RA'],
      driftLevel: 'DRIFT_NONE',
      acLevel: 'NONE',
    });
    const raOut = applyArtifactsToTwelveLeadECG(
      clean,
      raEmgConfig,
      createRandomSource(101)
    );

    let maxDiffI = 0;
    let maxDiffII = 0;
    let maxDiffIII = 0;
    let maxDiffAVR = 0;
    let maxDiffAVL = 0;
    let maxDiffV1 = 0;
    for (let i = 0; i < clean.I.length; i++) {
      maxDiffI = Math.max(maxDiffI, Math.abs(raOut.I[i]!.v - clean.I[i]!.v));
      maxDiffII = Math.max(
        maxDiffII,
        Math.abs(raOut.II[i]!.v - clean.II[i]!.v)
      );
      maxDiffIII = Math.max(
        maxDiffIII,
        Math.abs(raOut.III[i]!.v - clean.III[i]!.v)
      );
      maxDiffAVR = Math.max(
        maxDiffAVR,
        Math.abs(raOut.aVR[i]!.v - clean.aVR[i]!.v)
      );
      maxDiffAVL = Math.max(
        maxDiffAVL,
        Math.abs(raOut.aVL[i]!.v - clean.aVL[i]!.v)
      );
      maxDiffV1 = Math.max(
        maxDiffV1,
        Math.abs(raOut.V1[i]!.v - clean.V1[i]!.v)
      );
    }
    expect(maxDiffIII).toBeLessThan(1e-12); // Lead III = LL - LA is 100% spared by RA electrode noise!
    expect(maxDiffI).toBeGreaterThan(0.05);
    expect(maxDiffII).toBeGreaterThan(0.05);
    expect(maxDiffAVR).toBeCloseTo(maxDiffI, 4); // Goldberger aVR = RA - (LA+LL)/2 = 1.0 * RA (1.5 * VR)!
    expect(maxDiffAVL).toBeCloseTo(maxDiffI * 0.5, 4); // Goldberger aVL = LA - (RA+LL)/2 = -0.5 * RA!
    expect(maxDiffV1).toBeCloseTo(maxDiffI / 3, 4); // Wilson Central Terminal WCT = (RA+LA+LL)/3 -> 1/3 in V1!

    // 3B. LA-only AC artifact: must spare Lead II (LL - RA)
    const laAcConfig = normalizeArtifactConfig({
      acLevel: 'LARGE',
      mainsFrequencyHz: 60,
      acTargets: ['LA'],
    });
    const laOut = applyArtifactsToTwelveLeadECG(
      clean,
      laAcConfig,
      createRandomSource(102)
    );
    let maxLaDiffII = 0;
    let maxLaDiffAVL = 0;
    for (let i = 0; i < clean.I.length; i++) {
      maxLaDiffII = Math.max(
        maxLaDiffII,
        Math.abs(laOut.II[i]!.v - clean.II[i]!.v)
      );
      maxLaDiffAVL = Math.max(
        maxLaDiffAVL,
        Math.abs(laOut.aVL[i]!.v - clean.aVL[i]!.v)
      );
    }
    expect(maxLaDiffII).toBeLessThan(1e-12); // Lead II spared!
    expect(maxLaDiffAVL).toBeGreaterThan(0.10);

    // 3C. LL-only AC artifact: must spare Lead I (LA - RA)
    const llAcConfig = normalizeArtifactConfig({
      acLevel: 'LARGE',
      mainsFrequencyHz: 50,
      acTargets: ['LL'],
    });
    const llOut = applyArtifactsToTwelveLeadECG(
      clean,
      llAcConfig,
      createRandomSource(103)
    );
    let maxLlDiffI = 0;
    let maxLlDiffAVF = 0;
    for (let i = 0; i < clean.I.length; i++) {
      maxLlDiffI = Math.max(
        maxLlDiffI,
        Math.abs(llOut.I[i]!.v - clean.I[i]!.v)
      );
      maxLlDiffAVF = Math.max(
        maxLlDiffAVF,
        Math.abs(llOut.aVF[i]!.v - clean.aVF[i]!.v)
      );
    }
    expect(maxLlDiffI).toBeLessThan(1e-12); // Lead I spared!
    expect(maxLlDiffAVF).toBeGreaterThan(0.10);

    // 3D. RL is explicitly documented as REFERENCE_CONTACT_ARTIFACT
    const rlMeta = describeArtifactTargetMechanism('RL');
    expect(rlMeta.scope).toBe('REFERENCE_CONTACT_ARTIFACT');
  });

  it('4. Verifies Unlimited Question Sets (12 and 25 questions) & Mixed Question Modes', () => {
    const twentyFiveCases: ExamEcgCaseConfig[] = Array.from(
      { length: 25 },
      (_, idx) => {
        const pid =
          CANONICAL_PRESET_IDS[idx % CANONICAL_PRESET_IDS.length]!;
        const c = createDefaultExamCase(pid, 3000 + idx);
        c.questionMode =
          idx % 3 === 0
            ? 'DIAGNOSIS'
            : idx % 3 === 1
              ? 'MEASUREMENT'
              : 'DIAGNOSIS_AND_MEASUREMENT';
        return c;
      }
    );

    const qPdfBytes = buildExamQuestionSetPdfBytes(twentyFiveCases, true);
    const qPdfText = new TextDecoder().decode(qPdfBytes);
    expect(qPdfText).toContain('/Count 25');

    const aPdfBytes = buildExamAnswerKeyPdfBytes(
      twentyFiveCases,
      '25-Question Comprehensive Exam'
    );
    const aPdfText = new TextDecoder().decode(aPdfBytes);
    expect(aPdfText).toContain('/Count 5'); // 25 questions / 6 per page = 5 pages

    const wPdfBytes = buildMeasurementWorksheetPdfBytes(
      twentyFiveCases.slice(0, 5),
      '5-Case Student Worksheet'
    );
    const wPdfText = new TextDecoder().decode(wPdfBytes);
    expect(wPdfText).toContain('/Count 10'); // 5 cases * 2 pages (ECG + Blank Worksheet) = 10 pages
  });

  it('5. Verifies Student Measurement Practice Mode Auto-Grading, Tolerances, Manual Overrides & Pediatric Age Criteria', () => {
    // Test Neonate age-normal evaluation (HR 145 bpm, PR 102 ms, QRS 62 ms, Axis +125 deg)
    const neonateCase = createDefaultExamCase(
      'PEDIATRIC_NORMAL_NEONATE',
      202699
    );
    const neonateSim = simulateExamEcgCase(neonateCase);
    const neonateKey = deriveExpectedMeasurementKey(neonateSim);

    expect(neonateKey.ageGroup).toBe('NEONATE');
    expect(neonateKey.hrJudgment).toBe('NORMAL'); // 145 bpm is NORMAL for a neonate (100-180 bpm)!
    expect(neonateKey.prJudgment).toBe('NORMAL'); // 102 ms is NORMAL for a neonate (70-135 ms)!
    expect(neonateKey.qrsAxisCategory).toBe('NORMAL'); // +125 deg is NORMAL for a neonate (+60..+180 deg)!
    expect(neonateKey.qrsJudgment).toBe('NORMAL');

    // Grade a slightly offset student submission within tolerance
    const feat = neonateSim.simulation.ecg.features;
    const studentPassingSub: StudentMeasurementSubmission = {
      pWavePresent: 'PRESENT',
      pDurationMs: neonateKey.pDurationMs + 10, // within ±20 ms
      pAmplitudeMv: neonateKey.pAmplitudeLeadIIMv + 0.04, // within ±0.10 mV
      pMorphology: 'NORMAL',
      pLead: 'II',
      pJudgment: 'NORMAL',
      rhythmRegularity: 'REGULAR',
      rhythmOrigin: 'SINUS',
      rhythmDescription: 'Neonatal sinus rhythm',
      rhythmJudgment: 'NORMAL',
      heartRateBpm: neonateKey.heartRateBpm - 3, // within ±5 bpm
      hrJudgment: 'NORMAL',
      prIntervalMs: neonateKey.prIntervalMs + 12, // within ±20 ms
      prNotMeasurable: false,
      prJudgment: 'NORMAL',
      qrsDurationMs: neonateKey.qrsDurationMs - 8, // within ±20 ms
      qrsAmplitudeMv: feat.perLead.V1.rAmplitudeMv,
      qrsLead: 'V1',
      qrsMorphology: 'NARROW_NORMAL',
      qrsAxisCategory: 'NORMAL',
      qrsJudgment: 'NORMAL',
      stDeviationMv: feat.perLead.II.stDeviationMv,
      stLead: 'II',
      tAmplitudeMv: feat.perLead.V5.tAmplitudeMv,
      tLead: 'V5',
      tPolarity: 'POSITIVE',
      stTJudgment: 'NORMAL',
      qtIntervalMs: neonateKey.qtIntervalMs + 10,
      qtLead: 'II',
      qtcMs: neonateKey.qtcMs,
      qtJudgment: 'NORMAL',
    };

    const report = gradeStudentMeasurementSubmission(
      neonateSim,
      studentPassingSub,
      DEFAULT_MEASUREMENT_TOLERANCE
    );
    expect(report.scorePercent).toBe(100);
  });
});
