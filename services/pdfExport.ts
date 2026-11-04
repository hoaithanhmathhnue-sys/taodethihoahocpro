/**
 * XUẤT PDF KHÓA FONT: dựng trang A4 trong iframe ẩn, ngắt trang theo khối (không cắt câu),
 * chụp từng trang thành ảnh rồi ghép PDF. Chữ thành ảnh nên in ở máy nào cũng giống nhau.
 */
import katex from 'katex';
import { renderFiguresInHtml, svgToPngDataUrl } from './figureEngine';
import { layoutExamForPrint } from './examLayout';
import { normalizeChemText } from './chemFormat';

const PAGE_W = 794; // A4 ở 96 dpi
const PAGE_H = 1123;
const MARGIN = 58;
const FOOTER_H = 26;

const PRINT_CSS = `
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${PAGE_W}px; font-family: "Times New Roman", Times, serif; font-size: 13pt; line-height: 1.35; }
.pdf-page { position: relative; width: ${PAGE_W}px; height: ${PAGE_H}px; box-sizing: border-box; padding: ${MARGIN}px ${MARGIN}px ${MARGIN}px; overflow: hidden; background: #fff; }
.pdf-footer { position: absolute; left: ${MARGIN}px; right: ${MARGIN}px; bottom: 22px; text-align: center; font-size: 10.5pt; font-style: italic; }
p { margin: 3pt 0; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
th { background: #f2f2f2; }
table.exam-header, table.exam-header td { border: none; }
img { max-width: 100%; }
.options { margin-left: 12pt; }
.question-number { font-weight: bold; }
`;

const katexCss = (): string => {
  // Lấy lại CSS KaTeX đang nạp trong trang để công thức phân số, căn hiển thị đúng
  let css = '';
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      const rules = Array.from(sheet.cssRules || []);
      if (rules.some(r => r.cssText.includes('.katex'))) css += rules.map(r => r.cssText).join('\n');
    } catch {
      // Stylesheet khác nguồn: bỏ qua
    }
  });
  return css;
};

const renderLatexSpans = (html: string): string =>
  html
    .replace(/(?<![\\$])\$\$([\s\S]+?)\$\$/g, (full, tex) => {
      try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch { return full; }
    })
    .replace(/(?<![\\$])\$(?!\$)([^\n$]+?)(?<!\\)\$(?!\$)/g, (full, tex) => {
      try { return katex.renderToString(tex, { throwOnError: false }); } catch { return full; }
    });

const bodyInner = (html: string): string => {
  const m = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return m ? m[1] : html;
};
const docStyles = (html: string): string => (html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');

/** Tách nội dung thành các khối không được cắt ngang. */
const collectBlocks = (root: Element, contentH: number): HTMLElement[] => {
  const out: HTMLElement[] = [];
  const doc = root.ownerDocument;
  Array.from(root.childNodes).forEach(node => {
    if (node.nodeType === 3) {
      if ((node.textContent || '').trim()) {
        const d = doc.createElement('div');
        d.textContent = node.textContent;
        out.push(d);
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (['STYLE', 'SCRIPT', 'META', 'TITLE', 'LINK'].includes(tag)) return;
    const isContainer = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'CENTER'].includes(tag) && !el.classList.contains('q-block') && el.children.length > 0;
    if (isContainer && el.getBoundingClientRect().height > contentH * 0.4) {
      out.push(...collectBlocks(el, contentH));
      return;
    }
    out.push(el);
  });
  return out;
};

/** Bảng dài hơn một trang: tách theo hàng, lặp lại tiêu đề. */
const splitTable = (table: HTMLTableElement, contentH: number): HTMLElement[] => {
  const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr')) as HTMLTableRowElement[];
  const head = table.querySelector(':scope > thead');
  const parts: HTMLElement[] = [];
  const headH = head ? head.getBoundingClientRect().height : 0;
  let current: HTMLTableElement | null = null;
  let body: HTMLElement | null = null;
  let used = 0;
  const start = () => {
    current = table.cloneNode(false) as HTMLTableElement;
    if (head) current.appendChild(head.cloneNode(true));
    body = table.ownerDocument.createElement('tbody');
    current.appendChild(body);
    used = headH;
    parts.push(current);
  };
  rows.forEach(row => {
    const h = row.getBoundingClientRect().height;
    if (!current || used + h > contentH * 0.95) start();
    body!.appendChild(row.cloneNode(true));
    used += h;
  });
  return parts.length ? parts : [table];
};

/** Ghép các trang SVG (phiếu trả lời) thành PDF. */
export const svgPagesToPdfBlob = async (pages: string[], dpi = 200): Promise<Blob> => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    const dataUrl = await svgToPngDataUrl(pages[i], dpi);
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return pdf.output('blob');
};

export interface PdfOptions {
  /** Chữ ở chân trang, thêm "Trang x/y" phía sau */
  footer?: string;
  /** Chế bản câu hỏi (chia cột, giữ trọn câu) */
  examLayout?: boolean;
  /** Độ nét: 2 ≈ 192 dpi */
  scale?: number;
}

export const htmlToPdfBlob = async (content: string, opts: PdfOptions = {}): Promise<Blob> => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  let html = renderFiguresInHtml(normalizeChemText(content));
  if (opts.examLayout) html = layoutExamForPrint(html);
  const inner = renderLatexSpans(bodyInner(html));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">${docStyles(html)}<style>${katexCss()}${PRINT_CSS}</style></head><body><div id="flow" style="width:${PAGE_W - 2 * MARGIN}px">${inner}</div></body></html>`);
    doc.close();
    await new Promise(r => setTimeout(r, 60));
    await Promise.all(Array.from(doc.images).map(img => (img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(null); }))));
    if ((doc as any).fonts?.ready) await (doc as any).fonts.ready;

    const contentH = PAGE_H - 2 * MARGIN - FOOTER_H;
    const flow = doc.getElementById('flow')!;
    const blocks = collectBlocks(flow, contentH).flatMap(b =>
      b.tagName === 'TABLE' && b.getBoundingClientRect().height > contentH * 0.9 ? splitTable(b as HTMLTableElement, contentH) : [b]);

    // Xếp khối vào trang; đo chiều cao thực trong trang để tính cả lề giữa các khối
    const pages: HTMLElement[] = [];
    const newPage = () => {
      const page = doc.createElement('div');
      page.className = 'pdf-page';
      const holder = doc.createElement('div');
      holder.className = 'pdf-content';
      page.appendChild(holder);
      doc.body.appendChild(page);
      pages.push(page);
      return holder;
    };
    let holder = newPage();
    blocks.forEach(block => {
      const clone = block.cloneNode(true) as HTMLElement;
      holder.appendChild(clone);
      if (holder.getBoundingClientRect().height > contentH && holder.children.length > 1) {
        holder.removeChild(clone);
        holder = newPage();
        holder.appendChild(clone);
      }
    });
    flow.remove();

    pages.forEach((page, i) => {
      const f = doc.createElement('div');
      f.className = 'pdf-footer';
      f.textContent = `${opts.footer ? `${opts.footer} – ` : ''}Trang ${i + 1}/${pages.length}`;
      page.appendChild(f);
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const scale = opts.scale ?? 2;
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: PAGE_W, windowHeight: PAGE_H });
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
};
