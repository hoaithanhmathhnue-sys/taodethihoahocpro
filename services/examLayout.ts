/**
 * CHẾ BẢN ĐỀ THI: khung tiêu đề trường lớp, dòng nguyên tử khối, "--- HẾT ---", tách đề / đáp án,
 * chia cột phương án bằng Tab chuẩn, giữ trọn câu trên một trang.
 * Thuần chuỗi (không cần DOM) để chạy được trong kiểm thử Node.
 */
import { ATOMIC_MASSES, ELEMENT_NAMES, ELEMENT_ORDER } from '../data/chemistryReference';
import { parseAtoms } from './chemGuardrails';
import { ParsedExam, parseExamForShuffle } from './examShuffle';

/* ---------------------------- Mẫu tiêu đề của giáo viên ---------------------------- */

export interface ExamHeaderProfile {
  department: string;
  school: string;
  group: string;
  schoolYear: string;
  showInvigilator: boolean;
  /** Dòng ghi ở chân trang (thêm vào sau số trang) */
  footerNote: string;
}

const PROFILE_KEY = 'chem_exam_header_profile';

export const DEFAULT_HEADER_PROFILE: ExamHeaderProfile = {
  department: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO ......................',
  school: 'TRƯỜNG THPT NGUYỄN THƯỢNG HIỀN',
  group: 'TỔ HÓA HỌC',
  schoolYear: '20... - 20...',
  showInvigilator: true,
  footerNote: '',
};

export const getExamHeaderProfile = (): ExamHeaderProfile => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_HEADER_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_HEADER_PROFILE };
  } catch {
    return { ...DEFAULT_HEADER_PROFILE };
  }
};

export const saveExamHeaderProfile = (profile: ExamHeaderProfile): void => {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn dùng được trong phiên hiện tại
  }
};

export interface ExamMeta {
  examType: string;
  grade: string;
  duration: number;
}

const examTitleOf = (meta: ExamMeta): string => {
  const t = meta.examType || '';
  if (/tốt\s*nghiệp/i.test(t)) return 'ĐỀ ÔN THI TỐT NGHIỆP THPT';
  if (/thường\s*xuyên/i.test(t)) return 'ĐỀ KIỂM TRA THƯỜNG XUYÊN';
  if (/giữa/i.test(t)) return `ĐỀ KIỂM TRA GIỮA HỌC KÌ ${/1/.test(t) ? 'I' : 'II'}`;
  if (/cuối/i.test(t)) return `ĐỀ KIỂM TRA CUỐI HỌC KÌ ${/1/.test(t) ? 'I' : 'II'}`;
  return `ĐỀ KIỂM TRA ${t.toUpperCase()}`.trim();
};

const HEADER_FONT = `font-family:'Times New Roman',serif;font-size:12.5pt;`;
const NO_BORDER = `border:none;padding:1pt 3pt;vertical-align:top;${HEADER_FONT}`;

/** Chuỗi "H = 1; C = 12; ..." cho các nguyên tố có mặt trong đề. */
export const atomicMassLine = (examHtml: string): string => {
  const text = examHtml
    .replace(/<(script|style|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<sub\b[^>]*>(.*?)<\/sub>/gi, '$1')
    .replace(/<sup\b[^>]*>.*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  const found = new Set<string>(['H', 'C', 'N', 'O']);
  // Tên riêng hay trùng kí hiệu ("Ba" chất, "Co", "Li"): chỉ tính khi đi cùng chỉ số hoặc nguyên tố khác
  const AMBIGUOUS = new Set(['Ba', 'Co', 'Li', 'He', 'Ne', 'Ar', 'Be', 'As', 'Au']);
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])[A-Z(\[][A-Za-z0-9()\[\]]*/gu)) {
    const token = m[0];
    if (!/[a-z\d]/.test(token) || token.length < 2) continue;
    const atoms = parseAtoms(token);
    if (!atoms) continue;
    const keys = Object.keys(atoms);
    if (keys.length === 1 && !/\d/.test(token) && AMBIGUOUS.has(token)) continue;
    keys.forEach(k => found.add(k));
  }
  const lower = text.toLowerCase();
  Object.entries(ELEMENT_NAMES).forEach(([name, sym]) => {
    if (new RegExp(`(?<![a-zà-ỹ])${name}(?![a-zà-ỹ])`).test(lower)) found.add(sym);
  });
  return ELEMENT_ORDER.filter(sym => found.has(sym))
    .map(sym => `${sym} = ${String(ATOMIC_MASSES[sym]).replace('.', ',')}`)
    .join('; ');
};

