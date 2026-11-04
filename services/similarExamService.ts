import { Type, ThinkingLevel } from "@google/genai";
import { SimilarExamResult, SimilarExamOptions } from "../types";
import { callWithFallback, createGeminiConfig, getAiProvider, wasTruncated, UserFacingError } from "./geminiService";
import { AiProvider, CHEM_EXAM_RULES } from "../constants";
import { FIGURE_JSON_MARKDOWN_INSTRUCTIONS } from "./figureEngine";
import { prepareExamSourceParts } from "./examSourceService";

const SIMILAR_SYSTEM_INSTRUCTION = `Bạn là giáo viên Hóa học THPT ra đề chuyên nghiệp. Nhiệm vụ của bạn là phân tích đề Hóa học mẫu và sinh ra 1 đề tương tự, cùng khối lớp, cùng phạm vi kiến thức.

═══════════════════════════════════════
CHỨC NĂNG CHÍNH
═══════════════════════════════════════

Khi nhận được file PDF/Ảnh đề thi mẫu, bạn sẽ:

1. **PHÂN TÍCH ĐỀ MẪU**:
   - Xác định số lượng câu hỏi.
   - Phân loại dạng bài và chủ đề Hóa học của từng câu.
   - Xác định mức độ khó (Nhận biết/Thông hiểu/Vận dụng/Vận dụng cao).
   - Ghi nhận cấu trúc câu hỏi, bối cảnh, thông số.

2. **SINH 1 ĐỀ MỚI (2 BƯỚC)**:
   - **Bước 1 (Đề thi)**: Sinh nội dung câu hỏi hoàn chỉnh, không kèm lời giải. Giữ nguyên cấu trúc, chỉ thay số liệu/bối cảnh.
   - **Bước 2 (Lời giải)**: Sinh lời giải chi tiết cho đề thi vừa tạo ở Bước 1.

═══════════════════════════════════════
QUY TẮC SINH ĐỀ
═══════════════════════════════════════

### Nguyên tắc bất biến:
✓ Giữ nguyên loại câu hỏi (trắc nghiệm/tự luận).
✓ Giữ nguyên số điểm từng câu.
✓ Giữ nguyên thứ tự chủ đề.
✓ Giữ nguyên độ phức tạp tính toán.

### Nguyên tắc thay đổi:
✓ Thay số liệu: số mol hợp lí, bảo toàn khối lượng, nguyên tố, electron, điện tích đúng 100%.
✓ Thay chất: dùng chất cùng nhóm chức hoặc cùng nhóm nguyên tố, phản ứng vẫn đúng thực tế.
✓ Thay bối cảnh: tình huống thực tiễn, quy trình công nghiệp, thí nghiệm khác nhưng cùng bản chất.
✓ Thay tên riêng: người, địa điểm, tên sản phẩm.

═══════════════════════════════════════
CHUẨN MỰC HÓA HỌC
═══════════════════════════════════════
${CHEM_EXAM_RULES}

═══════════════════════════════════════
ĐỊNH DẠNG XUẤT RA
═══════════════════════════════════════

Ứng dụng sẽ yêu cầu theo 2 LƯỢT riêng (để đề dài không bị cắt):
- LƯỢT 1: trả về JSON { "analysis": "...", "examContent": "..." } — phân tích đề mẫu + ĐỀ MỚI (chỉ câu hỏi, chưa có lời giải).
- LƯỢT 2: chỉ trả về Markdown của LỜI GIẢI cho đề mới (không JSON).
Mỗi lượt làm ĐÚNG phần được yêu cầu trong lượt đó.

## BƯỚC 1: ĐỀ THI (field 'examContent')
Trình bày rõ ràng, phân chia các phần:
**Câu 1:** ...
**Câu 2:** ...

## BƯỚC 2: HƯỚNG DẪN GIẢI CHI TIẾT (field 'detailedSolution')

#### I. BẢNG ĐÁP ÁN NHANH (BẮT BUỘC CÓ)
**1. Trắc nghiệm nhiều phương án:**
Câu 1: A | Câu 2: B | Câu 3: C | ...

**2. Trắc nghiệm Đúng - Sai (Đ/S) (BẮT BUỘC LẬP BẢNG ĐỦ 4 ĐÁP ÁN a, b, c, d):**
| Câu | Ý a) | Ý b) | Ý c) | Ý d) |
| :---: | :---: | :---: | :---: | :---: |
| **Câu 1** | **Đ** | **S** | **Đ** | **S** |
| **Câu 2** | **S** | **Đ** | **S** | **Đ** |

**3. Trả lời ngắn:**
Câu ...: Đáp số là ...

#### II. LỜI GIẢI CHI TIẾT (BẮT BUỘC GIẢI TẤT CẢ CÁC CÂU)
- **ĐẶC BIỆT CHÚ Ý PHẦN ĐÚNG - SAI (Đ/S):** Bắt buộc trình bày dưới dạng **Bảng thông tin hướng dẫn giải và 4 đáp án** cho từng câu Đúng - Sai (để khi xuất ra file Word có bảng đầy đủ 4 đáp án a, b, c, d và lời giải chi tiết cho từng ý):
| Câu | Ý | Đáp án (Đ/S) | Hướng dẫn giải chi tiết |
| :---: | :---: | :---: | :--- |
| **Câu 1** | **a)** | **Đ** | Giải thích / lời giải chi tiết cho ý a)... |
| **Câu 1** | **b)** | **S** | Giải thích / lời giải chi tiết cho ý b)... |
| **Câu 1** | **c)** | **Đ** | Giải thích / lời giải chi tiết cho ý c)... |
| **Câu 1** | **d)** | **S** | Giải thích / lời giải chi tiết cho ý d)... |

## Quy tắc Markdown & Hình vẽ trực quan:
- Công thức hóa học viết bằng thẻ <sub>, <sup> ngay trong Markdown, ví dụ H<sub>2</sub>SO<sub>4</sub>, Fe<sup>3+</sup>.
${FIGURE_JSON_MARKDOWN_INSTRUCTIONS}
`;


