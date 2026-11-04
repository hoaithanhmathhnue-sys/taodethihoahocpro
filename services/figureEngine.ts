import './engine/export.js';
import { renderChemFigure } from './chemFigures';

const g = typeof window !== 'undefined' ? (window as any) : (globalThis as any);

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function encodeBase64Utf8(str: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return window.btoa(unescape(encodeURIComponent(str)));
    }
  } catch {
    // ignore
  }
  return encodeURIComponent(str);
}

function decodeBase64Utf8(encoded: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function' && !encoded.includes('%')) {
      return decodeURIComponent(escape(window.atob(encoded)));
    }
  } catch {
    // ignore
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Khung SVG nhỏ báo lỗi vẽ hình (chỉ dùng khi hiển thị trên màn hình, không đưa vào file xuất).
 */
export function figureErrorSvg(message: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const msg = String(message || 'Lỗi không xác định');
  const short = msg.length > 70 ? msg.slice(0, 67) + '...' : msg;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 64" width="440" height="64">' +
    '<rect x="1" y="1" width="438" height="62" rx="6" fill="#fff7f7" stroke="#e57373" stroke-dasharray="5,3"/>' +
    '<text x="220" y="26" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#c62828">' +
    'Không vẽ được hình từ mô tả JSON</text>' +
    `<text x="220" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#8d6e63">${esc(short)}</text>` +
    '</svg>'
  );
}

/**
 * Chuyển cấu hình JSON (chuỗi hoặc object) thành mã SVG hình hóa học.
 * Mặc định trả về '' khi gặp lỗi (giữ hành vi cũ cho xuất Word/ảnh);
 * truyền `{ showError: true }` để nhận khung SVG báo lỗi thay vì để hình biến mất.
 */
