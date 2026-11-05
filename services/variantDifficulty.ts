/**
 * Độ khó của 3 đề biến thể so với đề gốc.
 * Để riêng (không phụ thuộc Gemini SDK) để kiểm thử được nội dung lệnh gửi cho AI.
 */
export type VariantDifficultyMode = 'progressive' | 'same';
export type VariantDifficultyLevel = 'equal' | 'harder' | 'hardest';

export const VARIANT_DIFFICULTY_MODES: { id: VariantDifficultyMode; name: string; help: string }[] = [
  { id: 'progressive', name: 'Tăng dần: Đề 1 tương đương, Đề 2 và Đề 3 khó hơn', help: 'Đề 3 là đề khó nhất' },
  { id: 'same', name: 'Cả 3 đề tương đương đề gốc', help: 'Dùng khi cần các đề song song, công bằng giữa các lớp' },
];

export const VARIANT_LEVEL_LABELS: Record<VariantDifficultyLevel, string> = {
  equal: 'Tương đương đề gốc',
  harder: 'Khó hơn đề gốc',
  hardest: 'Khó hơn rõ rệt',
};

export const getVariantLevel = (mode: VariantDifficultyMode, step: number): VariantDifficultyLevel => {
  if (mode === 'same' || step <= 1) return 'equal';
  return step === 2 ? 'harder' : 'hardest';
};

/** Quy tắc chung, nằm trong lệnh hệ thống của phiên sinh đề. */
export const VARIANT_DIFFICULTY_RULES = `
## QUY TẮC VỀ ĐỘ KHÓ (BẮT BUỘC)
Câu biến thể dễ hơn câu cùng vị trí trong đề gốc là LỖI, dù kiến thức vẫn đúng. Mỗi bước sẽ nêu mức độ khó cần đạt so với ĐỀ GỐC.

**Thước đo độ khó của một câu:** (a) số bước suy luận, tính toán để ra đáp án; (b) số dữ kiện học sinh phải tự suy ra hoặc kết hợp; (c) số mạch kiến thức phải vận dụng cùng lúc; (d) độ sát của phương án nhiễu hoặc của các ý Đúng/Sai.

**Những thay đổi làm câu DỄ ĐI, không được dùng:**
- Bớt bước suy luận; bỏ chất dư, hiệu suất, giai đoạn chuyển hóa hoặc hỗn hợp có trong câu gốc.
- Cho sẵn dữ kiện mà câu gốc bắt phải suy ra; đổi hỗn hợp thành một chất; đổi chất, phản ứng khó thành chất, phản ứng quen thuộc.
- Bỏ bảng số liệu, đồ thị, hình vẽ, sơ đồ thí nghiệm mà câu gốc yêu cầu đọc và phân tích.
- Đổi câu phải giải thích, so sánh, đánh giá thành câu chỉ cần nhớ lại.
- Chọn số liệu tròn đến mức nhẩm ngay ra đáp án; dùng phương án nhiễu dễ loại; viết ý Đúng/Sai nhận ra đúng sai mà không cần lập luận.

**Cách tăng độ khó khi được yêu cầu:**
- Thêm ít nhất một bước suy luận: thêm giai đoạn chuyển hóa, chất dư cần xác định, hiệu suất, hoặc hỗn hợp hai chất phải lập hệ.
- Cho dữ kiện gián tiếp: thay số mol có sẵn bằng đại lượng phải suy ra (thể tích khí, khối lượng kết tủa, pH, kết quả chuẩn độ, bảng số liệu, đồ thị).
- Kết hợp hai mạch kiến thức có trong phạm vi đề gốc.
- Câu lí thuyết: chuyển sang so sánh, giải thích, dự đoán hiện tượng, hoặc đánh giá nhiều phát biểu.
- Phần I: phương án nhiễu là kết quả của lỗi sai thật ở chính bước đã thêm.
- Phần II: ý c, d phải lập luận hoặc tính toán, không phải kiến thức nhớ lại.
- Phần III: đáp án phải qua ít nhất hai bước tính hoặc một chuỗi suy luận.

**Giới hạn khi tăng độ khó:** vẫn đúng khối lớp và phạm vi kiến thức của đề gốc, không ra ngoài chương trình; không đổi dạng câu, số câu, thang điểm; câu mức Biết vẫn là câu Biết; học sinh vẫn đủ thời gian làm bài như đề gốc; không làm khó bằng số liệu xấu vô nghĩa, câu chữ rối hoặc hiện tượng hóa học không có thật.

**Quy trình trong phần suy nghĩ, KHÔNG in ra:**
1. Với từng câu của ĐỀ GỐC, xác định mức độ và các thước đo (a), (b), (c), (d).
2. Soạn câu biến thể theo mức độ khó của bước hiện tại, rồi tự giải đầy đủ để chắc chắn số liệu và đáp án đúng.
3. Đối chiếu từng cặp câu với ĐỀ GỐC. Câu nào dễ hơn câu gốc hoặc chưa đạt mức yêu cầu thì viết lại rồi mới in ra.

Không in bảng phân tích và không ghi nhãn độ khó vào đề thi.
`;

