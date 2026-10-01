import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArtifactTarget,
  BaselineDriftLevel,
  CANONICAL_PRESET_IDS,
  ClinicalPresetId,
  PatientAgeGroup,
} from '../ecg-engine/scenario/types';
import {
  CLINICAL_PRESETS,
  ClinicalPresetCategory,
  getClinicalPreset,
} from '../ecg-engine/presets/clinicalPresets';
import {
  ExamNoiseLevel,
  ExamEcgCaseConfig,
  ExamQuestionSet,
  createDefaultExamCase,
} from '../exam/examTypes';
import {
  ElectrodeReversalMode,
  MissingElectrodeId,
} from '../ecg-engine/electrodes/cableMapping';
import {
  describeExamCaseModifiers,
  renderExamSheetSvg,
  simulateExamEcgCase,
} from '../exam/examEcgRenderer';
import {
  buildExamQuestionSetPdfBytes,
  buildExamAnswerKeyPdfBytes,
  buildMeasurementWorksheetPdfBytes,
  exportExamCaseToPngDownload,
  triggerBrowserDownload,
} from '../exam/examExporter';
import {
  StudentMeasurementSubmission,
  MeasurementToleranceConfig,
  MeasurementGradingReport,
  createBlankStudentSubmission,
  DEFAULT_MEASUREMENT_TOLERANCE,
  deriveExpectedMeasurementKey,
  gradeStudentMeasurementSubmission,
} from '../measurement/measurementGrader';

const STORAGE_KEY = 'ecg_standalone_exam_question_set_v2';

const PRESET_CATEGORIES: Array<{
  id: ClinicalPresetCategory | 'all';
  nameJa: string;
}> = [
  { id: 'all', nameJa: 'すべて (53)' },
  { id: 'NORMAL_AND_SINUS', nameJa: '正常洞調律・洞性変化' },
  { id: 'ECTOPIC', nameJa: '期外収縮・異所性調律' },
  { id: 'BUNDLE_AND_FASCICULAR_BLOCK', nameJa: '脚ブロック・枝ブロック' },
  { id: 'AV_CONDUCTION_BLOCK', nameJa: '房室伝導ブロック' },
  { id: 'SUPRAVENTRICULAR_AND_PREEXCITATION', nameJa: '上室性頻拍・WPW' },
  { id: 'VENTRICULAR_ARRHYTHMIA', nameJa: '心室性頻拍・致死性不整脈' },
  { id: 'MYOCARDIAL_INFARCTION', nameJa: '心筋梗塞・虚血性変化' },
  { id: 'ELECTROLYTE_AND_CHANNELOPATHY', nameJa: '電解質・QT異常' },
  { id: 'PERICARDIAL_AND_CHAMBER_AXIS', nameJa: '心室肥大・心房負荷・心膜炎' },
  { id: 'DEVICE_AND_ANATOMY', nameJa: '電極付け間違い・右横位・ペースメーカ' },
  { id: 'PEDIATRIC_NORMAL', nameJa: '小児年齢別正常心電図' },
];

const ARTIFACT_TARGETS: ArtifactTarget[] = ['ALL', 'RA', 'LA', 'LL', 'RL'];

const ELECTRODE_REVERSALS: Array<{
  value: ElectrodeReversalMode;
  label: string;
}> = [
  { value: 'NONE', label: '正常装着 (NONE)' },
  { value: 'RA_LA_REVERSAL', label: '左右上肢付け間違い (RA-LA Reversal)' },
  { value: 'LA_LL_REVERSAL', label: '左上肢・左下肢付け間違い (LA-LL Reversal)' },
  { value: 'RA_LL_REVERSAL', label: '右上肢・左下肢付け間違い (RA-LL Reversal)' },
  {
    value: 'RIGHT_TO_LEFT_CHEST_REVERSAL',
    label: '胸部誘導 V1〜V6 逆順装着',
  },
];

const MISSING_ELECTRODES: Array<{
  value: MissingElectrodeId;
  label: string;
}> = [
  { value: 'RA_MISSING', label: 'RA脱落' },
  { value: 'LA_MISSING', label: 'LA脱落' },
  { value: 'LL_MISSING', label: 'LL脱落' },
  { value: 'V1_MISSING', label: 'V1脱落' },
  { value: 'V2_MISSING', label: 'V2脱落' },
  { value: 'V3_MISSING', label: 'V3脱落' },
  { value: 'V4_MISSING', label: 'V4脱落' },
  { value: 'V5_MISSING', label: 'V5脱落' },
  { value: 'V6_MISSING', label: 'V6脱落' },
];

