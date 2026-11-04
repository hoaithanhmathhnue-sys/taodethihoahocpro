import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { AlertTriangle, ChevronDown, ChevronUp, Download, FileText, Shuffle } from 'lucide-react';
import {
  AnswerBook,
  buildAnswerKeyDocument,
  ExamVersion,
  generateExamVersions,
  missingAnswers,
  parseExamForShuffle,
  QKind,
  TfLetter,
} from '../services/examShuffle';
import { contentToDocxBlob } from '../services/exportUtils';
import MathFormatSelect from './MathFormatSelect';

export interface ShuffleDocument {
  id: string;
  label: string;
  /** Nội dung đề (có thể gồm cả đáp án ở cuối) */
  exam: string;
  /** Đáp án / lời giải nếu nằm riêng */
  answers?: string;
}

const TF_ORDER: TfLetter[] = ['a', 'b', 'c', 'd'];
const MAX_VERSIONS = 24;

const cloneAnswers = (a: AnswerBook): AnswerBook => JSON.parse(JSON.stringify(a));
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 80) || 'De_thi';

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

/** "dsds", "Đ S Đ S" → ["Đ","S","Đ","S"] */
const parseTfInput = (v: string): string[] =>
  (v.toUpperCase().replace(/D/g, 'Đ').match(/[ĐS]/g) || []).slice(0, 4);