export function renderFigureSpecToSvg(
  specInput: string | Record<string, any>,
  _contextHtml?: string,
  opts?: { showError?: boolean }
): string {
  try {
    let spec: Record<string, any>;
    if (typeof specInput === 'string') {
      const cleaned = decodeHtmlEntities(specInput.trim())
        .replace(/^```(?:figure-json|json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      spec = JSON.parse(cleaned);
    } else {
      spec = specInput;
    }
    return renderChemFigure(spec);
  } catch (err: any) {
    console.warn('[FigureEngine] Không thể vẽ hình từ JSON:', err?.message || err, specInput);
    return opts?.showError ? figureErrorSvg(err?.message || String(err)) : '';
  }
}

/**
 * Lấy ngữ cảnh câu hỏi nằm ngay trước khối hình vẽ để đối chiếu tính hợp lệ
 */
export function extractPrecedingQuestionContext(fullText: string, matchOffset: number): string {
  const before = fullText.slice(Math.max(0, matchOffset - 600), matchOffset);
  const cauMatches = [...before.matchAll(/(?:Câu\s+\d+|Bài\s+\d+)/gi)];
  if (cauMatches.length > 0) {
    const lastCau = cauMatches[cauMatches.length - 1];
    return before.slice(lastCau.index ?? 0);
  }
  return before;
}

/**
 * Đóng gói SVG thành thẻ <img> trực tiếp (kèm dữ liệu SVG gốc để tự động nâng cấp lên ảnh PNG 300 DPI)
 * giúp dán thẳng ảnh hình vẽ vào câu hỏi tương ứng.
 */
function wrapSvgAsImageInQuestion(svg: string): string {
  const wMatch = svg.match(/width="([\d.]+)"/);
  const hMatch = svg.match(/height="([\d.]+)"/);
  const w = wMatch ? Math.round(Number(wMatch[1]) * 0.85) : 440;
  const h = hMatch ? Math.round(Number(hMatch[1]) * 0.85) : 200;
  const dataUrl = svgToDataUrl(svg);
  const b64Svg = encodeBase64Utf8(svg);
  return `<div class="figure-svg-container" style="text-align: center; margin: 10pt auto; page-break-inside: avoid;"><img class="figure-auto-img" src="${dataUrl}" data-figure-svg-b64="${b64Svg}" width="${w}" height="${h}" style="display: inline-block; margin: 4pt auto; max-width: 100%; height: auto; border-radius: 4px;" alt="Hình minh họa" /></div>`;
}

/**
 * Tìm và thay thế mọi khối cấu hình hình vẽ (`figure-json`, `:::figure`)
 * trong chuỗi HTML/Markdown bằng ảnh hình vẽ gắn thẳng vào câu hỏi.
 */
export function renderFiguresInHtml(content: string): string {
  if (!content) return content;

  let out = content;

  // 1. <script type="application/json" class="figure-json">...</script>
  out = out.replace(
    /<script[^>]*class=["'][^"']*figure-json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi,
    (_full, jsonBody, offset) => {
      const ctx = extractPrecedingQuestionContext(out, Number(offset) || 0);
      const svg = renderFigureSpecToSvg(jsonBody, ctx);
      return svg ? wrapSvgAsImageInQuestion(svg) : '';
    }
  );

  // 2. <pre><code class="language-figure-json">...</code></pre>
  out = out.replace(
    /<pre[^>]*>\s*<code[^>]*class=["'][^"']*language-figure-json[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_full, jsonBody, offset) => {
      const ctx = extractPrecedingQuestionContext(out, Number(offset) || 0);
      const svg = renderFigureSpecToSvg(jsonBody, ctx);
      return svg ? wrapSvgAsImageInQuestion(svg) : '';
    }
  );

  // 3. <div class="figure-json">...</div> hoặc <pre class="figure-json">...</pre>
  out = out.replace(
    /<(div|pre)[^>]*class=["'][^"']*figure-json[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
    (_full, _tag, jsonBody, offset) => {
      const ctx = extractPrecedingQuestionContext(out, Number(offset) || 0);
      const svg = renderFigureSpecToSvg(jsonBody, ctx);
      return svg ? wrapSvgAsImageInQuestion(svg) : '';
    }
  );

  // 4. Khối ```figure-json ... ``` hoặc :::figure ... ::: còn sót trong HTML/text
  out = out.replace(/```figure-json\s*([\s\S]*?)```/gi, (_full, jsonBody, offset) => {
    const ctx = extractPrecedingQuestionContext(out, Number(offset) || 0);
    const svg = renderFigureSpecToSvg(jsonBody, ctx);
    return svg ? wrapSvgAsImageInQuestion(svg) : '';
  });

  out = out.replace(/:::figure\s*([\s\S]*?):::/gi, (_full, jsonBody, offset) => {
    const ctx = extractPrecedingQuestionContext(out, Number(offset) || 0);
    const svg = renderFigureSpecToSvg(jsonBody, ctx);
    return svg ? wrapSvgAsImageInQuestion(svg) : '';
  });


  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được Blob PNG'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Tự động nâng cấp toàn bộ thẻ <img class="figure-auto-img" data-figure-svg-b64="...">
 * trong DOM sang ảnh PNG 300 DPI thực sự (data:image/png;base64,...) để người dùng có thể
 * click phải "Sao chép hình ảnh" (Copy Image) hoặc kéo thả trực tiếp.
 */
export async function upgradeAutoFigureImagesInDom(
  root?: ParentNode | null,
  dpi = 300
): Promise<void> {
  if (typeof document === 'undefined' || !g.FigExport?.svgToPngBlob) return;
  const container = root || document;
  const imgs = container.querySelectorAll<HTMLImageElement>(
    'img.figure-auto-img[data-figure-svg-b64]:not([data-png-upgraded="true"])'
  );
  for (const img of Array.from(imgs)) {
    const b64 = img.getAttribute('data-figure-svg-b64');
    if (!b64) continue;
    img.setAttribute('data-png-upgraded', 'true');
    try {
      const svgStr = decodeBase64Utf8(b64);
      const { blob } = await g.FigExport.svgToPngBlob(svgStr, dpi);
      const pngDataUrl = await blobToDataUrl(blob);
      img.src = pngDataUrl;
    } catch (e) {
      console.warn('[FigureEngine] Không thể nâng cấp ảnh sang PNG:', e);
    }
  }
}

/**
 * Chuyển chuỗi SVG thành DataURL ảnh PNG 300 DPI
 */
export async function svgToPngDataUrl(svgStr: string, dpi = 300): Promise<string> {
  if (!svgStr) return '';
  try {
    const { blob } = await g.FigExport.svgToPngBlob(svgStr, dpi);
    return await blobToDataUrl(blob);
  } catch {
    return svgToDataUrl(svgStr);
  }
}

/**
 * Sao chép trực tiếp hình vẽ (dưới dạng ảnh PNG 300 DPI) vào Clipboard hệ thống
 */
export async function copySvgAsPngToClipboard(
  svgInput: SVGElement | string,
  dpi = 300
): Promise<boolean> {
  try {
    const { blob } = await g.FigExport.svgToPngBlob(svgInput, dpi);
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[FigureEngine] Không thể copy ảnh vào clipboard:', err);
    return false;
  }
}

/**
 * Chuyển toàn bộ thẻ <svg>...</svg> trong HTML sang thẻ <img src="data:image/png;base64,..." />
 * độ phân giải 300 DPI để nhúng trực tiếp vào file Word (.docx).
 */
export async function convertSvgsToPngInHtml(html: string, dpi = 300): Promise<string> {
  if (!html) return html;

  const withSvgs = renderFiguresInHtml(html);

  const svgRegex = /<svg\b[\s\S]*?<\/svg>/gi;
  const matches = withSvgs.match(svgRegex);
  if (!matches || matches.length === 0) return withSvgs;

  let result = withSvgs;
  for (const svgStr of matches) {
    try {
      const { blob, width, height } = await g.FigExport.svgToPngBlob(svgStr, dpi);
      const dataUrl = await blobToDataUrl(blob);
      const maxDocWidth = 450;
      const scale = width > maxDocWidth ? maxDocWidth / width : 0.85;
      const dispW = Math.round(width * scale);
      const dispH = Math.round(height * scale);
      const imgTag = `<img src="${dataUrl}" width="${dispW}" height="${dispH}" style="display: block; margin: 8pt auto; max-width: 100%;" alt="Hình minh họa" />`;
      result = result.replace(svgStr, imgTag);
    } catch (err) {
      console.warn('[FigureEngine] Lỗi chuyển SVG sang PNG cho Word:', err);
    }
  }

  return result;
}

/**
 * Tách toàn bộ khối figure-json, thẻ <img> có data-figure-svg-b64 và thẻ <svg>
 * ra thành placeholder an toàn trước khi chạy markdown-it và normalizeMathForWord,
 * sau đó chuyển thành ảnh PNG 300 DPI để nhúng vào đúng câu hỏi trong Word (.docx).
 */
export function extractFiguresToPlaceholders(content: string): {
  text: string;
  figures: Array<{ kind: 'json' | 'svg'; payload: string; context?: string }>;
} {
  if (!content) return { text: content, figures: [] };

  const figures: Array<{ kind: 'json' | 'svg'; payload: string; context?: string }> = [];
  const makePh = (kind: 'json' | 'svg', payload: string, offset: number, src: string) => {
    const idx = figures.length;
    const context = extractPrecedingQuestionContext(src, offset);
    figures.push({ kind, payload, context });
    return `\n\n<div data-fig-ph="${idx}"></div>\n\n`;
  };

  let out = content;

  // 0. Thẻ <div class="figure-svg-container"><img ... data-figure-svg-b64="..." /></div> đã được render sẵn
  out = out.replace(
    /<div[^>]*class=["'][^"']*figure-svg-container[^"']*["'][^>]*>\s*<img[^>]*data-figure-svg-b64=["']([^"']+)["'][^>]*>\s*<\/div>/gi,
    (_full, b64, offset) => makePh('svg', decodeBase64Utf8(b64), Number(offset) || 0, out)
  );
  out = out.replace(
    /<img[^>]*data-figure-svg-b64=["']([^"']+)["'][^>]*>/gi,
    (_full, b64, offset) => makePh('svg', decodeBase64Utf8(b64), Number(offset) || 0, out)
  );

  // 1. <script type="application/json" class="figure-json">...</script>
  out = out.replace(
    /<script[^>]*class=["'][^"']*figure-json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi,
    (_full, jsonBody, offset) => makePh('json', jsonBody, Number(offset) || 0, out)
  );

  // 2. ```figure-json ... ``` hoặc :::figure ... :::
  out = out.replace(/```figure-json\s*([\s\S]*?)```/gi, (_full, jsonBody, offset) =>
    makePh('json', jsonBody, Number(offset) || 0, out)
  );
  out = out.replace(/:::figure\s*([\s\S]*?):::/gi, (_full, jsonBody, offset) =>
    makePh('json', jsonBody, Number(offset) || 0, out)
  );

  // 3. <div class="figure-json">...</div> hoặc <pre class="figure-json">...</pre>
  out = out.replace(
    /<(div|pre)[^>]*class=["'][^"']*figure-json[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
    (_full, _tag, jsonBody, offset) => makePh('json', jsonBody, Number(offset) || 0, out)
  );


  // 4. Thẻ <svg>...</svg> có sẵn
  out = out.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgStr, offset) =>
    makePh('svg', svgStr, Number(offset) || 0, out)
  );

  return { text: out, figures };
}

export async function restoreFiguresAsPngForWord(
  html: string,
  figures: Array<{ kind: 'json' | 'svg'; payload: string; context?: string }>,
  dpi = 300
): Promise<string> {
  if (!html || figures.length === 0) return html;

  let out = html;
  for (let i = 0; i < figures.length; i++) {
    const item = figures[i];
    const svgStr =
      item.kind === 'json'
        ? renderFigureSpecToSvg(item.payload, item.context)
        : item.payload;
    let replacement = '';
    if (svgStr && svgStr.startsWith('<svg')) {
      try {
        const { blob, width, height } = await g.FigExport.svgToPngBlob(svgStr, dpi);
        const dataUrl = await blobToDataUrl(blob);
        const maxDocWidth = 500;
        const scale = width > maxDocWidth ? maxDocWidth / width : 0.85;
        const dispW = Math.round(width * scale);
        const dispH = Math.round(height * scale);
        replacement = `<div style="text-align: center; margin: 6pt auto; page-break-inside: avoid; page-break-after: avoid;"><img src="${dataUrl}" width="${dispW}" height="${dispH}" style="display: block; margin: 0 auto; max-width: 100%;" alt="Hình minh họa" /></div>`;
      } catch (err) {
        console.warn('[FigureEngine] Lỗi chuyển SVG sang PNG cho Word:', err);
        replacement = `<div style="text-align: center; margin: 8pt auto;">${svgStr}</div>`;
      }
    }
    const phRegex = new RegExp(`<div\\s+data-fig-ph=["']${i}["']\\s*><\\/div>`, 'gi');
    out = out.replace(phRegex, replacement);
  }

  return out;
}

export async function downloadSvgAsPng(
  svgEl: SVGElement | string,
  filename = 'hinh-ve.png'
): Promise<void> {
  if (g.FigExport && g.FigExport.downloadPNG) {
    await g.FigExport.downloadPNG(svgEl, filename);
  }
}

/**
 * Hướng dẫn prompt cho AI: khai báo hình bằng JSON, app tự vẽ thành ảnh.
 */
const FIGURE_SYNTAX = `
   - Bộ thí nghiệm: {"type": "apparatus", "preset": "distillation"} — preset: distillation (chưng cất), extraction (chiết lỏng – lỏng), titration (chuẩn độ), electrolysis (điện phân), galvanic (pin Galvani). Đổi chú thích bằng "labels", ví dụ pin: {"type": "apparatus", "preset": "galvanic", "labels": {"left": "Zn", "right": "Pb", "leftSolution": "Dung dịch ZnSO4", "rightSolution": "Dung dịch Pb(NO3)2"}}. Để trống chú thích khi câu hỏi hỏi chính chú thích đó: "labels": {"bridge": ""}.
   - Dụng cụ rời có kí hiệu: {"type": "glassware", "items": ["separatory-funnel", "graduated-cylinder", "burette", "condenser"], "labels": ["(I)", "(II)", "(III)", "(IV)"]} — items còn có: erlenmeyer, beaker, round-flask, test-tube, volumetric-flask, pipette.
   - Phổ hồng ngoại: {"type": "ir", "peaks": [{"wavenumber": 3350, "transmittance": 25, "width": 200, "label": "O–H"}, {"wavenumber": 1710, "transmittance": 10, "label": "C=O"}]}.
   - Phổ khối lượng: {"type": "ms", "molecularIon": 58, "peaks": [{"mz": 58, "intensity": 30}, {"mz": 43, "intensity": 100}]}.
   - Công thức cấu tạo 2D từ SMILES: {"type": "structure", "smiles": "CC(=O)OCC", "caption": "Ethyl acetate"}; vòng benzene viết c1ccccc1.
   - Dạng mạch vòng Haworth: {"type": "haworth", "sugar": "alpha-glucose"} — sugar: alpha-glucose, beta-glucose, alpha-fructose, beta-fructose.
   - Chuỗi peptide: {"type": "peptide", "residues": ["Gly", "Ala", "Val"]}.
   - Mắt xích polymer: {"type": "polymer", "preset": "pvc"} — preset: pe, pp, pvc, ps, pan, pmma, capron, nylon-6,6, cao-su-buna; hoặc tự khai báo "unit".`;

export const FIGURE_JSON_HTML_INSTRUCTIONS = `
   ================================================================
   QUY TẮC CHÈN HÌNH HÓA HỌC (APP TỰ VẼ, DÁN ẢNH VÀO ĐÚNG CÂU)
   ================================================================
   Khi câu hỏi cần hình (dụng cụ, sơ đồ thí nghiệm, phổ IR/MS, công thức cấu tạo, mạch vòng, peptide, polymer), chèn thẻ
   <script type="application/json" class="figure-json">{...}</script> ngay dưới lời dẫn, trước các phương án.
   Không vẽ bằng kí tự, không chèn ảnh ngoài, không dùng thẻ <img>. Số liệu trong JSON phải khớp 100% với câu hỏi. Chỉ chèn khi thật sự cần.
   Cú pháp:${FIGURE_SYNTAX}
`;

export const FIGURE_JSON_MARKDOWN_INSTRUCTIONS = `
================================================================
QUY TẮC CHÈN HÌNH HÓA HỌC (APP TỰ VẼ, DÁN ẢNH VÀO ĐÚNG CÂU)
================================================================
Khi câu hỏi cần hình, chèn khối code \`\`\`figure-json ... \`\`\` ngay dưới lời dẫn, trước các phương án. Không vẽ bằng kí tự, không chèn ảnh ngoài. Số liệu phải khớp với câu hỏi.
Cú pháp (nội dung khối là JSON):${FIGURE_SYNTAX}
`;