export const STATE_LEGEND = 'Các kí hiệu và chữ viết tắt: s: rắn; l: lỏng; g: khí; aq: dung dịch nước; xt: xúc tác; p: áp suất.';

export const buildExamHeaderHtml = (profile: ExamHeaderProfile, meta: ExamMeta, atomicLine: string, code = '000'): string => {
  const title = examTitleOf(meta);
  const invigilator = profile.showInvigilator
    ? `<p style="margin:2pt 0;">Chữ kí giám thị 1: ............................ &nbsp;&nbsp;&nbsp; Chữ kí giám thị 2: ............................</p>`
    : '';
  const line = (html: string, extra = '') => `<p style="margin:0;${HEADER_FONT}${extra}">${html}</p>`;
  const centered = 'text-align:center;';
  return `<table class="exam-header" border="0" cellspacing="0" cellpadding="0" style="width:100%;border:none;border-collapse:collapse;margin-bottom:4pt;">
<tr>
<td style="${NO_BORDER}width:50%;">${line(profile.department, centered)}${line(`<b>${profile.school}</b>`, `${centered}font-size:11.5pt;`)}${line(`<b>${profile.group}</b>`, centered)}</td>
<td style="${NO_BORDER}width:50%;">${line(`<b>${title}</b>`, centered)}${line(`<b>NĂM HỌC ${profile.schoolYear}</b>`, centered)}${line(`Môn: <b>HÓA HỌC</b>${/tốt\s*nghiệp/i.test(meta.examType) ? '' : ` – Lớp ${meta.grade}`}`, centered)}${line(`<i>Thời gian làm bài: ${meta.duration} phút, không kể thời gian phát đề</i>`, `${centered}font-size:11.5pt;`)}</td>
</tr>
</table>
<table class="exam-header" border="0" cellspacing="0" cellpadding="0" style="width:100%;border:none;border-collapse:collapse;">
<tr>
<td style="${NO_BORDER}width:76%;">${line('Họ, tên thí sinh: ................................................................')}${line('Số báo danh: ..........................................................................')}</td>
<td style="width:24%;border:1.5pt solid #000;vertical-align:middle;padding:4pt;">${line(`<b>Mã đề: ${code}</b>`, centered)}</td>
</tr>
</table>
${invigilator}
<p style="margin:4pt 0 2pt;"><b>Cho biết nguyên tử khối:</b> ${atomicLine}.</p>
<p style="margin:2pt 0 6pt;">${STATE_LEGEND}</p>
`;
};

/** Thay phần đầu đề (AI viết tự do) bằng khung tiêu đề chuẩn và chèn "--- HẾT ---" nếu thiếu. */
export const applyExamHeader = (html: string, profile: ExamHeaderProfile, meta: ExamMeta): string => {
  const exam = parseExamForShuffle(html);
  if (!exam.sections.length) return html;
  const first = exam.sections[0].start;
  const lastQ = exam.questions[exam.questions.length - 1];
  const examHtml = lastQ ? html.slice(first, lastQ.end) : html.slice(first);
  const bodyOpen = /<body\b[^>]*>/i.exec(html);
  const headerStart = bodyOpen ? bodyOpen.index + bodyOpen[0].length : 0;
  if (first < headerStart) return html;

  let bodyPart = html.slice(first);
  const hasHet = /(?:^|[\s>_\-–—*])H[ẾÊ]T(?:[\s<_\-–—*.]|$)/.test(exam.footer) || (lastQ ? /(?:^|[\s>_\-–—*])HẾT(?:[\s<_\-–—*.]|$)/.test(html.slice(lastQ.end, exam.bodyEnd)) : false);
  if (!hasHet && lastQ) {
    const insertAt = lastQ.end - first;
    bodyPart = `${bodyPart.slice(0, insertAt)}\n<p style="text-align:center;font-weight:bold;margin-top:8pt;">--- HẾT ---</p>\n${bodyPart.slice(insertAt)}`;
  }
  return `${html.slice(0, headerStart)}\n${buildExamHeaderHtml(profile, meta, atomicMassLine(examHtml))}${bodyPart}`;
};