const ShuffleExamPanel: React.FC<{ documents: ShuffleDocument[]; baseName: string; className?: string; levelOf?: (kind: QKind, num: number) => string | undefined }> = ({ documents, baseName, className = '', levelOf }) => {
  const [open, setOpen] = useState(false);
  const [docId, setDocId] = useState(documents[0]?.id || '');
  const [count, setCount] = useState(4);
  const [startCode, setStartCode] = useState(101);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [shuffleStatements, setShuffleStatements] = useState(true);
  const [answers, setAnswers] = useState<AnswerBook>({ mc: {}, tf: {}, short: {} });
  const [versions, setVersions] = useState<ExamVersion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);

  const doc = documents.find(d => d.id === docId) || documents[0];
  const exam = useMemo(() => (open && doc ? parseExamForShuffle(doc.exam, doc.answers) : null), [open, doc?.exam, doc?.answers]);

  useEffect(() => {
    setVersions([]);
    setError('');
    if (exam) {
      setAnswers(cloneAnswers(exam.answers));
      // Mở sẵn khung đáp án khi có chỗ cần kiểm tra; sau đó để giáo viên tự đóng/mở
      setShowKey(missingAnswers(exam).length > 0 || exam.conflicts.length > 0);
    }
  }, [exam]);

  if (!doc) return null;

  const counts = exam
    ? {
        mc: exam.questions.filter(q => q.kind === 'mc'),
        tf: exam.questions.filter(q => q.kind === 'tf'),
        short: exam.questions.filter(q => q.kind === 'short'),
        essay: exam.questions.filter(q => q.kind === 'essay').length,
      }
    : null;
  const missing = exam ? missingAnswers(exam, answers) : [];
  const fileBase = safeName(baseName);
  const clampedCount = Math.min(MAX_VERSIONS, Math.max(1, count || 1));

  const updateAnswers = (fn: (draft: AnswerBook) => void) => {
    const draft = cloneAnswers(answers);
    fn(draft);
    setAnswers(draft);
    setVersions([]);
  };

  const handleGenerate = () => {
    if (!exam) return;
    setVersions(generateExamVersions(exam, answers, { count: clampedCount, startCode: startCode || 101, shuffleQuestions, shuffleOptions, shuffleStatements, levelOf }));
    setError('');
  };

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await task();
    } catch (e: any) {
      setError(`Không tạo được file: ${e?.message || 'lỗi không xác định'}`);
    } finally {
      setBusy(null);
    }
  };

  const answerDocTitle = `${baseName.replace(/_/g, ' ')} (${versions[0]?.code || ''}–${versions[versions.length - 1]?.code || ''})`;
  const answerBlob = () => contentToDocxBlob(buildAnswerKeyDocument(exam!, versions, answerDocTitle), `${fileBase}_Dap_an`);

  const downloadVersion = (v: ExamVersion) =>
    run(`Đang tạo mã đề ${v.code}…`, async () => {
      saveBlob(await contentToDocxBlob(v.content, `${fileBase}_Ma_de_${v.code}`, { examLayout: true, footer: `Mã đề ${v.code}` }), `${fileBase}_Ma_de_${v.code}.docx`);
    });

  const downloadKey = () =>
    run('Đang tạo file đáp án…', async () => {
      saveBlob(await answerBlob(), `${fileBase}_Dap_an.docx`);
    });

  const downloadAll = () =>
    run('Đang tạo file…', async () => {
      const zip = new JSZip();
      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        setBusy(`Đang tạo mã đề ${v.code} (${i + 1}/${versions.length})…`);
        zip.file(`${fileBase}_Ma_de_${v.code}.docx`, await contentToDocxBlob(v.content, `${fileBase}_Ma_de_${v.code}`, { examLayout: true, footer: `Mã đề ${v.code}` }));
      }
      setBusy('Đang tạo file đáp án…');
      zip.file(`${fileBase}_Dap_an.docx`, await answerBlob());
      saveBlob(await zip.generateAsync({ type: 'blob' }), `${fileBase}_Dao_de.zip`);
    });

  const inputBase = 'border rounded px-1 py-0.5 text-center text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-400';
  const inputClass = (ok: boolean) => `${inputBase} ${ok ? 'border-slate-300' : 'border-red-400 bg-red-50'}`;

  return (
    <div className={`card-elevated flex-shrink-0 ${className}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="flex items-center gap-2 font-bold text-teal-800 text-sm">
          <Shuffle className="w-4 h-4" /> Đảo đề
          <span className="font-normal text-slate-500 text-xs">Tạo nhiều mã đề và file đáp án từ đề này</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && exam && counts && (
        <div className="px-3 pb-3 space-y-3 max-h-[55vh] overflow-y-auto text-sm border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            {documents.length > 1 && (
              <label className="text-xs text-slate-600">
                <span className="block mb-1">Đề gốc</span>
                <select value={doc.id} onChange={e => setDocId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1 bg-white text-xs">
                  {documents.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-600">
              <span className="block mb-1">Số mã đề (tối đa {MAX_VERSIONS})</span>
              <input type="number" min={1} max={MAX_VERSIONS} value={count} onChange={e => { setCount(parseInt(e.target.value, 10) || 0); setVersions([]); }} onBlur={() => setCount(clampedCount)} className="w-20 border border-slate-300 rounded-md px-2 py-1 bg-white text-xs" />
            </label>
            <label className="text-xs text-slate-600">
              <span className="block mb-1">Mã đề đầu tiên</span>
              <input type="number" min={1} value={startCode} onChange={e => { setStartCode(parseInt(e.target.value, 10) || 0); setVersions([]); }} className="w-20 border border-slate-300 rounded-md px-2 py-1 bg-white text-xs" />
            </label>
            <MathFormatSelect className="pb-1" />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={shuffleQuestions} onChange={e => { setShuffleQuestions(e.target.checked); setVersions([]); }} /> Đảo thứ tự câu</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={shuffleOptions} onChange={e => { setShuffleOptions(e.target.checked); setVersions([]); }} /> Đảo phương án A, B, C, D</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={shuffleStatements} onChange={e => { setShuffleStatements(e.target.checked); setVersions([]); }} /> Đảo ý a, b, c, d (Đúng – Sai)</label>
          </div>

          {exam.questions.length === 0 ? (
            <div className="p-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
              Không nhận ra câu hỏi nào trong đề này (cần dạng "Câu 1." hoặc "Question 1."), nên chưa đảo được.
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Đọc được: {counts.mc.length} câu trắc nghiệm, {counts.tf.length} câu Đúng – Sai, {counts.short.length} câu trả lời ngắn
              {counts.essay > 0 ? `, ${counts.essay} câu tự luận (giữ nguyên)` : ''}.
            </p>
          )}

          {(exam.notes.length > 0 || exam.conflicts.length > 0 || missing.length > 0) && (
            <div className="p-2 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs space-y-1" role="alert">
              <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Cần kiểm tra trước khi dùng</div>
              {missing.length > 0 && <div>Chưa có đáp án: {missing.join(', ')}. Nhập vào ô đỏ bên dưới, nếu không file đáp án sẽ hiện dấu "?".</div>}
              {exam.conflicts.map(c => <div key={c}>{c}. App đang lấy giá trị đầu tiên, hãy sửa lại nếu cần.</div>)}
              {exam.notes.map(n => <div key={n}>{n}</div>)}
            </div>
          )}

          {exam.questions.length > 0 && (
            <details open={showKey} onToggle={e => setShowKey(e.currentTarget.open)} className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Đáp án đề gốc (kiểm tra, sửa nếu cần)</summary>
              <div className="mt-2 space-y-2">
                {counts.mc.length > 0 && (
                  <div>
                    <div className="mb-1 text-slate-600">Trắc nghiệm</div>
                    <div className="flex flex-wrap gap-1.5">
                      {counts.mc.map(q => (
                        <label key={`mc${q.num}`} className="flex items-center gap-1">
                          <span className="text-slate-500">{q.num}</span>
                          <input aria-label={`Đáp án trắc nghiệm câu ${q.num}`} maxLength={1} value={answers.mc[q.num] || ''} onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-D]/g, ''); updateAnswers(d => { if (v) d.mc[q.num] = v; else delete d.mc[q.num]; }); }} className={`w-7 ${inputClass(!!answers.mc[q.num])}`} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {counts.tf.length > 0 && (
                  <div>
                    <div className="mb-1 text-slate-600">Đúng – Sai (a b c d)</div>
                    <div className="flex flex-wrap gap-2">
                      {counts.tf.map(q => {
                        const row = answers.tf[q.num] || {};
                        const shown = TF_ORDER.map(l => row[l] || '').join('');
                        return (
                          <label key={`tf${q.num}`} className="flex items-center gap-1">
                            <span className="text-slate-500">{q.num}</span>
                            <input aria-label={`Đáp án Đúng – Sai câu ${q.num}`} value={shown} onChange={e => { const vals = parseTfInput(e.target.value); updateAnswers(d => { d.tf[q.num] = {}; vals.forEach((v, i) => { d.tf[q.num][TF_ORDER[i]] = v; }); }); }} className={`w-14 ${inputClass(shown.length === 4)}`} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {counts.short.length > 0 && (
                  <div>
                    <div className="mb-1 text-slate-600">Trả lời ngắn</div>
                    <div className="flex flex-wrap gap-2">
                      {counts.short.map(q => (
                        <label key={`short${q.num}`} className="flex items-center gap-1">
                          <span className="text-slate-500">{q.num}</span>
                          <input aria-label={`Đáp án trả lời ngắn câu ${q.num}`} value={answers.short[q.num] || ''} onChange={e => { const v = e.target.value; updateAnswers(d => { if (v) d.short[q.num] = v; else delete d.short[q.num]; }); }} className={`w-20 ${inputClass(!!answers.short[q.num])}`} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleGenerate} disabled={exam.questions.length === 0 || !!busy} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white hover:bg-teal-700 rounded-lg text-sm font-medium disabled:opacity-50">
              <Shuffle className="w-4 h-4" /> Tạo {clampedCount} mã đề
            </button>
            {busy && <span className="text-xs text-teal-700" role="status">{busy}</span>}
          </div>

          {error && <div className="p-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs" role="alert">{error}</div>}

          {versions.length > 0 && (
            <div className="p-2 rounded-lg bg-teal-50 border border-teal-100 space-y-2">
              <div className="text-xs text-teal-900 font-semibold">Đã tạo {versions.length} mã đề. Tải về:</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={downloadAll} disabled={!!busy} className="flex items-center gap-1 px-2.5 py-1 bg-teal-600 text-white hover:bg-teal-700 rounded-md text-xs font-medium disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" /> Tất cả (.zip)
                </button>
                <button type="button" onClick={downloadKey} disabled={!!busy} className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-md text-xs font-medium disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" /> File đáp án
                </button>
                {versions.map(v => (
                  <button key={v.code} type="button" onClick={() => downloadVersion(v)} disabled={!!busy} className="px-2.5 py-1 bg-white border border-teal-200 text-teal-800 hover:bg-teal-100 rounded-md text-xs font-medium disabled:opacity-50">
                    Mã {v.code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShuffleExamPanel;
