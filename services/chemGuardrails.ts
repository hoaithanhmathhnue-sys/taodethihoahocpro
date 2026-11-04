/**
 * BỘ KIỂM DUYỆT CHUẨN MỰC HÓA HỌC GDPT 2018 (Zero-Error Guardrails):
 *  - Thể tích mol cũ 22,4 L, cụm "đktc".
 *  - Đáp án Trả lời ngắn tối đa 4 kí tự, dấu phẩy thập phân; tự chèn câu lệnh làm tròn.
 *  - Phương trình hóa học phải cân bằng nguyên tố và điện tích.
 *  - LaTeX thô còn sót.
 * Các lỗi trả về cùng dạng ExamIssue với bộ kiểm tra cấu trúc nên dùng chung luồng tự sửa của AI.
 */
import { ATOMIC_MASSES } from '../data/chemistryReference';
import { parseExamForShuffle, ParsedExam } from './examShuffle';
import type { ExamIssue } from './examValidator';

const stripTags = (html: string) =>
  html
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:p|div|li|tr|td|th|br|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/* ---------------------------- Đáp án Trả lời ngắn ---------------------------- */

const SHORT_ANSWER_RE = /^-?\d[\d,]*$/;

export const shortAnswerProblem = (answer: string): string | null => {
  const a = answer.trim();
  if (!a) return 'chưa có đáp án';
  if (a.includes('.')) return `"${a}" phải dùng dấu phẩy thập phân`;
  if (a.length > 4) return `"${a}" dài ${a.length} kí tự, phiếu trả lời chỉ có 4 ô`;
  if (!SHORT_ANSWER_RE.test(a)) return `"${a}" không phải là một số điền được vào phiếu`;
  return null;
};

const ROUNDING_RE = /làm\s*tròn/i;

/** Số chữ số thập phân → câu lệnh làm tròn. */
const roundingPhrase = (decimals: number): string => {
  const place = decimals === 1 ? 'hàng phần mười' : decimals === 2 ? 'hàng phần trăm' : 'hàng phần nghìn';
  return `(Làm tròn kết quả đến ${place}.)`;
};

/**
 * Chèn câu lệnh làm tròn vào cuối các câu Trả lời ngắn có đáp án thập phân mà đề chưa dặn.
 * Không đổi cấu trúc câu, chỉ thêm chữ trước thẻ đóng của đoạn cuối câu.
 */
export const enforceShortAnswerRounding = (html: string): { html: string; added: number[] } => {
  const exam = parseExamForShuffle(html);
  const added: number[] = [];
  const targets = exam.questions
    .filter(q => q.kind === 'short')
    .filter(q => {
      const ans = exam.answers.short[q.num] || '';
      return /,\d/.test(ans) && !ROUNDING_RE.test(stripTags(html.slice(q.start, q.end)));
    })
    .sort((a, b) => b.start - a.start);
  let out = html;
  for (const q of targets) {
    const decimals = (exam.answers.short[q.num].split(',')[1] || '').length;
    const block = out.slice(q.start, q.end);
    const phrase = ` ${roundingPhrase(decimals)}`;
    const closeIdx = block.lastIndexOf('</p>');
    const next = closeIdx >= 0 ? block.slice(0, closeIdx) + phrase + block.slice(closeIdx) : block.trimEnd() + phrase + '\n';
    out = out.slice(0, q.start) + next + out.slice(q.end);
    added.push(q.num);
  }
  return { html: out, added: added.reverse() };
};

/* ---------------------------- Cân bằng phương trình ---------------------------- */

type Tally = Record<string, number>;

const addTally = (into: Tally, from: Tally, factor = 1) => {
  Object.entries(from).forEach(([k, v]) => { into[k] = (into[k] || 0) + v * factor; });
};

