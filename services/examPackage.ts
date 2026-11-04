/**
 * XUẤT TRỌN BỘ HỒ SƠ KHẢO THÍ (5 trong 1), đóng gói một file .zip:
 *  1. Đề gốc + các mã đề trộn (.docx, .pdf)
 *  2. Ma trận và Bản đặc tả (.docx, .xlsx)
 *  3. Bảng đáp án (.docx) + file Excel chấm máy (.xlsx)
 *  4. Hướng dẫn giải chi tiết (.docx, .pdf)
 *  5. Phiếu trả lời trắc nghiệm (.pdf)
 */
import JSZip from 'jszip';
import { buildAnswerKeyDocument, ExamVersion, ParsedExam, QKind, TfLetter } from './examShuffle';
import { resolveContracts } from './matrixContract';
import { contentToDocxBlob } from './exportUtils';
import { htmlToPdfBlob, svgPagesToPdfBlob } from './pdfExport';
import { buildAnswerSheetPages } from './answerSheet';
import { buildXlsxBlob, htmlTableToSheet, SheetData } from './xlsxWriter';
import { ExamHeaderProfile, splitExamAndKey } from './examLayout';

const TF_ORDER: TfLetter[] = ['a', 'b', 'c', 'd'];

interface KeyColumn {
  code: string;
  mc: Record<number, string>;
  tf: Record<number, string[]>;
  short: Record<number, string>;
}

const baseColumn = (exam: ParsedExam): KeyColumn => ({
  code: 'Đề gốc',
  mc: { ...exam.answers.mc },
  tf: Object.fromEntries(Object.entries(exam.answers.tf).map(([n, row]) => [n, TF_ORDER.map(l => row[l] || '')])),
  short: { ...exam.answers.short },
});

const versionColumn = (v: ExamVersion): KeyColumn => {
  const col: KeyColumn = { code: v.code, mc: {}, tf: {}, short: {} };
  v.questions.forEach(q => {
    if (q.kind === 'mc') col.mc[q.num] = q.answer;
    if (q.kind === 'tf') col.tf[q.num] = q.answer.split(' ');
    if (q.kind === 'short') col.short[q.num] = q.answer;
  });
  return col;
};

/** Mức độ từng câu đọc từ ma trận: dùng để đảo câu mà vẫn giữ trật tự Biết → Hiểu → Vận dụng. */
export const buildLevelOf = (matrixHtml?: string, specsHtml?: string) => {
  const contract = resolveContracts(matrixHtml, specsHtml).primary;
  if (!contract?.ok) return undefined;
  return (kind: QKind, num: number): string | undefined => {
    const list = kind === 'mc' ? contract.questions.I : kind === 'short' ? contract.questions.III : null;
    return list?.find(q => q.num === num)?.items[0]?.level;
  };
};

const numbersOf = (exam: ParsedExam, kind: 'mc' | 'tf' | 'short') => exam.questions.filter(q => q.kind === kind).map(q => q.num);

/** Bảng đáp án cho phần mềm chấm: hàng là câu, cột là mã đề; thêm một trang dạng dọc để lọc, nhập tay. */
export const buildAnswerKeySheets = (exam: ParsedExam, versions: ExamVersion[], points: Record<'mc' | 'tf' | 'short', number>): SheetData[] => {
  const cols = versions.length ? versions.map(versionColumn) : [baseColumn(exam)];
  const mcNums = numbersOf(exam, 'mc');
  const tfNums = numbersOf(exam, 'tf');
  const shortNums = numbersOf(exam, 'short');
  const head = ['Câu', ...cols.map(c => c.code)];

  const grid: SheetData['rows'] = [head];
  mcNums.forEach(n => grid.push([`I.${n}`, ...cols.map(c => c.mc[n] || '')]));
  tfNums.forEach(n => TF_ORDER.forEach((l, i) => grid.push([`II.${n}${l}`, ...cols.map(c => c.tf[n]?.[i] || '')])));
  shortNums.forEach(n => grid.push([`III.${n}`, ...cols.map(c => c.short[n] || '')]));

  const long: SheetData['rows'] = [['Mã đề', 'Phần', 'Câu', 'Ý', 'Đáp án']];
  cols.forEach(c => {
    mcNums.forEach(n => long.push([c.code, 'I', n, '', c.mc[n] || '']));
    tfNums.forEach(n => TF_ORDER.forEach((l, i) => long.push([c.code, 'II', n, l, c.tf[n]?.[i] || ''])));
    shortNums.forEach(n => long.push([c.code, 'III', n, '', c.short[n] || '']));
  });

  const scoring: SheetData['rows'] = [
    ['Phần', 'Số câu', 'Điểm', 'Cách tính'],
    ['I', mcNums.length, points.mc, mcNums.length ? `Mỗi câu đúng ${(points.mc / mcNums.length).toString().replace('.', ',')} điểm` : ''],
    ['II', tfNums.length, points.tf, 'Đúng 1 ý được 10%, 2 ý 25%, 3 ý 50%, 4 ý 100% số điểm của câu'],
    ['III', shortNums.length, points.short, shortNums.length ? `Mỗi câu đúng ${(points.short / shortNums.length).toString().replace('.', ',')} điểm` : ''],
  ];

  return [
    { name: 'Dap_an_theo_ma_de', rows: grid, colWidths: [10, ...cols.map(() => 9)] },
    { name: 'Dap_an_dang_doc', rows: long, colWidths: [10, 8, 8, 6, 10] },
    { name: 'Thang_diem', rows: scoring, colWidths: [8, 8, 8, 60] },
  ];
};

