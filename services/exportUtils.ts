import MarkdownIt from 'markdown-it';
import { renderMarkdownPreservingMath } from './mathExportUtils';
import { getWordMathFormat, prepareMathForWord } from './wordEquation';
import { extractFiguresToPlaceholders, restoreFiguresAsPngForWord } from './figureEngine';
import { chemHtmlToLatex, normalizeChemText } from './chemFormat';
import { layoutExamForPrint } from './examLayout';
import JSZip from 'jszip';
// @ts-ignore
import { asBlob } from 'html-docx-js-typescript';

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
});

export interface WordExportOptions {
  /** Chế bản đề: chia cột phương án bằng Tab, giữ trọn câu trên một trang */
  examLayout?: boolean;
  /** Chữ ở chân trang, thêm "Trang x/y" phía sau */
  footer?: string;
  landscape?: boolean;
}

const buildWordHtml = async (content: string, fileName: string, opts: WordExportOptions = {}): Promise<string> => {
  let fullHtml = '';
  const { text: contentWithoutFigures, figures } = extractFiguresToPlaceholders(normalizeChemText(content));
  const stripped = contentWithoutFigures.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();
  // Chọn LaTeX: đổi công thức trước khi chia cột để đo đúng độ dài chữ sẽ hiện trong Word
  const applyLayout = (html: string) =>
    opts.examLayout ? layoutExamForPrint(getWordMathFormat() === 'latex' ? chemHtmlToLatex(html) : html) : html;

  const wordCss = `
    body, p, div, li, td, th, span { font-family: 'Times New Roman', serif; }
    .answer-table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt 0; }
    .answer-table th, .answer-table td { border: 1px solid #000; padding: 5pt 6pt; vertical-align: middle; }
    .answer-table th { background-color: #f2f2f2; font-weight: bold; text-align: center; }
    .answer-table td.center { text-align: center; }
    .answer-table td.left { text-align: left; }
    .options { margin-left: 15pt; page-break-inside: avoid; }
    .option-item { margin-bottom: 3pt; }
    .question-number { font-weight: bold; }
  `;

  if (stripped.includes('<!DOCTYPE html>') || (stripped.includes('<html') && stripped.includes('<body'))) {
    fullHtml = applyLayout(stripped).replace(
      /<\/style>/i,
      `
        table { page-break-inside: auto; border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        td, th { border: 1px solid black; padding: 5px; vertical-align: middle; }
        th { background-color: #f2f2f2; font-weight: bold; text-align: center; }
        p { margin-top: 4pt; margin-bottom: 4pt; line-height: 1.4; page-break-inside: avoid; }
        ${wordCss}
      </style>`
    );
  } else {
    // Render markdown to HTML — tạm cất LaTeX để markdown-it không làm hỏng (\\, \{, \[ ...)
    const htmlBody = applyLayout(renderMarkdownPreservingMath(md, stripped));

    const css = `
      <style>
        body { 
          font-family: 'Times New Roman', serif; 
          font-size: 13pt; 
          line-height: 1.5; 
          color: #000;
        }
        h1 { font-size: 16pt; font-weight: bold; text-align: center; margin: 12pt 0 6pt; page-break-after: avoid; }
        h2 { font-size: 14pt; font-weight: bold; margin: 10pt 0 4pt; page-break-after: avoid; }
        h3 { font-size: 13pt; font-weight: bold; margin: 8pt 0 4pt; page-break-after: avoid; }
        h4 { font-size: 13pt; font-weight: bold; font-style: italic; margin: 6pt 0 3pt; page-break-after: avoid; }
        p { margin: 0 0 6pt; text-align: left; page-break-inside: avoid; }
        table { 
          border-collapse: collapse; 
          width: 100%; 
          margin: 8pt 0; 
          page-break-inside: auto;
        }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { 
          border: 1px solid #000; 
          padding: 4pt 6pt; 
          text-align: left; 
          font-size: 12pt;
          vertical-align: middle;
        }
        th { 
          background-color: #f2f2f2; 
          font-weight: bold;
          text-align: center;
        }
        ol, ul { margin: 4pt 0 8pt 20pt; }
        li { margin-bottom: 3pt; }
        strong { font-weight: bold; }
        em, i { font-style: italic; }
        ${wordCss}
      </style>
    `;

    fullHtml = `
      <!DOCTYPE html>
      <html lang="vi">
        <head>
          <meta charset="utf-8">
          <title>${fileName}</title>
          ${css}
        </head>
        <body>
          ${htmlBody}
        </body>
      </html>
    `;
  }

  // Đảm bảo mọi bảng đều có border="1" để hiển thị rõ khung bảng trong Word (bảng tiêu đề đề đã ghi border="0")
  fullHtml = fullHtml.replace(/<table(?![^>]*border=)/gi, '<table border="1" cellspacing="0" cellpadding="5"');
  fullHtml = fullHtml.replace(/<table(?![^>]*cellspacing=)/gi, '<table cellspacing="0"');
  // Word không lấy font từ ô bảng: đưa chữ của ô đơn giản vào đoạn văn có font rõ ràng, giữ căn lề và in đậm của ô
  fullHtml = fullHtml.replace(
    /<(td|th)\b([^>]*)>((?:(?!<\/?(?:td|th|table|p|div|ul|ol)\b)[\s\S])*?)<\/\1>/gi,
    (_m, tag, attrs, inner) => {
      if (!inner.trim()) return `<${tag}${attrs}>${inner}</${tag}>`;
      const isHead = tag.toLowerCase() === 'th';
      const align = /text-align\s*:\s*(left|center|right)/i.exec(attrs)?.[1]
        || (/class\s*=\s*["'][^"']*\bcenter\b/i.test(attrs) ? 'center' : /class\s*=\s*["'][^"']*\bleft\b/i.test(attrs) ? 'left' : '');
      const bold = isHead || /font-weight\s*:\s*bold|class\s*=\s*["'][^"']*\bbold\b/i.test(attrs);
      const style = `margin:0;font-family:'Times New Roman',serif;${isHead || align ? `text-align:${align || 'center'};` : ''}${bold ? 'font-weight:bold;' : ''}`;
      return `<${tag}${attrs}><p style="${style}">${inner}</p></${tag}>`;
    },
  );

  // Word bỏ qua khối rỗng có page-break-before: dùng dấu ngắt trang Word đọc được để mỗi đề sang trang mới
  fullHtml = fullHtml.replace(/<div\b[^>]*page-break-before\s*:\s*always[^>]*>\s*<\/div>/gi, '<br clear="all" style="page-break-before:always" />');

  // Chuẩn hoá công thức cho Word: LaTeX $...$ hoặc Equation (theo lựa chọn của giáo viên)
  fullHtml = prepareMathForWord(fullHtml);

  // Chuyển các hình vẽ thành ảnh PNG 200 DPI nhúng vào Word
  return restoreFiguresAsPngForWord(fullHtml, figures, 200);
};

const PAGE_MARGINS = { top: 720, right: 720, bottom: 720, left: 720 };

/** Sau khi html-docx tạo file: đổi khổ giấy sang A4, thêm chân trang có số trang. */
const finishDocx = async (blob: Blob, opts: WordExportOptions): Promise<Blob> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const doc = await zip.file('word/document.xml')!.async('string');
  const footerText = (opts.footer ? `${opts.footer} – ` : '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const run = (t: string) => `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:i/><w:sz w:val="20"/></w:rPr>${t}</w:r>`;
  const field = (code: string) => run('<w:fldChar w:fldCharType="begin"/>') + run(`<w:instrText xml:space="preserve"> ${code} </w:instrText>`) + run('<w:fldChar w:fldCharType="end"/>');
  zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(`<w:t xml:space="preserve">${footerText}Trang </w:t>`)}${field('PAGE')}${run('<w:t>/</w:t>')}${field('NUMPAGES')}</w:p></w:ftr>`);

  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdPageFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'));
  const types = await zip.file('[Content_Types].xml')!.async('string');
  zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'));

  const pgSz = opts.landscape
    ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
    : '<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>';
  const patched = doc
    .replace(/<w:pgSz\b[^>]*\/>/, pgSz)
    .replace(/<w:sectPr\b([^>]*)>/, '<w:sectPr$1><w:footerReference w:type="default" r:id="rIdPageFooter"/>');
  zip.file('word/document.xml', patched);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

/** Tạo file Word (không tải xuống) — dùng khi cần gộp nhiều file, ví dụ đảo đề, xuất trọn bộ hồ sơ. */
export const contentToDocxBlob = async (content: string, fileName: string, opts: WordExportOptions = {}): Promise<Blob> => {
  const blob = (await asBlob(await buildWordHtml(content, fileName, opts), {
    orientation: opts.landscape ? 'landscape' : 'portrait',
    margins: PAGE_MARGINS,
  })) as Blob;
  return finishDocx(blob, opts);
};

export const exportToDoc = async (content: string, fileName: string, opts: WordExportOptions = {}) => {
  try {
    const blob = await contentToDocxBlob(content, fileName, opts);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("DOCX generation failed, fallback to .doc", error);
    // Fallback sang .doc
    try {
      const fallbackHtml = prepareMathForWord(content.includes('<!DOCTYPE html>') ? content : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${renderMarkdownPreservingMath(md, content)}</body></html>`);
      const blob = new Blob(['\ufeff', fallbackHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (fallbackError) {
      alert("Không thể tạo file Word. Vui lòng thử lại.");
    }
  }
};