/* ---------------------------- Tách đề và đáp án ---------------------------- */

const headOf = (html: string, title: string): string => {
  const head = /<head\b[\s\S]*?<\/head>/i.exec(html);
  return head ? head[0] : `<head><meta charset="utf-8"><title>${title}</title></head>`;
};

export const splitExamAndKey = (html: string): { exam: string; key: string } => {
  const parsed = parseExamForShuffle(html);
  if (parsed.answerStart < 0) return { exam: html, key: '' };
  const closeBody = '</body></html>';
  const exam = /<\/body>/i.test(html) || /<body/i.test(html)
    ? `${html.slice(0, parsed.answerStart)}${closeBody}`
    : html.slice(0, parsed.answerStart);
  const keyBody = html.slice(parsed.answerStart).replace(/<\/body>\s*<\/html>\s*$/i, '');
  const key = `<!DOCTYPE html><html lang="vi">${headOf(html, 'Hướng dẫn giải')}<body>${keyBody}</body></html>`;
  return { exam, key };
};

/* ---------------------------- Chia cột phương án + giữ trọn câu ---------------------------- */

const plainLength = (html: string): number =>
  html.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').trim().length;

/** Độ rộng vùng in A4 lề 0,5 inch: 523pt. Ngưỡng tính theo chữ Times 13pt. */
export const columnsForOptions = (contents: string[]): 4 | 2 | 1 => {
  if (contents.some(c => /<img|<table|data-fig-ph|\$\$|<script/i.test(c))) return 1;
  const longest = Math.max(...contents.map(plainLength));
  if (longest <= 18) return 4;
  if (longest <= 42) return 2;
  return 1;
};

const TAB_STOPS: Record<4 | 2, string> = { 4: 'left 130pt 261pt 392pt', 2: 'left 261pt' };
const TAB_SPAN = `<span style="mso-tab-count:1"> </span>`;
const LETTERS = ['A', 'B', 'C', 'D'];

const optionRows = (contents: string[], cols: 4 | 2 | 1): string[] => {
  const cell = (i: number, width: string) =>
    `<span class="opt" style="display:inline-block;width:${width};vertical-align:top;"><b>${LETTERS[i]}.</b> ${contents[i]}</span>`;
  if (cols === 1) return contents.map((_c, i) => `<b>${LETTERS[i]}.</b> ${contents[i]}`);
  if (cols === 4) return [[0, 1, 2, 3].map(i => cell(i, '24.5%')).join(TAB_SPAN)];
  return [cell(0, '49.5%') + TAB_SPAN + cell(1, '49.5%'), cell(2, '49.5%') + TAB_SPAN + cell(3, '49.5%')];
};