const LEVEL_REQUIREMENTS: Record<VariantDifficultyLevel, string> = {
  equal: `**ĐỘ KHÓ CẦN ĐẠT: TƯƠNG ĐƯƠNG ĐỀ GỐC.** Từng câu phải bằng hoặc nhỉnh hơn câu cùng vị trí của đề gốc theo các thước đo độ khó; không câu nào được dễ hơn.`,
  harder: `**ĐỘ KHÓ CẦN ĐẠT: KHÓ HƠN ĐỀ GỐC.** Trong mỗi phần, tăng độ khó ở khoảng một nửa số câu, ưu tiên câu mức Hiểu và Vận dụng; mỗi câu đó có thêm ít nhất một bước suy luận hoặc một dữ kiện gián tiếp so với câu gốc. Các câu còn lại không được dễ hơn câu gốc.`,
  hardest: `**ĐỘ KHÓ CẦN ĐẠT: KHÓ HƠN RÕ RỆT, LÀ ĐỀ KHÓ NHẤT TRONG 3 ĐỀ.** Tất cả câu mức Vận dụng và đa số câu mức Hiểu phải khó hơn câu gốc: thêm ít nhất một bước suy luận và dùng dữ kiện gián tiếp. Mỗi phần có ít nhất một câu kết hợp hai mạch kiến thức trong phạm vi đề gốc. Câu mức Biết có phương án nhiễu sát hơn; không câu nào được dễ hơn câu gốc.`,
};

const ANSWER_REQUIREMENT = '- Đáp án: Câu dễ chỉ cần đáp án (1.A). Câu khó và mọi câu đã tăng độ khó phải có lời giải vắn tắt, tính đúng theo số liệu mới.';

/** Lệnh cho từng bước. Luôn đối chiếu với ĐỀ GỐC để độ khó không tụt dần qua các đề. */
export const buildVariantStepPrompt = (step: number, mode: VariantDifficultyMode): string => {
  const requirement = LEVEL_REQUIREMENTS[getVariantLevel(mode, step)];
  if (step <= 1) {
    return `BƯỚC 1:
Dựa vào file đề gốc, hãy sinh ra **ĐỀ BIẾN THỂ SỐ 1**.
Ngay sau đó, viết **ĐÁP ÁN CHI TIẾT CHO ĐỀ SỐ 1**.

${requirement}

Yêu cầu:
- Đề thi: Đủ số lượng câu như đề gốc, đúng môn học và khối lớp của đề gốc. Đầy đủ nội dung.
${ANSWER_REQUIREMENT}`;
  }
  return `BƯỚC ${step}:
Tiếp tục sinh ra **ĐỀ BIẾN THỂ SỐ ${step}** (Khác số liệu/cách hỏi so với các đề trước).
Ngay sau đó, viết **ĐÁP ÁN CHI TIẾT CHO ĐỀ SỐ ${step}**.

${requirement}
Mốc so sánh độ khó là ĐỀ GỐC đã gửi ở Bước 1, không phải các đề biến thể vừa sinh. Hãy đọc lại từng câu của đề gốc trước khi soạn.

Yêu cầu:
- Đề thi: Đủ số lượng câu và đúng cấu trúc như đề gốc (không ít hơn, không nhiều hơn).
${ANSWER_REQUIREMENT}`;
};
