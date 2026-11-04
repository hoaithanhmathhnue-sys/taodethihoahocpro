/**
 * CHUẨN HÓA TRÌNH BÀY HÓA HỌC (chạy bằng code, không gọi AI, an toàn khi chạy lại nhiều lần):
 *  - Công thức, điện tích ion, trạng thái, mũi tên phản ứng → HTML sub/sup, không để sót LaTeX thô.
 *  - Tên cũ → danh pháp IUPAC theo SGK GDPT 2018.
 * Chỉ thay trong phần chữ, bỏ qua thẻ HTML, <script> (hình vẽ), <style>, <svg>, phần <head>.
 */
import { IUPAC_NAME_MAP } from '../data/chemistryReference';

const SKIP_RE = /(<head\b[\s\S]*?<\/head>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|^[ \t]*```[\s\S]*?^[ \t]*```[ \t]*$)/gim;

/** Áp hàm thay thế lên phần chữ, giữ nguyên thẻ và khối bỏ qua. */
const mapTextNodes = (html: string, fn: (text: string) => string): string => {
  let out = '';
  let last = 0;
  SKIP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SKIP_RE.exec(html))) {
    out += fn(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(html.slice(last));
};

/* ---------------------------- LaTeX đơn giản → HTML ---------------------------- */

const LATEX_ARROWS: Array<[RegExp, string]> = [
  [/\\(?:xrightarrow|xleftrightarrow)(?:\[[^\]]*\])?\{([^{}]*)\}/g, ' →($1) '],
  [/\\(?:rightleftharpoons|rightleftarrows|leftrightharpoons|leftrightarrow|xrightleftharpoons)/g, '⇌'],
  [/\\(?:longrightarrow|rightarrow|to)(?![a-zA-Z])/g, '→'],
  [/\\Delta(?![a-zA-Z])/g, 'Δ'],
  [/\\(?:circ|degree)(?![a-zA-Z])/g, 'o'],
  [/\\(?:times|cdot)(?![a-zA-Z])/g, '.'],
  [/\\alpha(?![a-zA-Z])/g, 'α'], [/\\beta(?![a-zA-Z])/g, 'β'], [/\\gamma(?![a-zA-Z])/g, 'γ'], [/\\pi(?![a-zA-Z])/g, 'π'], [/\\sigma(?![a-zA-Z])/g, 'σ'],
  [/\\(?:le|leq)(?![a-zA-Z])/g, '≤'], [/\\(?:ge|geq)(?![a-zA-Z])/g, '≥'], [/\\approx(?![a-zA-Z])/g, '≈'], [/\\%/g, '%'],
  [/\\[,;:!]| ?\\quad ?/g, ' '],
];

