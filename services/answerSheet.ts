/**
 * PHIẾU TRẢ LỜI TRẮC NGHIỆM đồng bộ với số câu của đề: Phần I ô A–B–C–D, Phần II ô Đúng/Sai,
 * Phần III ô điền số 4 kí tự (dấu trừ, dấu phẩy, chữ số).
 * Vẽ bằng SVG theo tọa độ khổ A4 để ô tô thẳng hàng tuyệt đối; thiếu chỗ thì sang trang mới.
 */
import type { ExamHeaderProfile } from './examLayout';

export interface AnswerSheetCounts {
  mc: number;
  tf: number;
  short: number;
  essay: number;
}

const PAGE_W = 794;
const PAGE_H = 1123;
const LEFT = 40;
const BOTTOM = PAGE_H - 40;
const FONT = `font-family="'Times New Roman', Times, serif"`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const text = (x: number, y: number, t: string, o: { size?: number; bold?: boolean; italic?: boolean; anchor?: 'start' | 'middle' | 'end' } = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? 'start'}" fill="#000"${o.bold ? ' font-weight="bold"' : ''}${o.italic ? ' font-style="italic"' : ''}>${esc(t)}</text>`;

const box = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="1"/>`;

const bubble = (cx: number, cy: number, label: string) =>
  `<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="#000" stroke-width="0.9"/>` + text(cx, cy + 3.6, label, { size: 10, anchor: 'middle' });

const digitGrid = (x: number, y: number, cols: number, title: string): string => {
  const step = 21;
  let out = text(x + ((cols - 1) * step) / 2, y, title, { size: 12, bold: true, anchor: 'middle' });
  for (let c = 0; c < cols; c++) {
    const cx = x + c * step;
    out += box(cx - 8, y + 7, 16, 16);
    for (let d = 0; d < 10; d++) out += bubble(cx, y + 36 + d * 19.5, String(d));
  }
  return out;
};

/** Cắt chuỗi dài thành nhiều dòng theo số kí tự, không tách từ. */
const wrap = (s: string, max: number): string[] => {
  const lines: string[] = [];
  let line = '';
  s.split(/\s+/).forEach(word => {
    if (line && (line + ' ' + word).length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  });
  if (line) lines.push(line);
  return lines;
};

const headerBlock = (profile: ExamHeaderProfile, title: string): string => {
  let out = '';
  let y = 52;
  [profile.department, profile.school].forEach((value, i) => {
    wrap(value, i === 0 ? 46 : 36).forEach(l => {
      out += text(205, y, l, { anchor: 'middle', bold: i === 1, size: 12.5 });
      y += 18;
    });
  });
  out += text(565, 52, 'PHIẾU TRẢ LỜI TRẮC NGHIỆM', { anchor: 'middle', bold: true, size: 14 });
  out += text(565, 72, title, { anchor: 'middle', size: 12.5 });
  out += text(565, 91, 'Dùng bút mực hoặc bút bi tô kín một ô cho mỗi lựa chọn', { anchor: 'middle', italic: true, size: 11.5 });
  const fields = [
    '1. Họ và tên thí sinh: ....................................................',
    '2. Ngày sinh: ................................... Lớp: .................',
    '3. Phòng thi: ...................... 4. Điểm thi: ......................',
    '5. Chữ kí giám thị 1: ....................................................',
    '6. Chữ kí giám thị 2: ....................................................',
  ];
  fields.forEach((f, i) => { out += text(LEFT, 135 + i * 32, f, { size: 13 }); });
  return out + digitGrid(480, 122, 6, 'Số báo danh') + digitGrid(650, 122, 3, 'Mã đề');
};

const HEADER_END = 340;

interface PageBuilder { pages: string[]; y: number }

const ensureSpace = (b: PageBuilder, height: number) => {
  if (b.y + height > BOTTOM) {
    b.pages.push('');
    b.y = 44;
  }
};
const emit = (b: PageBuilder, svg: string) => { b.pages[b.pages.length - 1] += svg; };

const partOne = (b: PageBuilder, count: number) => {
  if (!count) return;
  const perGroup = 10;
  const groupW = 172;
  const rowStep = 21;
  const groupH = 22 + perGroup * rowStep;
  let heading = `PHẦN I. Thí sinh trả lời từ câu 1 đến câu ${count}. Mỗi câu chọn một phương án.`;
  for (let start = 1, g = 0; start <= count; start += perGroup, g++) {
    const col = g % 4;
    if (col === 0) {
      ensureSpace(b, groupH + (heading ? 22 : 0) + 6);
      if (heading) { emit(b, text(LEFT, b.y + 13, heading, { bold: true, size: 13 })); b.y += 20; heading = ''; }
    }
    const x = LEFT + col * (groupW + 7);
    const top = b.y;
    let out = box(x, top, groupW, groupH);
    ['A', 'B', 'C', 'D'].forEach((l, i) => { out += text(x + 52 + i * 30, top + 15, l, { size: 11, bold: true, anchor: 'middle' }); });
    for (let n = start; n < start + perGroup && n <= count; n++) {
      const cy = top + 30 + (n - start) * rowStep;
      out += text(x + 20, cy + 4, String(n), { size: 12, bold: true, anchor: 'middle' });
      ['A', 'B', 'C', 'D'].forEach((l, i) => { out += bubble(x + 52 + i * 30, cy, l); });
    }
    emit(b, out);
    if (col === 3 || start + perGroup > count) b.y += groupH + 6;
  }
};

const partTwo = (b: PageBuilder, count: number) => {
  if (!count) return;
  const boxW = 172;
  const boxH = 112;
  let heading = `PHẦN II. Thí sinh trả lời từ câu 1 đến câu ${count}. Mỗi ý a), b), c), d) chọn đúng (Đ) hoặc sai (S).`;
  for (let q = 0; q < count; q++) {
    const col = q % 4;
    if (col === 0) {
      ensureSpace(b, boxH + (heading ? 22 : 0) + 6);
      if (heading) { emit(b, text(LEFT, b.y + 13, heading, { bold: true, size: 13 })); b.y += 20; heading = ''; }
    }
    const x = LEFT + col * (boxW + 7);
    const top = b.y;
    let out = box(x, top, boxW, boxH) + text(x + boxW / 2, top + 15, `Câu ${q + 1}`, { size: 12, bold: true, anchor: 'middle' });
    ['a', 'b', 'c', 'd'].forEach((l, i) => {
      const cy = top + 33 + i * 21;
      out += text(x + 28, cy + 4, `${l})`, { size: 12, bold: true, anchor: 'middle' }) + bubble(x + 84, cy, 'Đ') + bubble(x + 130, cy, 'S');
    });
    emit(b, out);
    if (col === 3 || q === count - 1) b.y += boxH + 6;
  }
};

const partThree = (b: PageBuilder, count: number) => {
  if (!count) return;
  const perRow = 6;
  const boxW = 113;
  const boxH = 278;
  let heading = `PHẦN III. Thí sinh trả lời từ câu 1 đến câu ${count}. Mỗi cột tô đúng một kí tự (dấu trừ, dấu phẩy hoặc chữ số).`;
  for (let q = 0; q < count; q++) {
    const col = q % perRow;
    if (col === 0) {
      ensureSpace(b, boxH + (heading ? 22 : 0) + 6);
      if (heading) { emit(b, text(LEFT, b.y + 13, heading, { bold: true, size: 13 })); b.y += 20; heading = ''; }
    }
    const x = LEFT + col * (boxW + 5);
    const top = b.y;
    let out = box(x, top, boxW, boxH) + text(x + boxW / 2, top + 15, `Câu ${q + 1}`, { size: 12, bold: true, anchor: 'middle' });
    for (let c = 0; c < 4; c++) {
      const cx = x + 18 + c * 26;
      out += box(cx - 9, top + 21, 18, 18);
      if (c === 0) out += bubble(cx, top + 50, '-');
      if (c === 1 || c === 2) out += bubble(cx, top + 69, ',');
      for (let d = 0; d < 10; d++) out += bubble(cx, top + 88 + d * 18.6, String(d));
    }
    emit(b, out);
    if (col === perRow - 1 || q === count - 1) b.y += boxH + 6;
  }
};

/** Trả về một SVG cho mỗi trang của phiếu. */
export const buildAnswerSheetPages = (profile: ExamHeaderProfile, counts: AnswerSheetCounts, title: string): string[] => {
  const builder: PageBuilder = { pages: [headerBlock(profile, title)], y: HEADER_END };
  partOne(builder, counts.mc);
  partTwo(builder, counts.tf);
  partThree(builder, counts.short);
  if (counts.essay > 0) {
    ensureSpace(builder, 24);
    emit(builder, text(LEFT, builder.y + 14, `PHẦN IV. Tự luận (${counts.essay} câu): thí sinh làm bài trên giấy thi riêng.`, { bold: true, size: 13 }));
  }
  return builder.pages.map(body =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}"><rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>${body}</svg>`);
};