/** Đọc JSON trả về từ AI: chịu được code fence ```json và ký tự thừa trước/sau. */
const parseJsonLoose = <T,>(text: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw err;
  }
};

const buildCustomInstructions = (options?: SimilarExamOptions): string => {
  let customInstructions = "";
  if (!options) return customInstructions;
  if (options.diagramMode === 'detailed') {
    customInstructions += `\n\n### YÊU CẦU NÂNG CAO VỀ HÌNH VẼ (High Detail):
- Đề mẫu có hình nào thì đề mới có hình tương ứng bằng khối \`\`\`figure-json ... \`\`\`: dụng cụ, bộ thí nghiệm, phổ IR/MS, công thức cấu tạo, mạch vòng, peptide, polymer; ghi đủ chú thích và số liệu.`;
  } else {
    customInstructions += `\n\n### YÊU CẦU VỀ HÌNH VẼ (Standard):
- Câu cần hình thì dùng khối \`\`\`figure-json ... \`\`\` để app tự vẽ.`;
  }
  if (options.solutionMode === 'concise') {
    customInstructions += `\n\n### YÊU CẦU VỀ LỜI GIẢI (Concise Mode):
- TRẢ LỜI NGẮN GỌN. Tập trung vào đáp số và 1-2 bước biến đổi chốt.`;
  } else if (options.solutionMode === 'very_detailed') {
    customInstructions += `\n\n### YÊU CẦU VỀ LỜI GIẢI (Deep Dive Mode):
- GIẢI CỰC KỲ CHI TIẾT. Mỗi bài gồm: Phân tích đề → Chiến lược → Lời giải → Sai lầm thường gặp.`;
  } else {
    customInstructions += `\n\n### YÊU CẦU VỀ LỜI GIẢI (Standard Mode):
- Lời giải chi tiết, đầy đủ các bước, trình bày sư phạm, dễ hiểu.`;
  }
  return customInstructions;
};

const TRUNCATED_NOTE = '\n\n> ⚠️ Lời giải quá dài nên bị cắt ở đây. Hãy chọn "Chi tiết lời giải: Ngắn gọn" hoặc model Pro rồi tạo lại để có lời giải đầy đủ.';

/**
 * Tạo đề tương tự theo 2 lượt (tránh đề dài bị cắt cụt khi gộp tất cả vào 1 JSON):
 *  - Lượt 1 (JSON nhỏ): phân tích đề mẫu + đề mới.  → gọi onExamReady để hiện đề ngay.
 *  - Lượt 2 (Markdown): lời giải chi tiết cho đề mới; bị cắt do quá dài thì tự viết tiếp tối đa 2 lần.
 */