/** Đếm nguyên tử của một công thức có ngoặc. Không đọc được → null. */
export const parseAtoms = (formula: string): Tally | null => {
  let i = 0;
  const readNumber = () => {
    const m = /^\d+/.exec(formula.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return parseInt(m[0], 10);
  };
  const group = (closer: string | null): Tally | null => {
    const tally: Tally = {};
    while (i < formula.length) {
      const c = formula[i];
      if (c === '(' || c === '[') {
        i++;
        const inner = group(c === '(' ? ')' : ']');
        if (!inner) return null;
        addTally(tally, inner, readNumber());
      } else if (c === ')' || c === ']') {
        if (c !== closer) return null;
        i++;
        return tally;
      } else {
        const two = formula.slice(i, i + 2);
        const sym = ATOMIC_MASSES[two] !== undefined ? two : ATOMIC_MASSES[c] !== undefined ? c : '';
        if (!sym) return null;
        i += sym.length;
        tally[sym] = (tally[sym] || 0) + readNumber();
      }
    }
    return closer ? null : tally;
  };
  return group(null);
};

/** Một vế: "2H<sup>+</sup>"... đã đổi về dạng 2H^+ . Trả về nguyên tử + điện tích, hoặc null nếu không phải công thức. */
const parseSpecies = (raw: string): { atoms: Tally; charge: number } | null => {
  let s = raw.trim().replace(/\((?:s|l|g|aq|r|k|dd)\)$/, '').trim();
  const coefMatch = /^(\d+)\s*/.exec(s);
  const coef = coefMatch ? parseInt(coefMatch[1], 10) : 1;
  if (coefMatch) s = s.slice(coefMatch[0].length);
  if (/^e$/.test(s)) return { atoms: {}, charge: -coef };
  let charge = 0;
  const chargeMatch = /\^(\d?)([+-])$/.exec(s);
  if (chargeMatch) {
    charge = (chargeMatch[1] ? parseInt(chargeMatch[1], 10) : 1) * (chargeMatch[2] === '+' ? 1 : -1);
    s = s.slice(0, chargeMatch.index);
  }
  const pieces = s.split(/[.·]/);
  const atoms: Tally = {};
  for (const piece of pieces) {
    const pm = /^(\d*)(.+)$/.exec(piece.trim());
    if (!pm) return null;
    const parsed = parseAtoms(pm[2]);
    if (!parsed) return null;
    addTally(atoms, parsed, pm[1] ? parseInt(pm[1], 10) : 1);
  }
  const out: Tally = {};
  addTally(out, atoms, coef);
  return { atoms: out, charge: charge * coef };
};

const sideTotals = (species: string[]): { atoms: Tally; charge: number } | null => {
  const atoms: Tally = {};
  let charge = 0;
  for (const raw of species) {
    const parsed = parseSpecies(raw);
    if (!parsed) return null;
    addTally(atoms, parsed.atoms);
    charge += parsed.charge;
  }
  return { atoms, charge };
};

/** Lấy các chất liên tiếp sát mũi tên; gặp chữ không phải công thức thì dừng. */
const takeSpecies = (segment: string, fromEnd: boolean): string[] => {
  const tokens = segment.trim().split(/\s\+\s/);
  const ordered = fromEnd ? [...tokens].reverse() : tokens;
  const picked: string[] = [];
  for (let raw of ordered) {
    let t = raw.trim();
    if (fromEnd) t = t.split(/\s+/).pop() || '';
    else t = t.split(/\s+/)[0] || '';
    t = t.replace(/[.,;:]+$/, '');
    if (!t || !parseSpecies(t)) break;
    picked.push(t);
    if (raw.trim() !== t) break;
  }
  return picked;
};

/** Kiểm tra một dòng có mũi tên; trả về phương trình chưa cân bằng (nếu đọc được chắc chắn). */
export const findUnbalancedEquations = (html: string): string[] => {
  const plain = stripTags(
    html
      .replace(/<sub\b[^>]*>(.*?)<\/sub>/gi, '$1')
      .replace(/<sup\b[^>]*>(.*?)<\/sup>/gi, '^$1'),
  );
  const bad: string[] = [];
  plain.split('\n').forEach(line => {
    if (!/[→⇌]/.test(line) || /\bn[A-Z(]|\)n|\bn\s/.test(line)) return;
    const pieces = line.split(/[→⇌]/);
    if (pieces.length !== 2) return;
    const left = takeSpecies(pieces[0], true);
    const right = takeSpecies(pieces[1], false);
    if (left.length === 0 || right.length === 0) return;
    const a = sideTotals(left);
    const b = sideTotals(right);
    if (!a || !b) return;
    const keys = new Set([...Object.keys(a.atoms), ...Object.keys(b.atoms)]);
    const ok = [...keys].every(k => (a.atoms[k] || 0) === (b.atoms[k] || 0)) && a.charge === b.charge;
    if (!ok) bad.push(`${[...left].reverse().join(' + ')} → ${right.join(' + ')}`.replace(/\^/g, ''));
  });
  return Array.from(new Set(bad));
};

/* ---------------------------- Kiểm tra tổng hợp ---------------------------- */

/** Phần đề, bỏ phần đáp án (số liệu trong lời giải có thể nhắc 22,4 để so sánh). */
const examPartOf = (html: string, parsed: ParsedExam): string => {
  const last = parsed.questions.reduce((max, q) => Math.max(max, q.end), 0);
  return last > 0 ? html.slice(0, last) : html;
};

export const checkChemistryExam = (html: string): ExamIssue[] => {
  const issues: ExamIssue[] = [];
  if (!html) return issues;
  const parsed = parseExamForShuffle(html);
  const examHtml = examPartOf(html, parsed);
  const examText = stripTags(examHtml);

  if (/đktc|điều\s*kiện\s*tiêu\s*chuẩn/i.test(stripTags(html))) {
    issues.push({ code: 'OLD_STP', message: 'Đề còn dùng "đktc" (cách cũ). Phải đổi sang điều kiện chuẩn 25 °C, 1 bar với thể tích mol 24,79 L/mol và tính lại đáp án.', severity: 'error' });
  }
  if (/22[,.]4\s*(?:L|l|lít|dm)/.test(stripTags(html))) {
    issues.push({ code: 'OLD_MOLAR_VOLUME', message: 'Đề hoặc lời giải còn dùng 22,4 L. Phải dùng 24,79 L/mol (25 °C, 1 bar) và tính lại đáp án liên quan.', severity: 'error' });
  }

  parsed.questions.filter(q => q.kind === 'short').forEach(q => {
    const problem = shortAnswerProblem(parsed.answers.short[q.num] || '');
    if (problem) {
      issues.push({ code: 'SHORT_ANSWER', message: `Phần III câu ${q.num}: đáp án ${problem}. Hãy đổi số liệu hoặc yêu cầu làm tròn để đáp án có tối đa 4 kí tự (kể cả dấu trừ và dấu phẩy).`, severity: 'error' });
    }
  });

  const unbalanced = findUnbalancedEquations(examHtml);
  if (unbalanced.length) {
    issues.push({ code: 'UNBALANCED', message: `Phương trình chưa cân bằng nguyên tố hoặc điện tích: ${unbalanced.slice(0, 5).join('; ')}.`, severity: 'warning' });
  }

  const rawLatex = examText.match(/\\(?:frac|rightarrow|ce|text|mathrm|sqrt)\b/g);
  if (rawLatex) {
    issues.push({ code: 'RAW_LATEX', message: `Đề còn ${rawLatex.length} mã LaTeX nằm ngoài công thức, sẽ hiện thô trong Word.`, severity: 'warning' });
  }
  return issues;
};