export interface PackageInput {
  baseName: string;
  examTitle: string;
  examHtml: string;
  matrixHtml: string;
  specsHtml: string;
  exam: ParsedExam;
  versions: ExamVersion[];
  /** Hướng dẫn giải của các biến thể số liệu */
  extraKeys?: Array<{ label: string; html: string }>;
  profile: ExamHeaderProfile;
  points: { mc: number; tf: number; short: number };
  /** Tạo cả PDF cho từng mã đề (nặng, mặc định chỉ đề gốc) */
  pdfForVersions: boolean;
  onProgress: (message: string) => void;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 70) || 'De_thi';

export const buildExamPackage = async (input: PackageInput): Promise<Blob> => {
  const { baseName, exam, versions, profile, onProgress } = input;
  const zip = new JSZip();
  const name = safe(baseName);
  const { exam: examOnly, key } = splitExamAndKey(input.examHtml);

  // 1. Đề
  onProgress('Đang tạo đề gốc (Word, PDF)…');
  const folder1 = zip.folder('1_De_thi_va_ma_de')!;
  folder1.file(`${name}_De_goc.docx`, await contentToDocxBlob(examOnly, `${name}_De_goc`, { examLayout: true, footer: 'Đề gốc' }));
  folder1.file(`${name}_De_goc.pdf`, await htmlToPdfBlob(examOnly, { examLayout: true, footer: 'Đề gốc' }));
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    onProgress(`Đang tạo mã đề ${v.code} (${i + 1}/${versions.length})…`);
    const { exam: versionExam } = splitExamAndKey(v.content);
    folder1.file(`${name}_Ma_de_${v.code}.docx`, await contentToDocxBlob(versionExam, `${name}_Ma_de_${v.code}`, { examLayout: true, footer: `Mã đề ${v.code}` }));
    if (input.pdfForVersions) folder1.file(`${name}_Ma_de_${v.code}.pdf`, await htmlToPdfBlob(versionExam, { examLayout: true, footer: `Mã đề ${v.code}` }));
  }

  // 2. Ma trận, đặc tả
  onProgress('Đang tạo Ma trận và Bản đặc tả…');
  const folder2 = zip.folder('2_Ma_tran_Dac_ta')!;
  const sheets: SheetData[] = [];
  if (input.matrixHtml) {
    folder2.file(`${name}_Ma_tran.docx`, await contentToDocxBlob(input.matrixHtml, `${name}_Ma_tran`, { landscape: true }));
    const s = htmlTableToSheet(input.matrixHtml, 'Ma_tran');
    if (s) sheets.push(s);
  }
  if (input.specsHtml) {
    folder2.file(`${name}_Dac_ta.docx`, await contentToDocxBlob(input.specsHtml, `${name}_Dac_ta`, { landscape: true }));
    const s = htmlTableToSheet(input.specsHtml, 'Dac_ta');
    if (s) sheets.push(s);
  }
  if (sheets.length) folder2.file(`${name}_Ma_tran_Dac_ta.xlsx`, await buildXlsxBlob(sheets));

  // 3. Đáp án, chấm máy
  onProgress('Đang tạo bảng đáp án và file chấm máy…');
  const folder3 = zip.folder('3_Dap_an_Cham_may')!;
  if (versions.length) {
    const title = `${input.examTitle} (${versions[0].code}–${versions[versions.length - 1].code})`;
    folder3.file(`${name}_Bang_dap_an_theo_ma_de.docx`, await contentToDocxBlob(buildAnswerKeyDocument(exam, versions, title), `${name}_Bang_dap_an`));
  }
  folder3.file(`${name}_Cham_may.xlsx`, await buildXlsxBlob(buildAnswerKeySheets(exam, versions, input.points)));

  // 4. Hướng dẫn giải
  onProgress('Đang tạo Hướng dẫn giải chi tiết…');
  const folder4 = zip.folder('4_Huong_dan_giai')!;
  if (key) {
    folder4.file(`${name}_Huong_dan_giai.docx`, await contentToDocxBlob(key, `${name}_Huong_dan_giai`));
    folder4.file(`${name}_Huong_dan_giai.pdf`, await htmlToPdfBlob(key));
  }
  for (const extra of input.extraKeys || []) {
    const variantKey = splitExamAndKey(extra.html).key;
    if (variantKey) folder4.file(`${name}_Huong_dan_giai_${extra.label}.docx`, await contentToDocxBlob(variantKey, `${name}_${extra.label}`));
  }

  // 5. Phiếu trả lời
  onProgress('Đang tạo Phiếu trả lời…');
  const counts = {
    mc: numbersOf(exam, 'mc').length,
    tf: numbersOf(exam, 'tf').length,
    short: numbersOf(exam, 'short').length,
    essay: exam.questions.filter(q => q.kind === 'essay').length,
  };
  zip.folder('5_Phieu_tra_loi')!.file(`${name}_Phieu_tra_loi.pdf`, await svgPagesToPdfBlob(buildAnswerSheetPages(profile, counts, input.examTitle)));

  onProgress('Đang đóng gói…');
  return zip.generateAsync({ type: 'blob' });
};