/** Lùi qua các thẻ mở liền trước vị trí; trả về vị trí mới và số thẻ đã lùi. */
export const backOverOpenTags = (src: string, pos: number): { pos: number; opens: number } => {
  let p = pos;
  let opens = 0;
  for (;;) {
    let q = p;
    while (q > 0 && /\s/.test(src[q - 1])) q--;
    if (q === 0 || src[q - 1] !== '>') return { pos: p, opens };
    const open = src.lastIndexOf('<', q - 1);
    if (open < 0) return { pos: p, opens };
    const tag = src.slice(open, q);
    if (/^<\//.test(tag) || /\/>$/.test(tag) || /^<(?:br|hr|img|meta|link|input|body|html|head)\b/i.test(tag)) return { pos: p, opens };
    p = open;
    opens++;
  }
};

const forwardOverCloseTags = (src: string, pos: number, count: number): number => {
  let p = pos;
  for (let i = 0; i < count; i++) {
    const m = /^(?:\s|&nbsp;)*<\/[a-z][\w-]*\s*>/i.exec(src.slice(p, p + 200));
    if (!m) break;
    p += m[0].length;
  }
  return p;
};

const KEEP_NEXT = 'page-break-after:avoid;page-break-inside:avoid;';
const KEEP_LINES = 'page-break-inside:avoid;';

/** Thêm thuộc tính giữ trang vào các thẻ khối của câu: mọi đoạn "dính" với đoạn sau, trừ đoạn cuối. */
const applyKeepTogether = (block: string): string => {
  const re = /<(p|div|li)\b([^>]*)>/gi;
  const hits: Array<{ index: number; len: number; tag: string; attrs: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    // Chỗ đặt hình giữ nguyên dạng để bước chèn ảnh nhận ra; khối ảnh tự có thuộc tính giữ trang
    if (/data-fig-ph/.test(m[2])) continue;
    // Thẻ bọc khối khác: Word truyền thuộc tính xuống mọi đoạn con, làm các câu dính chuỗi với nhau
    if (m[1].toLowerCase() === 'div' && /^\s*<(?:div|p|ul|ol|table|li)/i.test(block.slice(m.index + m[0].length))) continue;
    hits.push({ index: m.index, len: m[0].length, tag: m[1], attrs: m[2] });
  }
  let out = block;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    const rule = i === hits.length - 1 ? KEEP_LINES : KEEP_NEXT;
    const hasStyle = /\bstyle\s*=\s*"/i.test(h.attrs);
    const attrs = hasStyle ? h.attrs.replace(/\bstyle\s*=\s*"/i, `style="${rule}`) : `${h.attrs} style="${rule}"`;
    out = `${out.slice(0, h.index)}<${h.tag}${attrs}>${out.slice(h.index + h.len)}`;
  }
  return out;
};

const isBalanced = (html: string): boolean => {
  const re = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  const VOID = /^(?:br|hr|img|meta|link|input|col|area|base|embed|source|wbr)$/i;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (VOID.test(m[2]) || m[3]) continue;
    if (!m[1]) stack.push(m[2].toLowerCase());
    else if (stack.pop() !== m[2].toLowerCase()) return false;
  }
  return stack.length === 0;
};

/** `from`: vị trí bắt đầu khối; câu đầu mỗi phần tính từ tiêu đề phần để tiêu đề không nằm trơ cuối trang. */
const layoutQuestion = (src: string, q: ParsedExam['questions'][number], from: number): string => {
  let block = src.slice(from, q.end);
  if ((q.kind === 'mc' || q.kind === 'tf') && q.slots && q.slots.length === 4) {
    const contents = q.slots.map(slot => src.slice(slot.contentStart, slot.contentEnd).trim());
    const cols = q.kind === 'mc' ? columnsForOptions(contents) : 1;
    const { pos, opens } = backOverOpenTags(src, q.slots[0].labelStart);
    const end = forwardOverCloseTags(src, q.slots[3].contentEnd, opens);
    if (pos >= from && end <= q.end) {
      const rows = q.kind === 'mc'
        ? optionRows(contents, cols)
        : contents.map((c, i) => `<b>${'abcd'[i]})</b> ${c}`);
      const rendered = opens > 0
        ? rows.map(r => `<p class="opts" style="margin:2pt 0 2pt 12pt;${cols === 1 ? '' : `tab-stops:${TAB_STOPS[cols]};`}">${r}</p>`).join('\n')
        : rows.join('<br/>');
      block = src.slice(from, pos) + rendered + src.slice(end, q.end);
    }
  }
  const kept = applyKeepTogether(block);
  return isBalanced(kept) ? `<div class="q-block">${kept}</div>` : kept;
};

/** Chế bản phần câu hỏi để in: chia cột phương án, giữ trọn câu. Phần đáp án giữ nguyên. Đã chế bản thì không làm lại. */
export const layoutExamForPrint = (html: string): string => {
  if (!html || /class="q-block"/.test(html)) return html;
  const exam = parseExamForShuffle(html);
  if (!exam.questions.length) return html;
  let out = html;
  const firstOfSection = new Map(exam.sections.map(sec => [sec.questions[0], sec.start]));
  [...exam.questions].sort((a, b) => b.start - a.start).forEach(q => {
    const from = firstOfSection.get(q) ?? q.start;
    out = out.slice(0, from) + layoutQuestion(html, q, from) + out.slice(q.end);
  });
  return out;
};