/** Nội dung trong $...$: chuyển sang HTML nếu chỉ có chỉ số trên/dưới; có phân số, căn… thì giữ LaTeX. */
const simpleLatexToHtml = (tex: string): string | null => {
  let s = tex.trim();
  s = s.replace(/\\ce\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1');
  for (let i = 0; i < 3; i++) s = s.replace(/\\(?:text|mathrm|textbf|mathbf|rm)\{([^{}]*)\}/g, '$1');
  LATEX_ARROWS.forEach(([re, to]) => { s = s.replace(re, to); });
  if (/\\[a-zA-Z]/.test(s)) return null;
  s = s
    .replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>')
    .replace(/_([A-Za-z0-9+\-])/g, '<sub>$1</sub>')
    .replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>');
  if (/[{}_^\\]/.test(s)) return null;
  return s.replace(/<sup>o<\/sup>\s*C\b/g, '<sup>o</sup>C');
};

const convertLatex = (text: string): string => {
  let s = text.replace(/(?<![\\$])\$\$([\s\S]+?)\$\$/g, (full, tex) => {
    const html = simpleLatexToHtml(tex);
    return html === null ? full : html;
  });
  s = s.replace(/(?<![\\$])\$(?!\$)([^\n$]+?)(?<!\\)\$(?!\$)/g, (full, tex) => {
    const html = simpleLatexToHtml(tex);
    return html === null ? full : html;
  });
  // \ce{...}, \rightarrow… viết trần ngoài dấu $
  s = s.replace(/\\ce\{([^{}]*)\}/g, (_m, inner) => simpleLatexToHtml(inner) ?? inner);
  return s.replace(/\\(?:longrightarrow|rightarrow)(?![a-zA-Z])/g, '→').replace(/\\(?:rightleftharpoons|rightleftarrows)(?![a-zA-Z])/g, '⇌');
};

/* ---------------------------- Kí tự Unicode chỉ số ---------------------------- */

const SUB_MAP: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ᵣ': 'r', '₊': '+', '₋': '-' };
const SUP_MAP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

const convertUnicodeScripts = (text: string): string =>
  text
    .replace(/[₀-₉ᵣ₊₋]+/g, m => `<sub>${[...m].map(c => SUB_MAP[c]).join('')}</sub>`)
    .replace(/[⁰¹²³⁴-⁹⁺⁻]+/g, m => `<sup>${[...m].map(c => SUP_MAP[c]).join('')}</sup>`);

/* ---------------------------- Công thức viết thường ---------------------------- */

const ELEMENT_SET = new Set(['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'As', 'Br', 'Rb', 'Sr', 'Ag', 'Sn', 'I', 'Cs', 'Ba', 'Au', 'Hg', 'Pb']);
const ANIONS = new Set(['OH', 'Cl', 'Br', 'I', 'F', 'CN', 'S', 'O', 'NO3', 'NO2', 'SO4', 'SO3', 'CO3', 'HCO3', 'HSO4', 'PO4', 'HPO4', 'H2PO4', 'MnO4', 'CrO4', 'Cr2O7', 'CH3COO', 'HCOO', 'ClO', 'ClO3', 'AlO2']);

/** Kiểm tra chuỗi chỉ gồm kí hiệu nguyên tố, số và ngoặc. */
const isFormulaBody = (s: string): boolean => {
  let i = 0;
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '[') { depth++; i++; continue; }
    if (c === ')' || c === ']') { depth--; if (depth < 0) return false; i++; while (i < s.length && /\d/.test(s[i])) i++; continue; }
    const two = s.slice(i, i + 2);
    if (ELEMENT_SET.has(two)) i += 2;
    else if (ELEMENT_SET.has(c)) i += 1;
    else return false;
    while (i < s.length && /\d/.test(s[i])) i++;
  }
  return depth === 0;
};

const subscriptDigits = (s: string): string => s.replace(/([A-Za-z)\]])(\d+)/g, '$1<sub>$2</sub>');

const hasIndex = (body: string) => /[A-Za-z)\]]\d/.test(body);

// Cation nhiều nguyên tử: số cuối là chỉ số, không phải điện tích
const POLY_CATIONS = new Set(['NH4', 'H3O', 'PH4']);

