/**
 * GHI FILE EXCEL (.xlsx) tối giản bằng JSZip: nhiều trang, ô gộp, độ rộng cột, in đậm tiêu đề.
 * Đủ cho bảng đáp án chấm máy, ma trận và đặc tả; không cần thư viện Excel nặng.
 */
import JSZip from 'jszip';

export interface SheetData {
  name: string;
  rows: Array<Array<string | number | null>>;
  merges?: Array<{ r1: number; c1: number; r2: number; c2: number }>;
  colWidths?: number[];
  /** Số dòng đầu in đậm */
  headerRows?: number;
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Bỏ kí tự điều khiển XML không cho phép
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const colName = (c: number): string => {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const safeSheetName = (name: string, used: Set<string>): string => {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Trang';
  let out = base;
  let i = 2;
  while (used.has(out)) out = `${base} ${i++}`;
  used.add(out);
  return out;
};

const sheetXml = (sheet: SheetData): string => {
  const header = sheet.headerRows ?? 1;
  const rowsXml = sheet.rows.map((row, r) => {
    const cells = row.map((v, c) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = `${colName(c)}${r + 1}`;
      const style = r < header ? ' s="2"' : ' s="1"';
      if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${colName(m.c1)}${m.r1 + 1}:${colName(m.c2)}${m.r2 + 1}"/>`).join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`;
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="12"/><name val="Times New Roman"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

export const buildXlsxBlob = async (sheets: SheetData[]): Promise<Blob> => {
  const zip = new JSZip();
  const used = new Set<string>();
  const named = sheets.map(s => ({ ...s, name: safeSheetName(s.name, used) }));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES_XML);
  named.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/* ---------------------------- Bảng HTML → trang Excel ---------------------------- */

const SUB_DIGITS: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋' };
const SUP_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', o: '°' };
const mapChars = (s: string, table: Record<string, string>) => [...s].map(c => table[c] ?? c).join('');

export const cellText = (html: string): string =>
  html
    .replace(/<sub\b[^>]*>(.*?)<\/sub>/gi, (_m, t) => mapChars(t, SUB_DIGITS))
    .replace(/<sup\b[^>]*>(.*?)<\/sup>/gi, (_m, t) => mapChars(t, SUP_DIGITS))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

/** Đổi bảng HTML đầu tiên có dữ liệu thành trang Excel, giữ đúng ô gộp rowspan/colspan. */
export const htmlTableToSheet = (html: string, name: string): SheetData | null => {
  const table = /<table\b[\s\S]*<\/table>/i.exec(html);
  if (!table) return null;
  const rows: SheetData['rows'] = [];
  const merges: NonNullable<SheetData['merges']> = [];
  const occupied = new Set<string>();
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  let r = 0;
  let headerRows = 0;
  while ((tr = trRe.exec(table[0]))) {
    const row: SheetData['rows'][number] = [];
    const tdRe = /<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let td: RegExpExecArray | null;
    let c = 0;
    let hasHeader = false;
    while ((td = tdRe.exec(tr[1]))) {
      while (occupied.has(`${r}:${c}`)) c++;
      const rowspan = parseInt(/rowspan\s*=\s*["']?(\d+)/i.exec(td[2])?.[1] || '1', 10);
      const colspan = parseInt(/colspan\s*=\s*["']?(\d+)/i.exec(td[2])?.[1] || '1', 10);
      row[c] = cellText(td[3]);
      if (td[1].toLowerCase() === 'th') hasHeader = true;
      if (rowspan > 1 || colspan > 1) merges.push({ r1: r, c1: c, r2: r + rowspan - 1, c2: c + colspan - 1 });
      for (let i = 0; i < rowspan; i++) for (let j = 0; j < colspan; j++) if (i || j) occupied.add(`${r + i}:${c + j}`);
      c += colspan;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows.push(row);
    if (hasHeader && headerRows === r) headerRows = r + 1;
    r++;
  }
  if (!rows.length) return null;
  return { name, rows, merges, headerRows, colWidths: Array.from({ length: Math.max(...rows.map(x => x.length)) }, (_v, i) => (i <= 2 ? 22 : 11)) };
};
