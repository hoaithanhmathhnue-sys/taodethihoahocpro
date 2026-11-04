import React, { useMemo, useState } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import type { InputData } from '../types';
import { ExamVersion, generateExamVersions, missingAnswers, parseExamForShuffle } from '../services/examShuffle';
import { buildExamPackage, buildLevelOf } from '../services/examPackage';
import { getExamHeaderProfile } from '../services/examLayout';
import { computeCv7991Layout } from '../services/cv7991Template';
import { generateNumericVariant } from '../services/geminiService';

interface Props {
  examHtml: string;
  matrixHtml: string;
  specsHtml: string;
  inputData: InputData;
  baseName: string;
  className?: string;
}

const CODE_CHOICES = [0, 4, 8, 24];

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Một lần bấm: đề + mã đề, ma trận + đặc tả, đáp án + Excel chấm máy, hướng dẫn giải, phiếu trả lời. */
const ExamPackagePanel: React.FC<Props> = ({ examHtml, matrixHtml, specsHtml, inputData, baseName, className = '' }) => {
  const [codeCount, setCodeCount] = useState(4);
  const [startCode, setStartCode] = useState(101);
  const [variantCount, setVariantCount] = useState(1);
  const [pdfForVersions, setPdfForVersions] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const exam = useMemo(() => parseExamForShuffle(examHtml), [examHtml]);
  const missing = useMemo(() => missingAnswers(exam), [exam]);
  const levelOf = useMemo(() => buildLevelOf(matrixHtml, specsHtml), [matrixHtml, specsHtml]);

  const run = async () => {
    setBusy('Đang chuẩn bị…');
    setError('');
    setDone('');
    try {
      const shuffleOpts = { startCode, shuffleQuestions: true, shuffleOptions: true, shuffleStatements: true, levelOf };
      let versions: ExamVersion[] = [];
      const extraKeys: Array<{ label: string; html: string }> = [];
      if (codeCount > 0) {
        const sources = [examHtml];
        for (let i = 1; i < variantCount; i++) {
          setBusy(`Đang tạo biến thể số liệu ${i + 1}/${variantCount} bằng AI…`);
          sources.push(await generateNumericVariant(examHtml, inputData, i + 1));
        }
        // Chia đều mã đề cho các biến thể, mã đề nối tiếp nhau
        let nextCode = startCode;
        sources.forEach((source, i) => {
          const count = Math.floor(codeCount / sources.length) + (i < codeCount % sources.length ? 1 : 0);
          const parsed = i === 0 ? exam : parseExamForShuffle(source);
          versions.push(...generateExamVersions(parsed, parsed.answers, { ...shuffleOpts, count, startCode: nextCode }));
          if (i > 0) extraKeys.push({ label: `Bien_the_${i + 1}_ma_${nextCode}_${nextCode + count - 1}`, html: source });
          nextCode += count;
        });
      }
      const points = { mc: 0, tf: 0, short: 0 };
      computeCv7991Layout(inputData.questionConfig, true).types.forEach(t => {
        if (t.key === 'type1') points.mc = t.points;
        if (t.key === 'type2') points.tf = t.points;
        if (t.key === 'type3') points.short = t.points;
      });
      const blob = await buildExamPackage({
        baseName,
        examTitle: `Môn Hóa học${inputData.grade ? ` – Lớp ${inputData.grade}` : ''} – ${inputData.examType}`,
        examHtml,
        matrixHtml,
        specsHtml,
        exam,
        versions,
        extraKeys,
        profile: getExamHeaderProfile(),
        points,
        pdfForVersions,
        onProgress: setBusy,
      });
      saveBlob(blob, `${baseName}_Ho_so_khao_thi.zip`);
      setDone(`Đã tạo xong hồ sơ${versions.length ? ` với ${versions.length} mã đề` : ''}. Hãy kiểm tra thư mục Tải xuống.`);
    } catch (e: any) {
      setError(`Không tạo được hồ sơ: ${e?.message || 'lỗi không xác định'}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`card-elevated flex-shrink-0 p-3 space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Package className="w-4 h-4 text-teal-700" />
        <span className="font-bold text-teal-800 text-sm">Xuất trọn bộ hồ sơ khảo thí (5 trong 1)</span>
        <span className="text-xs text-slate-500">Đề và mã đề · Ma trận, đặc tả · Đáp án, Excel chấm máy · Hướng dẫn giải · Phiếu trả lời</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs text-slate-700">
        <label>
          <span className="block mb-1">Số mã đề trộn</span>
          <select value={codeCount} onChange={e => setCodeCount(Number(e.target.value))} className="border border-slate-300 rounded-md px-2 py-1 bg-white">
            {CODE_CHOICES.map(n => <option key={n} value={n}>{n === 0 ? 'Không trộn' : `${n} mã đề`}</option>)}
          </select>
        </label>
        <label>
          <span className="block mb-1">Mã đề đầu tiên</span>
          <input type="number" min={1} value={startCode} onChange={e => setStartCode(parseInt(e.target.value, 10) || 101)} className="w-20 border border-slate-300 rounded-md px-2 py-1 bg-white" />
        </label>
        <label title="AI đổi số liệu Phần II và Phần III, tính lại đáp án. Mỗi biến thể tốn thêm một lượt gọi AI.">
          <span className="block mb-1">Biến thể số liệu Phần II, III</span>
          <select value={variantCount} onChange={e => setVariantCount(Number(e.target.value))} disabled={codeCount === 0} className="border border-slate-300 rounded-md px-2 py-1 bg-white">
            <option value={1}>Không đổi số liệu</option>
            <option value={2}>2 biến thể</option>
            <option value={3}>3 biến thể</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={pdfForVersions} onChange={e => setPdfForVersions(e.target.checked)} disabled={codeCount === 0} />
          Thêm PDF cho từng mã đề (file nặng hơn)
        </label>
        <button type="button" onClick={run} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white hover:bg-teal-700 rounded-lg text-sm font-medium disabled:opacity-50">
          <Package className="w-4 h-4" /> {busy ? 'Đang tạo…' : 'Xuất trọn bộ (.zip)'}
        </button>
      </div>

      {busy && <p className="text-xs text-teal-700" role="status">{busy}</p>}
      {done && <p className="text-xs text-emerald-700" role="status">{done}</p>}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2" role="alert">{error}</p>}
      {missing.length > 0 && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-1.5" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          App chưa đọc được đáp án của: {missing.slice(0, 8).join(', ')}{missing.length > 8 ? '…' : ''}. Bảng đáp án sẽ để trống các câu này; hãy nhập ở mục Đảo đề hoặc tạo lại đề.
        </p>
      )}
    </div>
  );
};

export default ExamPackagePanel;