export const StandaloneExamApp: React.FC = () => {
  const [appWorkspaceTab, setAppWorkspaceTab] = useState<
    'AUTHOR_BUILDER' | 'STUDENT_PRACTICE'
  >('AUTHOR_BUILDER');

  const [examTitle, setExamTitle] = useState<string>(
    '12誘導心電図 定期試験・判読実習セット'
  );
  const [questions, setQuestions] = useState<ExamEcgCaseConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ExamQuestionSet;
        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          return parsed.questions;
        }
      }
    } catch {
      // fallback
    }
    return [
      createDefaultExamCase('NORMAL_SINUS', 202601),
      createDefaultExamCase('ATRIAL_FLUTTER', 202602),
      createDefaultExamCase('ACUTE_PERICARDITIS', 202603),
      createDefaultExamCase('POSTERIOR_MI_ACUTE', 202604),
    ];
  });
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [examModePreview, setExamModePreview] = useState<boolean>(true);
  const [showQuestionLabelOnSheet, setShowQuestionLabelOnSheet] =
    useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<
    ClinicalPresetCategory | 'all'
  >('all');
  const [presetSearchQuery, setPresetSearchQuery] = useState<string>('');
  const [copySeedNotice, setCopySeedNotice] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Student Measurement Practice State
  const [studentSub, setStudentSub] = useState<StudentMeasurementSubmission>(
    () => createBlankStudentSubmission()
  );
  const [tolerance, setTolerance] = useState<MeasurementToleranceConfig>(
    DEFAULT_MEASUREMENT_TOLERANCE
  );
  const [gradingReport, setGradingReport] =
    useState<MeasurementGradingReport | null>(null);

  // Persist Question Set to localStorage
  useEffect(() => {
    try {
      const payload: ExamQuestionSet = {
        version: '2.0.0',
        title: examTitle,
        createdAt: new Date().toISOString(),
        questions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [questions, examTitle]);

  const activeCase = questions[activeIndex] ?? questions[0]!;

  const simulatedCase = useMemo(
    () => simulateExamEcgCase(activeCase),
    [activeCase]
  );

  const expectedMeasurementKey = useMemo(
    () => deriveExpectedMeasurementKey(simulatedCase),
    [simulatedCase]
  );

  const sheetSvg = useMemo(() => {
    const qLabel =
      activeCase.questionLabel?.trim() || `Question ${activeIndex + 1}`;
    return renderExamSheetSvg(simulatedCase, {
      examMode: appWorkspaceTab === 'STUDENT_PRACTICE' ? true : examModePreview,
      questionLabel: qLabel,
      showQuestionLabel: showQuestionLabelOnSheet,
    });
  }, [
    simulatedCase,
    activeCase.questionLabel,
    activeIndex,
    appWorkspaceTab,
    examModePreview,
    showQuestionLabelOnSheet,
  ]);

  const updateActiveCase = (
    updater: (prev: ExamEcgCaseConfig) => ExamEcgCaseConfig
  ) => {
    setQuestions((prev) =>
      prev.map((item, idx) => (idx === activeIndex ? updater(item) : item))
    );
    setGradingReport(null);
  };

  const toggleTarget = (
    current: ArtifactTarget[] | undefined,
    target: ArtifactTarget
  ): ArtifactTarget[] => {
    if (target === 'ALL') return ['ALL'];
    const base = (current ?? ['ALL']).filter((t) => t !== 'ALL');
    if (base.includes(target)) {
      const next = base.filter((t) => t !== target);
      return next.length === 0 ? ['ALL'] : next;
    }
    return [...base, target];
  };

  const handlePresetChange = (presetId: ClinicalPresetId) => {
    const simDefault = simulateExamEcgCase({
      ...activeCase,
      presetId,
      useCustomHeartRate: false,
      pacCount: presetId === 'PAC' ? 1 : 0,
      pvcCount: presetId === 'PVC' ? 1 : 0,
    });
    updateActiveCase((prev) => ({
      ...prev,
      presetId,
      useCustomHeartRate: false,
      pacCount: presetId === 'PAC' ? 1 : 0,
      pvcCount: presetId === 'PVC' ? 1 : 0,
      heartRateBpm: Math.round(
        simDefault.simulation.resolvedConfig.heartRateBpm
      ),
    }));
  };

  const toggleMissingElectrode = (missingId: MissingElectrodeId) => {
    updateActiveCase((prev) => {
      const exists = prev.electrodeError.missing.includes(missingId);
      const nextMissing = exists
        ? prev.electrodeError.missing.filter((m) => m !== missingId)
        : [...prev.electrodeError.missing, missingId];
      return {
        ...prev,
        electrodeError: {
          ...prev.electrodeError,
          missing: nextMissing,
        },
      };
    });
  };

  const randomizeSeed = () => {
    const nextSeed = Math.floor(100000 + Math.random() * 900000);
    updateActiveCase((prev) => ({ ...prev, seed: nextSeed }));
  };

  const copySeed = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(String(activeCase.seed)).catch(() => {});
    }
    setCopySeedNotice(true);
    setTimeout(() => setCopySeedNotice(false), 1500);
  };

  const handleAddQuestion = (presetId: ClinicalPresetId = 'NORMAL_SINUS') => {
    const nextSeed = 202600 + questions.length + 1;
    const newCase = createDefaultExamCase(presetId, nextSeed);
    newCase.questionLabel = `Question ${questions.length + 1}`;
    setQuestions((prev) => [...prev, newCase]);
    setActiveIndex(questions.length);
  };

  const handleAddRepresentative10Pack = () => {
    const packPresets: ClinicalPresetId[] = [
      'SINUS_PAUSE_ARREST',
      'SA_EXIT_BLOCK',
      'PSVT_REGULAR_NARROW',
      'AVB_COMPLETE',
      'LATERAL_MI_ACUTE',
      'POSTERIOR_MI_ACUTE',
      'LONG_QT_PATTERN',
      'P_MITRALE_PATTERN',
      'LVH_WITH_STRAIN',
      'LARGE_PERICARDIAL_EFFUSION_PATTERN',
    ];
    const baseIdx = questions.length;
    const newCases = packPresets.map((pid, idx) => {
      const c = createDefaultExamCase(pid, 202700 + baseIdx + idx + 1);
      c.questionLabel = `Question ${baseIdx + idx + 1}`;
      return c;
    });
    setQuestions((prev) => [...prev, ...newCases]);
    setActiveIndex(baseIdx);
  };

  const handleDeleteQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((q, newIdx) => ({
          ...q,
          questionLabel: `Question ${newIdx + 1}`,
        }))
    );
    setActiveIndex((prev) => Math.max(0, Math.min(prev, questions.length - 2)));
    setGradingReport(null);
  };

  const duplicateQuestionAt = (idx: number) => {
    setQuestions((prev) => {
      const target = prev[idx];
      if (!target) return prev;
      const copy: ExamEcgCaseConfig = {
        ...structuredClone(target),
        id: `exam_q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        seed: Math.floor(100000 + Math.random() * 900000),
      };
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      return next.map((q, i) => ({ ...q, questionLabel: `Question ${i + 1}` }));
    });
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    setQuestions((prev) => {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx]!;
      next[idx] = next[targetIdx]!;
      next[targetIdx] = tmp;
      return next.map((q, i) => ({ ...q, questionLabel: `Question ${i + 1}` }));
    });
    setActiveIndex((prev) => prev + direction);
  };

  const handleExportQuestionPdf = () => {
    const bytes = buildExamQuestionSetPdfBytes(
      questions,
      showQuestionLabelOnSheet
    );
    triggerBrowserDownload(
      bytes,
      `ecg_exam_questions_${questions.length}q.pdf`,
      'application/pdf'
    );
  };

  const handleExportAnswerKeyPdf = () => {
    const bytes = buildExamAnswerKeyPdfBytes(questions, examTitle);
    triggerBrowserDownload(
      bytes,
      `ecg_exam_answer_key_${questions.length}q.pdf`,
      'application/pdf'
    );
  };

  const handleExportWorksheetPdf = () => {
    const bytes = buildMeasurementWorksheetPdfBytes(questions, examTitle);
    triggerBrowserDownload(
      bytes,
      `ecg_measurement_worksheet_${questions.length}q.pdf`,
      'application/pdf'
    );
  };

  const handlePrintJapaneseWorksheet = (
    targetCases: ExamEcgCaseConfig[] = [activeCase]
  ) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(
        'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。'
      );
      return;
    }

    const pagesHtml = targetCases
      .map((c, idx) => {
        const sim = simulateExamEcgCase(c);
        const svg = renderExamSheetSvg(sim, {
          examMode: true,
          questionLabel: c.questionLabel || `問題 ${idx + 1}`,
          showQuestionLabel: true,
        });

        return `
        <div class="sheet-page">
          <div class="header-bar">
            <div>
              <div class="title">12誘導心電図 計測・解析ワークシート【${c.questionLabel || `第${idx + 1}問`}】</div>
              <div class="subtitle">標準記録条件: 送紙速度 25 mm/s | 電圧感度 10 mm/mV (1小目盛=1mm=0.04s/0.1mV, 1大目盛=5mm=0.20s/0.5mV)</div>
            </div>
            <div class="student-box">
              <span class="label">学籍番号:</span> <span class="underline">____________________</span>
              <span class="label">氏名:</span> <span class="underline">________________________</span>
              <span class="label">実施日:</span> <span class="underline">____/____/____</span>
            </div>
          </div>

          <div class="ecg-container">
            ${svg}
          </div>

          <div class="worksheet-grid">
            <div class="ws-card">
              <div class="ws-title">1. 心拍数 (HR) & リズム判定</div>
              <div class="ws-line">・心拍数: <strong>___________ bpm</strong> （計測誘導: II誘導）</div>
              <div class="ws-line">・頻度判定: □ 正常 (60〜100)　□ 徐脈 (&lt;60)　□ 頻拍 (&gt;100)</div>
              <div class="ws-line">・リズムの規則性: □ 整 (Regular)　□ 不整 (Irregular: 期外収縮 / 細動 / ブロック)</div>
              <div class="ws-line">・歩調とり: □ 洞調律 (Sinus)　□ 異所性 / 接合部 / 心室性</div>
            </div>

            <div class="ws-card">
              <div class="ws-title">2. P波の計測・形態 (II誘導 / V1誘導)</div>
              <div class="ws-line">・P波の有無: □ あり　□ なし (欠如 / f波 / F波)　□ 逆行性P波</div>
              <div class="ws-line">・P波幅: <strong>________ ms</strong> (正常 &lt;110ms)　振幅: <strong>________ mV</strong> (正常 &lt;0.25mV)</div>
              <div class="ws-line">・形態判定: □ 正常　□ 肺性P (尖鋭高大・右房負荷)　□ 僧帽性P (二峰性・左房負荷)</div>
            </div>

            <div class="ws-card">
              <div class="ws-title">3. PQ (PR) 時間</div>
              <div class="ws-line">・PQ時間: <strong>________ ms</strong> (____ 小目盛)　□ 計測不能 (房室解離/心房細動)</div>
              <div class="ws-line">・判定: □ 正常 (120〜200 ms)　□ 延長 (一度房室ブロック)　□ 短縮 (&lt;120 ms: WPW等)</div>
              <div class="ws-line">・PR部分の偏位: □ 基線と一致 (平坦)　□ PR低下 (急性心膜炎)　□ aVRでPR上昇</div>
            </div>

            <div class="ws-card">
              <div class="ws-title">4. QRS波・前額面電気軸</div>
              <div class="ws-line">・QRS幅: <strong>________ ms</strong>　□ 正常 (&lt;100ms)　□ 不完全脚ブロック (100〜120ms)　□ 脚ブロック (≧120ms)</div>
              <div class="ws-line">・電気軸: □ 正常 (-30°〜+90°)　□ 左軸偏位 (&lt;-30°)　□ 右軸偏位 (&gt;+90°)　[推定: ____°]</div>
              <div class="ws-line">・特徴的形態: □ 正常　□ rsR' (右脚ブロック)　□ 幅広単峰性R (左脚ブロック)　□ ⊿デルタ波 (WPW)　□ 異常Q波</div>
            </div>

            <div class="ws-card">
              <div class="ws-title">5. ST部分 & T波 (ST-T変化)</div>
              <div class="ws-line">・ST変化: □ 基線と一致 (正常)　□ 上昇 (≧0.1mV)　□ 低下 (≧0.05mV)　[誘導: ___________]</div>
              <div class="ws-line">・ST形状: □ 水平型/下降型 (虚血/ストレイン)　□ 弓状/上凹型 (心膜炎/早期再分極)　□ Coved型 (Brugada)</div>
              <div class="ws-line">・T波: □ 正常直立　□ 陰性T波 / 冠性T波　□ テント状高カリウムT波　□ 平低T波</div>
            </div>

            <div class="ws-card">
              <div class="ws-title">6. QT/QTc時間 & 総合診断名</div>
              <div class="ws-line">・実測QT: <strong>________ ms</strong>　Bazett補正QTc: <strong>________ ms</strong> (正常 360〜440ms / 延長 &gt;460ms)</div>
              <div class="ws-line">・心電図診断名 (確定または鑑別): __________________________________________________</div>
              <div class="ws-line">・指導医/教員コメント欄: ___________________________________________________________</div>
            </div>
          </div>
        </div>
      `;
      })
      .join('\n');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="utf-8">
        <title>${examTitle} - 12誘導心電図 計測ワークシート</title>
        <style>
          @page { size: A4 landscape; margin: 6mm 8mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Segoe UI", sans-serif;
            margin: 0; padding: 0; color: #0f172a; background: #fff;
          }
          .sheet-page {
            width: 281mm; min-height: 194mm; max-height: 196mm;
            page-break-after: always; display: flex; flex-direction: column; justify-content: space-between;
          }
          .header-bar {
            display: flex; justify-content: space-between; align-items: flex-end;
            border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin-bottom: 4px;
          }
          .title { font-size: 13.5px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 9.5px; color: #475569; margin-top: 1px; }
          .student-box { font-size: 10.5px; display: flex; gap: 12px; }
          .label { font-weight: bold; color: #334155; }
          .underline { font-family: monospace; color: #64748b; }
          .ecg-container {
            width: 100%; height: 110mm; overflow: hidden; border: 1px solid #cbd5e1; background: #fff;
          }
          .ecg-container svg { width: 100%; height: 100%; display: block; }
          .worksheet-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 4px;
          }
          .ws-card {
            border: 1px solid #94a3b8; border-radius: 4px; padding: 4px 6px; font-size: 8.8px; line-height: 1.35; background: #fafafa;
          }
          .ws-title {
            font-weight: 800; font-size: 9.5px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 1.5px; margin-bottom: 2.5px;
          }
          .ws-line { margin: 1.5px 0; color: #1e293b; }
          @media print {
            body { background: transparent; }
            .sheet-page { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportJson = () => {
    const payload: ExamQuestionSet = {
      version: '2.0.0',
      title: examTitle,
      createdAt: new Date().toISOString(),
      questions,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
    triggerBrowserDownload(
      bytes,
      `ecg_question_set_${questions.length}q.json`,
      'application/json'
    );
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ExamQuestionSet;
        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          setQuestions(parsed.questions);
          if (parsed.title) setExamTitle(parsed.title);
          setActiveIndex(0);
          setGradingReport(null);
        }
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAutofillExpectedForTeacher = () => {
    const k = expectedMeasurementKey;
    const feat = simulatedCase.simulation.ecg.features;
    setStudentSub({
      pWavePresent: k.pWavePresent,
      pMorphology: k.pMorphology,
      pDurationMs: k.pDurationMs,
      pAmplitudeMv: k.pAmplitudeLeadIIMv,
      pLead: 'II',
      pJudgment: k.pJudgment,
      rhythmRegularity: k.rhythmRegularity,
      rhythmOrigin: k.rhythmOrigin,
      rhythmDescription: `${CLINICAL_PRESETS[activeCase.presetId].nameJa}`,
      rhythmJudgment: k.rhythmJudgment,
      heartRateBpm: k.heartRateBpm,
      hrJudgment: k.hrJudgment,
      prIntervalMs: k.prIntervalMs,
      prNotMeasurable: k.prNotMeasurable,
      prJudgment: k.prJudgment,
      qrsDurationMs: k.qrsDurationMs,
      qrsAmplitudeMv: Number(feat.perLead.V5.rAmplitudeMv.toFixed(2)),
      qrsLead: 'V5',
      qrsMorphology: k.qrsMorphology,
      qrsAxisCategory: k.qrsAxisCategory,
      qrsJudgment: k.qrsJudgment,
      stDeviationMv: Number(feat.perLead.II.stDeviationMv.toFixed(2)),
      stLead: 'II',
      tAmplitudeMv: Number(feat.perLead.V5.tAmplitudeMv.toFixed(2)),
      tLead: 'V5',
      tPolarity: feat.perLead.V5.tPolarity === 'NEGATIVE' ? 'NEGATIVE' : 'POSITIVE',
      stTJudgment: k.stJudgment,
      qtIntervalMs: k.qtIntervalMs,
      qtLead: 'II',
      qtcMs: k.qtcMs,
      qtJudgment: k.qtJudgment,
    });
  };

  const filteredPresets = useMemo(() => {
    return CANONICAL_PRESET_IDS.map((id) => getClinicalPreset(id)).filter(
      (meta) => {
        const matchCategory =
          selectedCategory === 'all' || meta.category === selectedCategory;
        const q = presetSearchQuery.trim().toLowerCase();
        const matchSearch =
          q === '' ||
          meta.nameJa.toLowerCase().includes(q) ||
          meta.id.toLowerCase().includes(q) ||
          meta.description.toLowerCase().includes(q);
        return matchCategory && matchSearch;
      }
    );
  }, [selectedCategory, presetSearchQuery]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800">
      {/* 1. App Header Bar (identical to ecg-heart-simulator) */}
      <header className="h-12 px-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-xs font-extrabold tracking-wide shrink-0">
            EXAM GENERATOR MODE
          </span>
          <h1 className="text-sm font-bold truncate">
            12誘導心電図 試験問題作成モード (25 mm/s · 10 mm/mV 固定 · 全12誘導で同じ2.5秒 + 10秒Lead II)
          </h1>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-semibold hidden md:inline shrink-0">
            全{questions.length}問
          </span>
        </div>

        {/* Tab switcher: Author Builder vs Student Practice */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAppWorkspaceTab('AUTHOR_BUILDER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              appWorkspaceTab === 'AUTHOR_BUILDER'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            教員用：問題作成ビルダー
          </button>
          <button
            type="button"
            onClick={() => {
              setAppWorkspaceTab('STUDENT_PRACTICE');
              setGradingReport(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              appWorkspaceTab === 'STUDENT_PRACTICE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            学生用：波形計測実習 (Student Practice)
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Column (xl:col-span-4): Parameter Controls or Measurement Form */}
          <div className="xl:col-span-4 space-y-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            {appWorkspaceTab === 'AUTHOR_BUILDER' ? (
              <>
                {/* Header of Left Column */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      12誘導心電図 試験問題ビルダー
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      固定条件: 25 mm/s · 10 mm/mV · 4×3標準配置 (Auto-Gain禁止)
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={examModePreview}
                      onChange={(e) => setExamModePreview(e.target.checked)}
                      className="rounded accent-emerald-400"
                    />
                    <span>Exam Mode (解答非表示)</span>
                  </label>
                </div>

                {/* Question Label & Preset Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={showQuestionLabelOnSheet}
                        onChange={(e) => setShowQuestionLabelOnSheet(e.target.checked)}
                      />
                      <span>問題番号を表示:</span>
                    </label>
                    <input
                      type="text"
                      value={activeCase.questionLabel ?? `Question ${activeIndex + 1}`}
                      onChange={(e) =>
                        updateActiveCase((prev) => ({
                          ...prev,
                          questionLabel: e.target.value,
                        }))
                      }
                      className="flex-1 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-900 bg-white"
                      placeholder="Question 1 / 問 1"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        出題プリセット (全53疾患 — 紙面上には表示されません)
                      </label>
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        53 / 53 IMPLEMENTED
                      </span>
                    </div>

                    {/* Category Filter Buttons */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {PRESET_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                            selectedCategory === cat.id
                              ? 'bg-slate-900 text-white font-semibold'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                          }`}
                        >
                          {cat.nameJa}
                        </button>
                      ))}
                    </div>

                    {/* Preset Search Bar */}
                    <input
                      type="text"
                      placeholder="プリセット名・疾患名・IDを検索..."
                      value={presetSearchQuery}
                      onChange={(e) => setPresetSearchQuery(e.target.value)}
                      className="w-full mb-1.5 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />

                    {/* Preset Select Dropdown */}
                    <select
                      value={activeCase.presetId}
                      onChange={(e) =>
                        handlePresetChange(e.target.value as ClinicalPresetId)
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 cursor-pointer"
                    >
                      {filteredPresets.map((meta) => (
                        <option key={meta.id} value={meta.id}>
                          {meta.nameJa} [{meta.id}]
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Heart Rate & PAC / PVC Counts */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      心拍数 (HR 30–220 bpm) & 期外収縮数
                    </span>
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeCase.useCustomHeartRate}
                        onChange={(e) =>
                          updateActiveCase((prev) => ({
                            ...prev,
                            useCustomHeartRate: e.target.checked,
                          }))
                        }
                      />
                      <span>カスタム心拍数</span>
                    </label>
                  </div>

                  {activeCase.useCustomHeartRate && (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={30}
                        max={220}
                        value={activeCase.heartRateBpm ?? 75}
                        onChange={(e) =>
                          updateActiveCase((prev) => ({
                            ...prev,
                            heartRateBpm: Number(e.target.value),
                          }))
                        }
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min={30}
                        max={220}
                        value={activeCase.heartRateBpm ?? 75}
                        onChange={(e) =>
                          updateActiveCase((prev) => ({
                            ...prev,
                            heartRateBpm: Number(e.target.value),
                          }))
                        }
                        className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded text-center"
                      />
                      <span className="text-xs text-slate-500 font-mono">bpm</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                        PAC (心房期外収縮 0–4)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={4}
                        value={activeCase.pacCount}
                        onChange={(e) =>
                          updateActiveCase((prev) => ({
                            ...prev,
                            pacCount: Math.max(0, Math.min(4, Number(e.target.value))),
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                        PVC (心室期外収縮 0–4)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={4}
                        value={activeCase.pvcCount}
                        onChange={(e) =>
                          updateActiveCase((prev) => ({
                            ...prev,
                            pvcCount: Math.max(0, Math.min(4, Number(e.target.value))),
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <label htmlFor="pvc-origin" className="text-[11px] font-semibold text-slate-600 block">
                    PVCの起源
                  </label>
                  <select
                    id="pvc-origin"
                    value={activeCase.pvcOrigin === 'LV' ? 'LV' : 'RV'}
                    disabled={activeCase.pvcCount === 0}
                    onChange={(e) =>
                      updateActiveCase((prev) => ({
                        ...prev,
                        pvcOrigin: e.target.value === 'LV' ? 'LV' : 'RV',
                      }))
                    }
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded disabled:opacity-50"
                  >
                    <option value="RV">右室起源</option>
                    <option value="LV">左室起源</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    右室は左脚ブロック様、左室は右脚ブロック様の代表的なPVC波形です。
                  </p>
                </div>

                {/* Biophysical Artifacts & Noise */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      生体物理・電極ノイズ (Artifact Engine)
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Clean分離型
                    </span>
                  </div>

                  {/* Baseline Drift */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                      基線動揺 (呼吸・体動ドリフト)
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { value: 'DRIFT_NONE', label: 'なし (0 mV)' },
                          { value: 'DRIFT_SMALL', label: '小 (~0.20 mV)' },
                          { value: 'DRIFT_LARGE', label: '大 (~0.40 mV)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            updateActiveCase((prev) => ({
                              ...prev,
                              noise: {
                                ...prev.noise,
                                baselineDrift: opt.value !== 'DRIFT_NONE',
                                driftLevel: opt.value as BaselineDriftLevel,
                              },
                            }))
                          }
                          className={`px-1.5 py-1 rounded text-[11px] font-bold border transition cursor-pointer ${
                            (activeCase.noise.driftLevel ?? 'DRIFT_NONE') === opt.value
                              ? 'bg-rose-600 text-white border-rose-700'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* EMG Tremor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">
                        筋電図ノイズ (EMG)
                      </span>
                      <div className="flex items-center gap-1">
                        {(['NONE', 'SMALL', 'LARGE'] as ExamNoiseLevel[]).map(
                          (lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() =>
                                updateActiveCase((prev) => ({
                                  ...prev,
                                  noise: {
                                    ...prev.noise,
                                    emg: lvl,
                                  },
                                }))
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                                (activeCase.noise.emg ?? 'NONE') === lvl
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {lvl}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {/* EMG Targets */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">
                        電極:
                      </span>
                      {ARTIFACT_TARGETS.map((t) => {
                        const targets = activeCase.noise.emgTargets ?? ['ALL'];
                        const active = targets.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              updateActiveCase((prev) => ({
                                ...prev,
                                noise: {
                                  ...prev.noise,
                                  emgTargets: toggleTarget(prev.noise.emgTargets, t),
                                },
                              }))
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-amber-500 text-white border-amber-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* AC Mains Hum */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">
                        交流障害 (AC Mains Hum)
                      </span>
                      <div className="flex items-center gap-1">
                        {(['NONE', 'SMALL', 'LARGE'] as ExamNoiseLevel[]).map(
                          (lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() =>
                                updateActiveCase((prev) => ({
                                  ...prev,
                                  noise: {
                                    ...prev.noise,
                                    ac: lvl,
                                  },
                                }))
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                                (activeCase.noise.ac ?? 'NONE') === lvl
                                  ? 'bg-sky-600 text-white border-sky-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {lvl}
                            </button>
                          )
                        )}
                        <select
                          value={activeCase.noise.acFrequencyHz ?? 60}
                          onChange={(e) =>
                            updateActiveCase((prev) => ({
                              ...prev,
                              noise: {
                                ...prev.noise,
                                acFrequencyHz: Number(e.target.value) as 50 | 60,
                              },
                            }))
                          }
                          className="text-[10px] bg-white border border-slate-300 rounded px-1 py-0.5 font-mono cursor-pointer"
                        >
                          <option value={50}>50Hz</option>
                          <option value={60}>60Hz</option>
                        </select>
                      </div>
                    </div>
                    {/* AC Targets */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">
                        電極:
                      </span>
                      {ARTIFACT_TARGETS.map((t) => {
                        const targets = activeCase.noise.acTargets ?? ['ALL'];
                        const active = targets.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              updateActiveCase((prev) => ({
                                ...prev,
                                noise: {
                                  ...prev.noise,
                                  acTargets: toggleTarget(prev.noise.acTargets, t),
                                },
                              }))
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-sky-500 text-white border-sky-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Electrode Reversal & Missing Electrodes */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      電極誤装着・電極脱落 (Cable Mapping)
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                      左右・肢電極入れ替え
                    </span>
                    <select
                      value={activeCase.electrodeError.reversal}
                      onChange={(e) =>
                        updateActiveCase((prev) => ({
                          ...prev,
                          electrodeError: {
                            ...prev.electrodeError,
                            reversal: e.target.value as ElectrodeReversalMode,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded cursor-pointer"
                    >
                      {ELECTRODE_REVERSALS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">
                        電極外れ・接触不良 (Missing Electrodes)
                      </span>
                      {activeCase.electrodeError.missing.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveCase((prev) => ({
                              ...prev,
                              electrodeError: { ...prev.electrodeError, missing: [] },
                            }))
                          }
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          すべて解除
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {MISSING_ELECTRODES.map((m) => {
                        const active = activeCase.electrodeError.missing.includes(
                          m.value
                        );
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => toggleMissingElectrode(m.value)}
                            className={`px-2 py-1 rounded text-[11px] font-mono font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-rose-600 text-white border-rose-700'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Seed & Reproducibility */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Seed (乱数シード・完全再現)
                    </span>
                    {copySeedNotice && (
                      <span className="text-[11px] font-bold text-emerald-600">
                        ✓ コピーしました
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={activeCase.seed}
                      onChange={(e) =>
                        updateActiveCase((prev) => ({
                          ...prev,
                          seed: Number(e.target.value) || 42,
                        }))
                      }
                      className="flex-1 px-2.5 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={randomizeSeed}
                      className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700 cursor-pointer"
                    >
                      🎲 Randomize
                    </button>
                    <button
                      type="button"
                      onClick={copySeed}
                      className="px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <input
                    type="text"
                    value={activeCase.examinerNote ?? ''}
                    onChange={(e) =>
                      updateActiveCase((prev) => ({
                        ...prev,
                        examinerNote: e.target.value,
                      }))
                    }
                    placeholder="作問者メモ (解答一覧PDFにのみ記載され、問題紙面には出ません)"
                    className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </>
            ) : (
              /* Student Practice Mode Form */
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      波形計測・判読実習 (Student Practice)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      心電図波形を計測し、7項目を入力して自動採点
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-xs font-bold">
                    実習モード
                  </span>
                </div>

                {/* Patient Age Group Selection */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      患者年齢区分 (小児・成人基準値切替)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      年齢別正常値自動適応
                    </span>
                  </div>
                  <select
                    value={activeCase.ageGroup ?? 'ADULT'}
                    onChange={(e) =>
                      updateActiveCase((prev) => ({
                        ...prev,
                        ageGroup: e.target.value as PatientAgeGroup,
                      }))
                    }
                    className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded cursor-pointer"
                  >
                    <option value="ADULT">成人 (18歳以上 — HR 60-100, PR 120-200, QRS ≤100, QTc ≤440ms)</option>
                    <option value="NEONATE">新生児 (0–1ヶ月 — HR 110-160, PR 80-120, QRS ≤80, 右軸偏位)</option>
                    <option value="INFANT">乳児 (1–12ヶ月 — HR 100-150, PR 90-130, QRS ≤80)</option>
                    <option value="CHILD_1_TO_5_Y">幼児 (1–5歳 — HR 80-130, PR 100-140, QRS ≤85)</option>
                    <option value="CHILD_6_TO_12_Y">学童 (6–12歳 — HR 70-110, PR 110-160, QRS ≤90)</option>
                    <option value="ADOLESCENT">思春期 (13–17歳 — HR 60-100, PR 120-180, QRS ≤100)</option>
                  </select>
                </div>

                {/* 1. P波 */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    1. P波 (心房脱分極)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={studentSub.pWavePresent}
                      onChange={(e) =>
                        setStudentSub((s) => ({
                          ...s,
                          pWavePresent: e.target.value as 'PRESENT' | 'ABSENT',
                        }))
                      }
                      className="px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded font-semibold"
                    >
                      <option value="PRESENT">P波を認める (PRESENT)</option>
                      <option value="ABSENT">P波消失・確認不能 (ABSENT)</option>
                    </select>
                    <select
                      value={studentSub.pMorphology}
                      onChange={(e) =>
                        setStudentSub((s) => ({
                          ...s,
                          pMorphology: e.target.value as any,
                        }))
                      }
                      className="px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="NORMAL">正常陽性 (II/aVF陽性)</option>
                      <option value="PEAKED">尖鋭・高電位 (肺性P波)</option>
                      <option value="NOTCHED">二峰性・幅広い (僧帽性P波)</option>
                      <option value="INVERTED">逆行性・陰性P波</option>
                      <option value="BIPHASIC">二相性P波</option>
                      <option value="ABSENT">消失・F/f波</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">幅 (ms)</span>
                      <input
                        type="number"
                        value={studentSub.pDurationMs}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            pDurationMs: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">振幅 (mV)</span>
                      <input
                        type="number"
                        step={0.05}
                        value={studentSub.pAmplitudeMv}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            pAmplitudeMv: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. リズム & 3. 心拍数 */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    2. リズム (RR間隔) & 3. 心拍数
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">リズム性状</span>
                      <select
                        value={studentSub.rhythmRegularity}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            rhythmRegularity: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="REGULAR">規則的 (整)</option>
                        <option value="IRREGULARLY_IRREGULAR">絶対的不整 (心房細動など)</option>
                        <option value="REGULARLY_IRREGULAR">周期的不整 (期外収縮・ブロック)</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">実測心拍数 (bpm)</span>
                      <input
                        type="number"
                        value={studentSub.heartRateBpm}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            heartRateBpm: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">リズム判定</span>
                      <select
                        value={studentSub.rhythmJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            rhythmJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常洞調律</option>
                        <option value="ABNORMAL">不整脈・異常調律</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">心拍数判定</span>
                      <select
                        value={studentSub.hrJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            hrJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常 (Normal)</option>
                        <option value="BRADYCARDIA">徐脈 (Bradycardia)</option>
                        <option value="TACHYCARDIA">頻脈 (Tachycardia)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 4. PQ時間 */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    4. PQ(PR)時間 (房室伝導)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">PQ時間 (ms)</span>
                      <input
                        type="number"
                        value={studentSub.prIntervalMs}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            prIntervalMs: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">PQ判定</span>
                      <select
                        value={studentSub.prJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            prJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常 (120–200 ms)</option>
                        <option value="SHORTENED">短縮 (&lt;120 ms / WPW・接合部)</option>
                        <option value="PROLONGED">延長 (&gt;200 ms / 1度房室ブロック)</option>
                        <option value="NOT_MEASURABLE">解離・計測不能 (完全ブロック・AF)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 5. QRS群 */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    5. QRS群 (心室脱分極)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">QRS幅 (ms)</span>
                      <input
                        type="number"
                        value={studentSub.qrsDurationMs}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qrsDurationMs: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">電気軸判定</span>
                      <select
                        value={studentSub.qrsAxisCategory}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qrsAxisCategory: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常軸 (-30° 〜 +90°)</option>
                        <option value="LAD">左軸偏位 (-30° 〜 -90°)</option>
                        <option value="RAD">右軸偏位 (+90° 〜 +180°)</option>
                        <option value="EXTREME">極端軸・北西軸 (+180° 〜 -90°)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">QRS波形パターン</span>
                      <select
                        value={studentSub.qrsMorphology}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qrsMorphology: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NARROW_NORMAL">狭小正常 (Narrow Normal)</option>
                        <option value="RSR_PRIME">rsR'型 (右脚ブロック)</option>
                        <option value="BROAD_SLURRED">幅広い単相性 (左脚ブロック)</option>
                        <option value="QS_OR_PATH_Q">QS波・異常Q波 (心筋梗塞)</option>
                        <option value="DELTA_WAVE">デルタ波 (WPW)</option>
                        <option value="WIDE_ECTOPIC">幅広い異所性 (心室性)</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">QRS総合判定</span>
                      <select
                        value={studentSub.qrsJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qrsJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常 (≤100 ms)</option>
                        <option value="ABNORMAL">異常 (脚ブロック・肥大・梗塞)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 6. ST-T */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    6. ST-T (心室再分極・虚血性変化)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">ST偏位 (mV)</span>
                      <input
                        type="number"
                        step={0.05}
                        value={studentSub.stDeviationMv}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            stDeviationMv: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">T波極性</span>
                      <select
                        value={studentSub.tPolarity}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            tPolarity: e.target.value as any,
                          }))
                        }
                        className="w-full px-1 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="POSITIVE">陽性T波</option>
                        <option value="NEGATIVE">陰性T波</option>
                        <option value="FLAT">平低T波</option>
                        <option value="BIPHASIC">二相性T波</option>
                        <option value="PEAKED">高尖T波</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">ST-T総合判定</span>
                      <select
                        value={studentSub.stTJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            stTJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常</option>
                        <option value="ABNORMAL">異常 (ST上昇/低下/冠性T波)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 7. QT時間 */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    7. QT時間 / QTc (Bazett補正)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-600 block">実測QT (ms)</span>
                      <input
                        type="number"
                        value={studentSub.qtIntervalMs}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qtIntervalMs: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">QTc Bazett (ms)</span>
                      <input
                        type="number"
                        value={studentSub.qtcMs}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qtcMs: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-0.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-600 block">QT判定</span>
                      <select
                        value={studentSub.qtJudgment}
                        onChange={(e) =>
                          setStudentSub((s) => ({
                            ...s,
                            qtJudgment: e.target.value as any,
                          }))
                        }
                        className="w-full px-1 py-0.5 text-xs bg-white border border-slate-300 rounded"
                      >
                        <option value="NORMAL">正常 (≤440 ms)</option>
                        <option value="PROLONGED">延長 (&gt;450 ms)</option>
                        <option value="SHORTENED">短縮 (&lt;340 ms)</option>
                        <option value="UNSURE">判定不能</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Action Buttons for Student Practice */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const report = gradeStudentMeasurementSubmission(
                        simulatedCase,
                        studentSub,
                        tolerance
                      );
                      setGradingReport(report);
                    }}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm cursor-pointer"
                  >
                    📝 採点する (Grade Submission)
                  </button>
                  <button
                    type="button"
                    onClick={handleAutofillExpectedForTeacher}
                    className="px-2.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                    title="正解値を自動入力して確認（教員用機能）"
                  >
                    模範解答を入力
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSub(createBlankStudentSubmission());
                      setGradingReport(null);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                  >
                    リセット
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (xl:col-span-8): Top Bar + A4 ECG Sheet Preview + Question Set Manager */}
          <div className="xl:col-span-8 space-y-4">
            {/* Top Action Bar & Scale Verification Banner */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-900 text-xs font-mono font-bold">
                  25 mm/s · 10 mm/mV (固定)
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
                  1mV較正波: 10mm×5mm
                </span>
                <span className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono font-semibold">
                  10s Lead II リズムストリップ (250mm)
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                  {examModePreview
                    ? '🔒 Exam Mode ON (解答完全非表示)'
                    : '👁 教員プレビュー表示中 (出力時は自動で非表示)'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddQuestion(activeCase.presetId)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm cursor-pointer"
                >
                  ➕ 問題集へ追加 (全{questions.length}問)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportExamCaseToPngDownload(
                      activeCase,
                      showQuestionLabelOnSheet
                        ? activeCase.questionLabel?.trim() || `Question ${activeIndex + 1}`
                        : undefined
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm cursor-pointer"
                >
                  🖼 単問PNG出力 (300 DPI)
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintJapaneseWorksheet([activeCase])}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  🖨️ 日本語ワークシート印刷 (A4横)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const singlePdf = buildExamQuestionSetPdfBytes(
                      [activeCase],
                      showQuestionLabelOnSheet
                    );
                    triggerBrowserDownload(
                      singlePdf,
                      `ecg_exam_question_${activeIndex + 1}_seed_${activeCase.seed}.pdf`,
                      'application/pdf'
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 shadow-sm cursor-pointer"
                >
                  📄 単問PDF出力 (A4横)
                </button>
              </div>
            </div>

            {/* A4 Landscape 12-Lead Exam Sheet Preview */}
            <div className="bg-slate-900 rounded-2xl p-3 shadow-md">
              <div
                className="w-full bg-white rounded-xl overflow-hidden shadow-inner border border-slate-300"
                style={{ aspectRatio: '297 / 210' }}
                dangerouslySetInnerHTML={{ __html: sheetSvg }}
              />
            </div>

            {/* Bottom Panel: Multi-Question Exam Set Manager OR Student Practice Grading Report */}
            {appWorkspaceTab === 'AUTHOR_BUILDER' ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      問題集マネージャー (Question Set — 全{questions.length}問)
                    </h3>
                    <input
                      type="text"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-900 bg-white"
                      placeholder="問題集タイトル"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportQuestionPdf}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm cursor-pointer"
                    >
                      📕 問題集PDF出力 (解答なし・1問1ページ)
                    </button>
                    <button
                      type="button"
                      onClick={handleExportAnswerKeyPdf}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm cursor-pointer"
                    >
                      📗 解答一覧PDF出力 (Answer Key 別ファイル)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintJapaneseWorksheet(questions)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm cursor-pointer"
                    >
                      🖨️ 全問日本語ワークシート印刷 / PDF
                    </button>
                    <button
                      type="button"
                      onClick={handleExportWorksheetPdf}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 shadow-sm cursor-pointer"
                    >
                      📝 ワークシートPDF直接保存
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                    >
                      💾 JSON保存
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                    >
                      📂 JSON読込
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportJsonFile}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Quick Add Pack Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                  <button
                    type="button"
                    onClick={() => handleAddQuestion(activeCase.presetId)}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    + 1問追加
                  </button>
                  <button
                    type="button"
                    onClick={handleAddRepresentative10Pack}
                    className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-100 border border-sky-300 text-xs font-bold text-sky-800 cursor-pointer"
                  >
                    + 代表10症例パックを一括追加
                  </button>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('全問題をクリアして初期化しますか？')) {
                          setQuestions([createDefaultExamCase('NORMAL_SINUS', 202601)]);
                          setActiveIndex(0);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-700 cursor-pointer ml-auto"
                    >
                      全問クリア
                    </button>
                  )}
                </div>

                {/* Questions Scrollable List */}
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {questions.map((q, idx) => {
                    const meta = CLINICAL_PRESETS[q.presetId];
                    const isCurrent = idx === activeIndex;
                    const { noiseText, electrodeText } = describeExamCaseModifiers(q);
                    return (
                      <div
                        key={q.id}
                        className={`py-2 px-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg transition ${
                          isCurrent
                            ? 'bg-blue-50/80 border border-blue-200'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                              isCurrent
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-900 text-white'
                            }`}
                          >
                            問 {idx + 1}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-slate-900">
                              {examModePreview
                                ? `[Exam Mode マスク中] Seed: ${q.seed} (解答一覧PDFに出力)`
                                : `${meta.nameJa} (${q.presetId}) — Seed: ${q.seed}`}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              PAC:{q.pacCount} | PVC:{q.pvcCount}{q.pvcCount > 0 ? ` (${q.pvcOrigin === 'LV' ? '左室' : '右室'})` : ''} | 電極:{electrodeText} |
                              ノイズ:{noiseText}
                              {q.examinerNote ? ` | メモ: ${q.examinerNote}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveIndex(idx);
                              setGradingReport(null);
                            }}
                            className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 cursor-pointer"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, -1)}
                            disabled={idx === 0}
                            className="px-1.5 py-1 rounded bg-slate-100 text-slate-700 text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, 1)}
                            disabled={idx === questions.length - 1}
                            className="px-1.5 py-1 rounded bg-slate-100 text-slate-700 text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateQuestionAt(idx)}
                            className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 cursor-pointer"
                          >
                            複製
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(idx)}
                            disabled={questions.length <= 1}
                            className="px-2 py-1 rounded bg-rose-50 text-rose-700 text-[11px] font-bold hover:bg-rose-100 disabled:opacity-40 cursor-pointer"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Student Practice Grading Report */
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    自動採点・正誤詳細フィードバック
                  </h3>
                  <button
                    type="button"
                    onClick={handleExportWorksheetPdf}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm cursor-pointer"
                  >
                    📝 計測ワークシートPDFを印刷
                  </button>
                </div>

                {gradingReport ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-extrabold text-emerald-900">
                          総合スコア: {gradingReport.scorePercent} 点 (
                          {gradingReport.passedChecks} / {gradingReport.totalChecks} 項目合格)
                        </span>
                        <p className="text-xs text-emerald-700">
                          判定: {gradingReport.scorePercent >= 70 ? '【合格】' : '【不合格】'} (合格ライン: 70点)
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-white border border-emerald-300 text-emerald-800">
                        正解率 {(gradingReport.passedChecks / gradingReport.totalChecks * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                      {gradingReport.items.map((it) => (
                        <div
                          key={it.id}
                          className={`p-2.5 flex flex-wrap items-start justify-between gap-2 ${
                            it.passed ? 'bg-white' : 'bg-rose-50/50'
                          }`}
                        >
                          <div>
                            <div className="font-bold flex items-center gap-1.5 text-slate-900">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  it.passed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {it.passed ? '正解 ✓' : '不正解 ✗'}
                              </span>
                              <span>
                                {it.sectionTitle} — {it.fieldLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">
                              {it.feedbackJa}
                            </p>
                          </div>

                          <div className="text-right font-mono text-[11px]">
                            <div className="text-slate-700">
                              あなたの回答: <span className="font-bold">{it.studentValueText}</span>
                            </div>
                            <div className="text-slate-500">
                              模範解答: {it.expectedValueText}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    左側パネルで計測値を入力後、「採点する」ボタンを押すと詳細な正誤判定と解説が表示されます。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