export const generateSimilarExam = async (
  base64Data: string,
  mimeType: string,
  options?: SimilarExamOptions,
  preferredModel?: string,
  provider: AiProvider = getAiProvider(),
  onExamReady?: (partial: SimilarExamResult) => void,
  fileName?: string
): Promise<SimilarExamResult> => {
  const finalSystemInstruction = SIMILAR_SYSTEM_INSTRUCTION + buildCustomInstructions(options);
  // PDF/ảnh gửi nguyên file; Word .docx được app đọc trước (bảng, công thức LaTeX, hình)
  const sourceParts = await prepareExamSourceParts(base64Data, mimeType, fileName);

  // ---------- LƯỢT 1: phân tích + đề mới ----------
  const step1 = await callWithFallback(
    async (ai, modelName) => {
      console.log(`[SimilarExam] (${provider}) Lượt 1 – model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          role: 'user',
          parts: [
            ...sourceParts,
            { text: "LƯỢT 1: Hãy phân tích đề thi này và tạo 1 ĐỀ MỚI tương tự (giữ nguyên số câu, dạng câu, thứ tự phần, điểm). CHỈ trả về JSON gồm 'analysis' và 'examContent' — CHƯA viết lời giải." }
          ]
        },
        config: createGeminiConfig({
          provider,
          model: modelName,
          systemInstruction: finalSystemInstruction,
          thinkingLevel: ThinkingLevel.MEDIUM,
          maxOutputTokens: 32768,
          temperature: 0.5,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING, description: "Phân tích chi tiết cấu trúc, ma trận đề thi mẫu." },
              examContent: { type: Type.STRING, description: "Nội dung ĐỀ THI mới (Bước 1) - Chỉ chứa câu hỏi." },
            },
            required: ["analysis", "examContent"]
          }
        })
      });

      const text = response.text;
      if (!text) throw new Error("AI không trả về nội dung.");
      if (wasTruncated(response)) {
        throw new UserFacingError('Đề mẫu quá dài nên AI bị cắt giữa chừng khi tạo đề mới. Hãy tách đề mẫu thành 2 phần (ví dụ phần trắc nghiệm và phần tự luận) rồi tạo lần lượt, hoặc chọn model Pro.');
      }
      try {
        const parsed = parseJsonLoose<{ analysis?: string; examContent?: string }>(text);
        if (!parsed.examContent || !parsed.examContent.trim()) throw new Error('missing examContent');
        return { analysis: parsed.analysis || '', examContent: parsed.examContent };
      } catch {
        throw new UserFacingError('AI trả về dữ liệu không đúng định dạng. Vui lòng bấm "Thử lại".');
      }
    },
    preferredModel,
    provider
  );

  onExamReady?.({ ...step1, detailedSolution: '' });

  // ---------- LƯỢT 2: lời giải chi tiết (Markdown, tự viết tiếp nếu bị cắt) ----------
  let solution = '';
  try {
  for (let round = 0; round < 3; round++) {
    const isContinuation = round > 0;
    const prompt = isContinuation
      ? `ĐỀ THI:\n${step1.examContent}\n\n===== LỜI GIẢI ĐÃ VIẾT (bị cắt do quá dài) =====\n${solution}\n\n===== YÊU CẦU =====\nHãy VIẾT TIẾP lời giải ngay từ chỗ bị cắt ở trên. KHÔNG lặp lại phần đã viết, KHÔNG viết lại tiêu đề. Chỉ trả về Markdown phần viết tiếp.`
      : `LƯỢT 2: Dưới đây là ĐỀ MỚI vừa tạo. Hãy viết HƯỚNG DẪN GIẢI CHI TIẾT cho đề này đúng định dạng "BƯỚC 2" (I. Bảng đáp án nhanh, II. Lời giải chi tiết cho TẤT CẢ các câu). CHỈ trả về nội dung Markdown của lời giải (không JSON, không chép lại đề).\n\nĐỀ MỚI:\n${step1.examContent}`;
    const { text, truncated } = await callWithFallback(
      async (ai, modelName) => {
        console.log(`[SimilarExam] (${provider}) Lượt 2${isContinuation ? ` (viết tiếp ${round})` : ''} – model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { role: 'user', parts: [{ text: prompt }] },
          config: createGeminiConfig({
            provider,
            model: modelName,
            systemInstruction: finalSystemInstruction,
            thinkingLevel: ThinkingLevel.MEDIUM,
            maxOutputTokens: 32768,
            temperature: 0.3,
          })
        });
        return {
          text: (response.text || '').replace(/^\s*```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/i, ''),
          truncated: wasTruncated(response),
        };
      },
      preferredModel,
      provider
    );
    solution += text; // phần viết tiếp nối liền chỗ bị cắt
    if (!truncated) break;
    if (round === 2) solution += TRUNCATED_NOTE;
  }
  } catch (err: any) {
    // Đề mới đã có → không bỏ đi; chỉ báo lời giải chưa tạo xong
    console.warn('[SimilarExam] Lượt 2 (lời giải) lỗi:', err);
    solution += `\n\n> ⚠️ Chưa tạo xong lời giải: ${err?.message || 'lỗi không xác định'}. Bấm "Tạo đề mới" để thử lại.`;
  }

  return { ...step1, detailedSolution: solution };
};