/** Công thức, có thể kèm hệ số đứng trước và dấu điện tích đứng sau (Fe3+, SO42-, [Cu(NH3)4]2+). */
const FORMULA_RE = /(?<![\p{L}\p{N}_])(\d*)([A-Z(\[][A-Za-z0-9()\[\]]*)([+-])?(?![\p{L}\p{N}])/gu;

const formatFormulaToken = (full: string, coef: string, body: string, sign: string | undefined, offset: number, text: string): string => {
  const after = text[offset + full.length] || '';
  const plain = (tail: string) => (isFormulaBody(body) && hasIndex(body) ? `${coef}${subscriptDigits(body)}${tail}` : full);
  // Dấu đứng liền chữ phía sau là gạch nối hoặc phép cộng (CH3-CH2, CO2+H2O), không phải điện tích
  if (!sign || /[A-Za-z0-9(\[]/.test(after)) return plain(sign || '');
  const lastDigit = /\d$/.test(body) ? body.slice(-1) : '';
  const stem = lastDigit ? body.slice(0, -1) : body;
  const ion = (core: string, num: string) => `${coef}${subscriptDigits(core)}<sup>${num}${sign}</sup>`;
  if (body.startsWith('[')) {
    // Ion phức: [Cu(NH3)4]2+, [Al(OH)4]-
    if (/\]\d?$/.test(body) && isFormulaBody(stem)) return ion(stem, lastDigit);
    return plain(sign);
  }
  if (sign === '+') {
    if (POLY_CATIONS.has(body)) return ion(body, '');
    if (ELEMENT_SET.has(stem)) return ion(stem, lastDigit);
    return plain(sign);
  }
  if (ANIONS.has(body)) return ion(body, '');
  if (lastDigit && ANIONS.has(stem)) return ion(stem, lastDigit);
  return plain(sign);
};

const formatPlainFormulas = (text: string): string =>
  text.replace(FORMULA_RE, (full, coef, body, sign, offset, whole) => formatFormulaToken(full, coef, body, sign, offset, whole));

/* ---------------------------- Kí hiệu nhiệt động, điện hóa, mũi tên ---------------------------- */

const formatSymbols = (text: string): string =>
  text
    .replace(/Δ\s*r\s*H\s*(?:o|°|0)\s*298/g, 'Δ<sub>r</sub>H<sup>o</sup><sub>298</sub>')
    .replace(/Δ\s*f\s*H\s*(?:o|°|0)\s*298/g, 'Δ<sub>f</sub>H<sup>o</sup><sub>298</sub>')
    .replace(/(?<![\p{L}\p{N}])E\s?(?:°|o)(?=\s*(?:pin|cell|\(|[A-Z]|=|$))/gu, 'E<sup>o</sup>')
    .replace(/(\d)\s*(?:°|o|º)\s*C(?![\p{L}])/gu, '$1 <sup>o</sup>C')
    .replace(/&lt;=+&gt;|&lt;-+&gt;|⇄|↔|⟷/g, '⇌')
    .replace(/<=+>|<-+>/g, '⇌')
    .replace(/-+&gt;|-+>|⟶|⟹(?=\s)/g, '→')
    .replace(/&rarr;/g, '→');

/* ---------------------------- Danh pháp IUPAC ---------------------------- */

const VI_LETTER = 'A-Za-zÀ-ỹĐđ';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Từ nhiều nghĩa: chỉ đổi khi ngữ cảnh chắc chắn là nguyên tố
const CONTEXT_RULES: Array<[RegExp, string]> = [
  [/\b(kim loại|lá|thanh|dây|bột|mảnh|ion|muối|hợp chất|nguyên tố|điện cực) (đồng)(?![\p{L}])/giu, '$1 copper'],
  [/(?<![\p{L}])đồng ?\((I{1,2})\)/giu, 'copper($1)'],
  [/\b(kim loại|lá|thanh|dây|ion|muối|nguyên tố|điện cực|hợp chất) (bạc)(?![\p{L}])/giu, '$1 silver'],
  [/\b(kim loại|lá|thanh|nguyên tố|điện cực) (vàng)(?![\p{L}])/giu, '$1 gold'],
  [/\b(kim loại|lá|thanh|ion|muối|nguyên tố|điện cực|hợp chất) (chì)(?![\p{L}])/giu, '$1 lead'],
  [/\b(kim loại|lá|thanh|ion|muối|nguyên tố|điện cực) (thiếc)(?![\p{L}])/giu, '$1 tin'],
  [/(?<![\p{L}])oxi(?! hóa| hoá|-hóa|-hoá|[\p{L}])/gu, 'oxygen'],
  [/(?<![\p{L}])Oxi(?! hóa| hoá|-hóa|-hoá|[\p{L}])/gu, 'Oxygen'],
];

// Cụm dài trước, cụm ngắn sau để "axit sunfuric" không bị đổi nửa chừng
const IUPAC_RULES: Array<{ re: RegExp; to: string }> = [...IUPAC_NAME_MAP]
  .filter(([from, to]) => from !== to)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, to]) => ({ re: new RegExp(`(?<![${VI_LETTER}])${escapeRe(from)}(?![${VI_LETTER}])`, 'giu'), to }));

const keepCase = (src: string, to: string): string =>
  src === src.toUpperCase() && src.length > 1 ? to.toUpperCase() : src[0] === src[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;

export const applyIupacNames = (text: string): string => {
  let s = text;
  CONTEXT_RULES.forEach(([re, to]) => { s = s.replace(re, to); });
  IUPAC_RULES.forEach(({ re, to }) => { s = s.replace(re, m => keepCase(m, to)); });
  // "Aluminium (aluminium, Al)" sau khi đổi tên → bỏ phần lặp trong ngoặc
  return s.replace(new RegExp(`(?<![${VI_LETTER}])([${VI_LETTER}]+) \\(\\1, `, 'giu'), '$1 (');
};

/* ---------------------------- Công thức HTML → LaTeX (khi giáo viên chọn LaTeX hoặc Equation) ---------------------------- */

const TAG_SKIP_RE = /(<head\b[\s\S]*?<\/head>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<!--[\s\S]*?-->|<(?!\/?su[bp]\b)\/?[a-zA-Z][^>]*>)/gi;

const baseToLatex = (text: string): string | null => {
  if (/[^A-Za-z0-9()\[\]Δ.\-–=≡]/.test(text)) return null;
  return text
    .split(/(Δ|=|≡)/)
    .map(part => {
      if (part === 'Δ') return '\\Delta ';
      if (part === '=') return '=';
      if (part === '≡') return '\\equiv ';
      return part ? `\\mathrm{${part.replace(/–/g, '-')}}` : '';
    })
    .join('');
};

const scriptToLatex = (text: string): string | null => {
  const t = text.trim().replace(/–/g, '-');
  if (/[^A-Za-z0-9+\-,.]/.test(t)) return null;
  // Giữ dạng số và dấu; phần chữ viết đứng
  return t.replace(/[A-Za-z]+/g, w => `\\mathrm{${w}}`);
};

/** Một cụm công thức có chỉ số → "$...$". Không đọc chắc chắn được thì giữ nguyên. */
const runToLatex = (run: string): string => {
  // Độ C giữ dạng chữ: Equation với mũ không có cơ số tạo khoảng trống xấu
  if (/^<sup>o<\/sup>C?$/i.test(run)) return run;
  let body = run;
  let prefix = '';
  let suffix = '';
  // Ngoặc lẻ ở hai đầu thuộc câu văn, không thuộc công thức
  const count = (s: string, ch: string) => s.split(ch).length - 1;
  while (/^[(\[]/.test(body) && count(body, body[0]) > count(body, body[0] === '(' ? ')' : ']')) {
    prefix += body[0];
    body = body.slice(1);
  }
  while (/[)\]]$/.test(body)) {
    const close = body[body.length - 1];
    if (count(body, close) <= count(body, close === ')' ? '(' : '[')) break;
    suffix = close + suffix;
    body = body.slice(0, -1);
  }
  // Cả cụm nằm trọn trong một cặp ngoặc, ví dụ "(H2)": ngoặc của câu văn
  const wrapped = (t: string) => {
    if (t[0] !== '(' || !t.endsWith(')')) return false;
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      if (t[i] === ')') depth--;
      if (depth === 0 && i < t.length - 1) return false;
    }
    return true;
  };
  while (wrapped(body)) {
    prefix += '(';
    suffix = `)${suffix}`;
    body = body.slice(1, -1);
  }
  let latex = '';
  for (const part of body.split(/(<su[bp]>[^<]*<\/su[bp]>)/i)) {
    if (!part) continue;
    const script = /^<(su[bp])>([^<]*)<\/su[bp]>$/i.exec(part);
    const piece = script ? scriptToLatex(script[2]) : baseToLatex(part);
    if (piece === null) return run;
    latex += script ? `${script[1].toLowerCase() === 'sub' ? '_' : '^'}{${piece}}` : piece;
  }
  return `${prefix}$${latex}$${suffix}`;
};

const RUN_BASE = '(?:[A-Za-z0-9()\\[\\]Δ]|[-–=≡.](?=[A-Za-z0-9(\\[<]))*';
const RUN_SCRIPT = '<su[bp]>[^<]*</su[bp]>';
const FORMULA_RUN_RE = new RegExp(`(?<![\\p{L}\\p{N}$])${RUN_BASE}${RUN_SCRIPT}(?:${RUN_BASE}${RUN_SCRIPT})*${RUN_BASE}(?![\\p{L}\\p{N}])`, 'gu');

const STATE = '(?:\\((?:s|l|g|aq)\\))?';
const EQ_ITEM = `(?:\\$[^$]+\\$|\\d*(?:[A-Z][A-Za-z0-9()\\[\\]]*|e))${STATE}`;
const EQ_SEQ_RE = new RegExp(`(?<![\\p{L}\\p{N}$])${EQ_ITEM}(?:\\s*[+→⇌]\\s*${EQ_ITEM})+(?![\\p{L}\\p{N}])`, 'gu');

/** Gộp cả phương trình vào một công thức: $a$ + $b$ → $c$ thành $a + b \rightarrow c$. */
const mergeEquation = (seq: string): string => {
  if (!/[→⇌]/.test(seq) && !seq.includes('$')) return seq;
  const out: string[] = [];
  // Tách theo dấu nối, không tách dấu + nằm trong công thức đã đổi ($...^{2+}$)
  for (const tokenMatch of seq.matchAll(/\$[^$]+\$(?:\((?:s|l|g|aq)\))?|[+→⇌]|[^\s+→⇌]+/g)) {
    const token = tokenMatch[0];
    if (token === '+') { out.push('+'); continue; }
    if (token === '→') { out.push('\\rightarrow'); continue; }
    if (token === '⇌') { out.push('\\rightleftharpoons'); continue; }
    const m = /^(.*?)(\((?:s|l|g|aq)\))?$/.exec(token)!;
    const state = m[2] ? `\\mathrm{${m[2]}}` : '';
    if (m[1].startsWith('$')) { out.push(m[1].slice(1, -1) + state); continue; }
    const plain = /^(\d*)(.+)$/.exec(m[1]);
    if (!plain || (plain[2] !== 'e' && !isFormulaBody(plain[2]))) return seq;
    out.push(`\\mathrm{${m[1]}}${state}`);
  }
  return `$${out.join(' ')}$`;
};

/**
 * Đổi công thức đang ở dạng chỉ số HTML sang LaTeX $...$. Chỉ gọi khi giáo viên chọn LaTeX hoặc Equation;
 * chữ thường và công thức không có chỉ số đứng ngoài phương trình giữ nguyên.
 */
export const chemHtmlToLatex = (html: string): string => {
  if (!html) return html;
  let out = '';
  let last = 0;
  const convert = (text: string) =>
    text.replace(FORMULA_RUN_RE, run => runToLatex(run)).replace(EQ_SEQ_RE, mergeEquation);
  TAG_SKIP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_SKIP_RE.exec(html))) {
    out += convert(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + convert(html.slice(last));
};

/* ---------------------------- Điểm vào ---------------------------- */

/** Chuẩn hóa toàn bộ trình bày hóa học của một đoạn HTML hoặc Markdown. Gọi lại nhiều lần không đổi kết quả. */
export const normalizeChemText = (content: string): string => {
  if (!content) return content;
  const afterLatex = mapTextNodes(content, convertLatex);
  return mapTextNodes(afterLatex, t => {
    // Công thức $...$ còn lại (phân số, căn…) giữ nguyên
    const parts = t.split(/((?<!\\)\$\$[\s\S]+?\$\$|(?<![\\$])\$(?!\$)[^\n$]+?\$(?!\$))/g);
    return parts.map((p, i) => (i % 2 === 1 ? p : applyIupacNames(formatSymbols(formatPlainFormulas(convertUnicodeScripts(p)))))).join('');
  });
};
