/**
 * DỮ LIỆU CHƯƠNG TRÌNH HÓA HỌC THPT — bộ sách Kết nối tri thức với cuộc sống (lớp 10, 11, 12).
 * Yêu cầu cần đạt viết theo Chương trình GDPT 2018 môn Hóa học, chia 3 mức Biết – Hiểu – Vận dụng.
 * Số tiết là số GỢI Ý (70 tiết/năm, 2 tiết/tuần) để phân bổ câu hỏi và lọc theo kỳ;
 * giáo viên sửa được trên màn hình hoặc tải PPCT của trường để thay thế.
 */
import type { Chapter, Lesson, LearningObjectives } from '../types';

interface LessonSeed {
  no: number;
  name: string;
  periods: number;
  obj: LearningObjectives;
}

interface ChapterSeed {
  name: string;
  /** Số tiết không phải bài kiến thức (ôn tập, kiểm tra, thực hành) tính vào tiến độ tuần */
  extraPeriods: number;
  lessons: LessonSeed[];
  /** Bắt đầu học kì II: tiến độ nhảy sang tuần 19 */
  startsSemester2?: boolean;
}

const GRADE_10: ChapterSeed[] = [
  {
    name: 'Chương 1: Cấu tạo nguyên tử',
    extraPeriods: 2,
    lessons: [
      { no: 1, name: 'Thành phần của nguyên tử', periods: 2, obj: {
        biet: 'Nêu được thành phần của nguyên tử; điện tích, khối lượng của proton, neutron, electron; đơn vị amu.',
        hieu: 'So sánh được khối lượng của electron với proton và neutron, kích thước của hạt nhân với kích thước nguyên tử.',
        van_dung: 'Tính được số hạt và khối lượng nguyên tử từ dữ kiện tổng số hạt, tỉ lệ các loại hạt.' } },
      { no: 2, name: 'Nguyên tố hóa học', periods: 2, obj: {
        biet: 'Trình bày được khái niệm nguyên tố hóa học, số hiệu nguyên tử, số khối, kí hiệu nguyên tử, đồng vị.',
        hieu: 'Xác định được số proton, neutron, electron từ kí hiệu nguyên tử; đọc được phổ khối lượng của đồng vị.',
        van_dung: 'Tính được nguyên tử khối trung bình và phần trăm đồng vị dựa vào phổ khối lượng hoặc số liệu cho trước.' } },
      { no: 3, name: 'Cấu trúc lớp vỏ electron nguyên tử', periods: 4, obj: {
        biet: 'Trình bày được khái niệm orbital nguyên tử, lớp, phân lớp electron; quy tắc viết cấu hình electron.',
        hieu: 'Viết được cấu hình electron và biểu diễn orbital của nguyên tử có Z = 1 đến 20; xác định số electron hóa trị, số electron độc thân.',
        van_dung: 'Dự đoán được tính kim loại, phi kim, khí hiếm của nguyên tố từ cấu hình electron.' } },
    ],
  },
  {
    name: 'Chương 2: Bảng tuần hoàn các nguyên tố hóa học',
    extraPeriods: 1,
    lessons: [
      { no: 5, name: 'Cấu tạo của bảng tuần hoàn các nguyên tố hóa học', periods: 2, obj: {
        biet: 'Nêu được nguyên tắc sắp xếp của bảng tuần hoàn; khái niệm ô, chu kì, nhóm; các khối s, p, d, f.',
        hieu: 'Xác định được vị trí nguyên tố từ cấu hình electron và ngược lại.',
        van_dung: 'Suy luận được loại nguyên tố và tính chất cơ bản khi biết vị trí trong bảng tuần hoàn.' } },
      { no: 6, name: 'Xu hướng biến đổi một số tính chất của nguyên tử các nguyên tố trong một chu kì và trong một nhóm', periods: 3, obj: {
        biet: 'Nêu được xu hướng biến đổi bán kính nguyên tử, độ âm điện, tính kim loại, tính phi kim trong chu kì và nhóm.',
        hieu: 'Giải thích được xu hướng biến đổi dựa vào điện tích hạt nhân và số lớp electron.',
        van_dung: 'So sánh và sắp xếp được bán kính, độ âm điện, tính kim loại – phi kim của một dãy nguyên tố.' } },
      { no: 7, name: 'Xu hướng biến đổi thành phần và một số tính chất của hợp chất trong một chu kì', periods: 2, obj: {
        biet: 'Nêu được hóa trị cao nhất với oxygen, hóa trị với hydrogen và thành phần oxide, hydroxide theo chu kì.',
        hieu: 'Nhận xét được xu hướng biến đổi tính acid – base của oxide và hydroxide trong một chu kì.',
        van_dung: 'So sánh được tính acid – base của các hợp chất dựa vào vị trí nguyên tố.' } },
      { no: 8, name: 'Định luật tuần hoàn. Ý nghĩa của bảng tuần hoàn các nguyên tố hóa học', periods: 2, obj: {
        biet: 'Phát biểu được định luật tuần hoàn.',
        hieu: 'Trình bày được ý nghĩa của bảng tuần hoàn trong việc dự đoán tính chất.',
        van_dung: 'Dự đoán được tính chất của nguyên tố và hợp chất từ vị trí trong bảng tuần hoàn.' } },
    ],
  },
  {
    name: 'Chương 3: Liên kết hóa học',
    extraPeriods: 2,
    lessons: [
      { no: 10, name: 'Quy tắc octet', periods: 1, obj: {
        biet: 'Trình bày được quy tắc octet.',
        hieu: 'Vận dụng quy tắc octet giải thích sự hình thành liên kết của nguyên tử nhóm A.',
        van_dung: 'Xác định được xu hướng nhường, nhận hoặc góp chung electron của nguyên tử.' } },
      { no: 11, name: 'Liên kết ion', periods: 2, obj: {
        biet: 'Nêu được khái niệm ion, liên kết ion; đặc điểm tinh thể NaCl.',
        hieu: 'Giải thích được sự hình thành liên kết ion và một số tính chất của hợp chất ion.',
        van_dung: 'Viết được quá trình tạo ion và dự đoán hợp chất tạo liên kết ion từ cặp nguyên tố.' } },
      { no: 12, name: 'Liên kết cộng hóa trị', periods: 4, obj: {
        biet: 'Nêu được khái niệm liên kết cộng hóa trị, liên kết đơn, đôi, ba, liên kết σ, π, năng lượng liên kết.',
        hieu: 'Viết được công thức Lewis; phân loại liên kết theo hiệu độ âm điện; xác định số liên kết σ, π.',
        van_dung: 'Giải thích được độ bền phân tử và tính chất của chất dựa vào năng lượng liên kết.' } },
      { no: 13, name: 'Liên kết hydrogen và tương tác van der Waals', periods: 2, obj: {
        biet: 'Trình bày được khái niệm liên kết hydrogen và tương tác van der Waals.',
        hieu: 'Giải thích được ảnh hưởng của liên kết hydrogen, tương tác van der Waals đến nhiệt độ sôi, độ tan.',
        van_dung: 'So sánh được nhiệt độ sôi và độ tan trong nước của một số chất.' } },
    ],
  },
  {
    name: 'Chương 4: Phản ứng oxi hóa – khử',
    extraPeriods: 2,
    lessons: [
      { no: 15, name: 'Phản ứng oxi hóa – khử', periods: 4, obj: {
        biet: 'Nêu được khái niệm số oxi hóa, chất oxi hóa, chất khử, quá trình oxi hóa, quá trình khử.',
        hieu: 'Xác định được số oxi hóa, vai trò các chất; cân bằng phản ứng bằng phương pháp thăng bằng electron.',
        van_dung: 'Giải được bài tập chuẩn độ và bảo toàn electron; nêu được ý nghĩa của phản ứng oxi hóa – khử trong thực tiễn.' } },
    ],
  },
  {
    name: 'Chương 5: Năng lượng hóa học',
    startsSemester2: true,
    extraPeriods: 1,
    lessons: [
      { no: 17, name: 'Biến thiên enthalpy trong các phản ứng hóa học', periods: 6, obj: {
        biet: 'Trình bày được khái niệm phản ứng tỏa nhiệt, thu nhiệt, biến thiên enthalpy chuẩn Δ<sub>r</sub>H<sup>o</sup><sub>298</sub>, enthalpy tạo thành chuẩn Δ<sub>f</sub>H<sup>o</sup><sub>298</sub>.',
        hieu: 'Đọc được phương trình nhiệt hóa học và sơ đồ biểu diễn biến thiên enthalpy.',
        van_dung: 'Tính được Δ<sub>r</sub>H<sup>o</sup><sub>298</sub> theo enthalpy tạo thành và năng lượng liên kết E<sub>b</sub>; vận dụng vào nhiên liệu và thực tiễn.' } },
    ],
  },
  {
    name: 'Chương 6: Tốc độ phản ứng hóa học',
    extraPeriods: 1,
    lessons: [
      { no: 19, name: 'Tốc độ phản ứng', periods: 7, obj: {
        biet: 'Nêu được khái niệm tốc độ phản ứng, tốc độ trung bình, hằng số tốc độ, các yếu tố ảnh hưởng, vai trò của chất xúc tác.',
        hieu: 'Giải thích được ảnh hưởng của nồng độ, nhiệt độ, áp suất, diện tích bề mặt, xúc tác; hệ số nhiệt độ Van’t Hoff.',
        van_dung: 'Tính được tốc độ trung bình và tốc độ theo định luật tác dụng khối lượng; đề xuất cách điều chỉnh tốc độ trong thực tiễn.' } },
    ],
  },
  {
    name: 'Chương 7: Nguyên tố nhóm halogen',
    extraPeriods: 1,
    lessons: [
      { no: 21, name: 'Nhóm halogen', periods: 4, obj: {
        biet: 'Nêu được trạng thái tự nhiên, tính chất vật lí, cách điều chế chlorine; xu hướng biến đổi tính chất của các đơn chất halogen.',
        hieu: 'Viết được phương trình phản ứng của halogen với kim loại, hydrogen, nước, dung dịch kiềm.',
        van_dung: 'So sánh được tính oxi hóa của các halogen; giải thích ứng dụng và biện pháp an toàn.' } },
      { no: 22, name: 'Hydrogen halide. Muối halide', periods: 6, obj: {
        biet: 'Nêu được tính chất vật lí của hydrogen halide, ứng dụng của một số hợp chất halogen.',
        hieu: 'Giải thích được xu hướng nhiệt độ sôi, tính acid của hydrohalic acid và tính khử của ion halide; nhận biết ion halide bằng AgNO<sub>3</sub>.',
        van_dung: 'Giải được bài toán định lượng về acid HCl, muối halide; giải thích ứng dụng thực tiễn (HF khắc thủy tinh, NaCl).' } },
    ],
  },
];

const GRADE_11: ChapterSeed[] = [
  {
    name: 'Chương 1: Cân bằng hóa học',
    extraPeriods: 1,
    lessons: [
      { no: 1, name: 'Khái niệm về cân bằng hóa học', periods: 3, obj: {
        biet: 'Nêu được khái niệm phản ứng một chiều, thuận nghịch, trạng thái cân bằng, hằng số cân bằng K<sub>C</sub>; nguyên lí Le Chatelier.',
        hieu: 'Viết được biểu thức K<sub>C</sub>; dự đoán chiều chuyển dịch cân bằng khi thay đổi nồng độ, nhiệt độ, áp suất.',
        van_dung: 'Tính được K<sub>C</sub> và nồng độ lúc cân bằng; vận dụng cân bằng vào sản xuất ammonia, sulfuric acid.' } },
      { no: 2, name: 'Cân bằng trong dung dịch nước', periods: 4, obj: {
        biet: 'Nêu được khái niệm sự điện li, chất điện li, thuyết Brønsted – Lowry, pH, chỉ thị acid – base, ý nghĩa của chuẩn độ.',
        hieu: 'Tính được pH từ nồng độ ion; xác định acid, base theo Brønsted – Lowry; giải thích sự thủy phân của ion Al<sup>3+</sup>, Fe<sup>3+</sup>, CO<sub>3</sub><sup>2-</sup>.',
        van_dung: 'Xử lí số liệu chuẩn độ acid – base; vận dụng pH vào đời sống, nuôi trồng, xử lí nước.' } },
    ],
  },
  {
    name: 'Chương 2: Nitrogen và sulfur',
    extraPeriods: 1,
    lessons: [
      { no: 4, name: 'Nitrogen', periods: 2, obj: {
        biet: 'Nêu được trạng thái tự nhiên, tính chất vật lí, ứng dụng của nitrogen.',
        hieu: 'Giải thích được tính trơ của N<sub>2</sub> ở nhiệt độ thường dựa vào năng lượng liên kết; viết phản ứng với H<sub>2</sub>, O<sub>2</sub>.',
        van_dung: 'Vận dụng giải thích chu trình nitrogen và hiện tượng tự nhiên.' } },
      { no: 5, name: 'Ammonia. Muối ammonium', periods: 3, obj: {
        biet: 'Nêu được cấu tạo, tính chất vật lí, ứng dụng của ammonia và muối ammonium; quá trình Haber.',
        hieu: 'Viết được phản ứng thể hiện tính base, tính khử của NH<sub>3</sub>; phản ứng nhận biết ion NH<sub>4</sub><sup>+</sup>, nhiệt phân muối ammonium.',
        van_dung: 'Tính hiệu suất tổng hợp ammonia; đánh giá việc sử dụng phân đạm và điều kiện công nghiệp.' } },
      { no: 6, name: 'Một số hợp chất của nitrogen với oxygen', periods: 3, obj: {
        biet: 'Nêu được một số oxide của nitrogen, nguồn phát thải, hiện tượng mưa acid, phú dưỡng; cấu tạo của HNO<sub>3</sub>.',
        hieu: 'Viết được phản ứng thể hiện tính acid, tính oxi hóa của HNO<sub>3</sub>.',
        van_dung: 'Tính toán với HNO<sub>3</sub> bằng bảo toàn electron; đề xuất biện pháp giảm ô nhiễm NO<sub>x</sub>.' } },
      { no: 7, name: 'Sulfur và sulfur dioxide', periods: 2, obj: {
        biet: 'Nêu được trạng thái tự nhiên, tính chất vật lí, ứng dụng của sulfur và SO<sub>2</sub>; nguồn phát thải SO<sub>2</sub>.',
        hieu: 'Giải thích được tính oxi hóa và tính khử của sulfur, SO<sub>2</sub>.',
        van_dung: 'Đề xuất biện pháp giảm phát thải SO<sub>2</sub>; tính toán theo phương trình phản ứng.' } },
      { no: 8, name: 'Sulfuric acid và muối sulfate', periods: 3, obj: {
        biet: 'Nêu được cấu tạo, tính chất vật lí, quy tắc an toàn khi dùng H<sub>2</sub>SO<sub>4</sub> đặc; quy trình sản xuất và ứng dụng.',
        hieu: 'Viết được phản ứng thể hiện tính acid, tính oxi hóa mạnh, tính háo nước; nhận biết ion SO<sub>4</sub><sup>2-</sup>.',
        van_dung: 'Tính toán sản xuất H<sub>2</sub>SO<sub>4</sub> theo hiệu suất; giải thích ứng dụng của muối sulfate.' } },
    ],
  },
  {
    name: 'Chương 3: Đại cương về hóa học hữu cơ',
    extraPeriods: 5,
    lessons: [
      { no: 10, name: 'Hợp chất hữu cơ và hóa học hữu cơ', periods: 2, obj: {
        biet: 'Nêu được khái niệm hợp chất hữu cơ, đặc điểm chung, nhóm chức; phân loại hydrocarbon và dẫn xuất.',
        hieu: 'Xác định được nhóm chức dựa vào tín hiệu đặc trưng trên phổ hồng ngoại (IR).',
        van_dung: 'Phân tích được phổ IR để dự đoán chất và nhóm chức có trong mẫu.' } },
      { no: 11, name: 'Phương pháp tách biệt và tinh chế hợp chất hữu cơ', periods: 2, obj: {
        biet: 'Nêu được nguyên tắc của chưng cất, chiết, kết tinh và sắc kí cột; nhận biết dụng cụ tương ứng.',
        hieu: 'Lựa chọn được phương pháp tách phù hợp với hỗn hợp cho trước.',
        van_dung: 'Thiết kế được cách tách, tinh chế chất trong thực tiễn (chưng rượu, tách tinh dầu, kết tinh đường).' } },
      { no: 12, name: 'Công thức phân tử hợp chất hữu cơ', periods: 2, obj: {
        biet: 'Nêu được khái niệm công thức phân tử, công thức đơn giản nhất.',
        hieu: 'Xác định được phân tử khối từ phổ khối lượng (MS).',
        van_dung: 'Lập được công thức phân tử từ phần trăm khối lượng nguyên tố và phổ MS.' } },
      { no: 13, name: 'Cấu tạo hóa học hợp chất hữu cơ', periods: 3, obj: {
        biet: 'Nêu được nội dung cơ bản của thuyết cấu tạo hóa học; khái niệm đồng đẳng, đồng phân.',
        hieu: 'Viết được công thức cấu tạo, xác định đồng đẳng và đồng phân của chất đơn giản.',
        van_dung: 'Biện luận được cấu tạo từ dữ kiện thực nghiệm; đếm số đồng phân.' } },
    ],
  },
  {
    name: 'Chương 4: Hydrocarbon',
    startsSemester2: true,
    extraPeriods: 1,
    lessons: [
      { no: 15, name: 'Alkane', periods: 3, obj: {
        biet: 'Nêu được khái niệm alkane, danh pháp IUPAC, tính chất vật lí, ứng dụng và nguồn alkane.',
        hieu: 'Viết được phản ứng thế halogen, cracking, reforming, cháy; dự đoán sản phẩm thế.',
        van_dung: 'Tính nhiệt lượng khi đốt nhiên liệu; đánh giá ô nhiễm từ nhiên liệu hóa thạch.' } },
      { no: 16, name: 'Hydrocarbon không no', periods: 4, obj: {
        biet: 'Nêu được khái niệm alkene, alkyne, danh pháp, đồng phân hình học, ứng dụng.',
        hieu: 'Viết được phản ứng cộng (quy tắc Markovnikov), trùng hợp, oxi hóa, phản ứng của alk-1-yne với AgNO<sub>3</sub>/NH<sub>3</sub>.',
        van_dung: 'Phân biệt alkane, alkene, alk-1-yne; giải bài toán hỗn hợp và cộng hydrogen.' } },
      { no: 17, name: 'Arene (Hydrocarbon thơm)', periods: 3, obj: {
        biet: 'Nêu được cấu tạo benzene, danh pháp một số arene, ứng dụng và tác hại.',
        hieu: 'Viết được phản ứng thế halogen, nitro hóa, phản ứng oxi hóa nhóm alkyl; quy tắc thế vòng benzene.',
        van_dung: 'Giải thích được định hướng thế; tính toán điều chế theo hiệu suất.' } },
    ],
  },
  {
    name: 'Chương 5: Dẫn xuất halogen – Alcohol – Phenol',
    extraPeriods: 1,
    lessons: [
      { no: 19, name: 'Dẫn xuất halogen', periods: 2, obj: {
        biet: 'Nêu được khái niệm, danh pháp, tính chất vật lí và ứng dụng của dẫn xuất halogen.',
        hieu: 'Viết được phản ứng thế nhóm –X bằng nhóm –OH, phản ứng tách theo quy tắc Zaitsev.',
        van_dung: 'Đánh giá được tác hại của một số dẫn xuất halogen (CFC, thuốc trừ sâu).' } },
      { no: 20, name: 'Alcohol', periods: 3, obj: {
        biet: 'Nêu được khái niệm, bậc alcohol, danh pháp, liên kết hydrogen, độ cồn, ứng dụng.',
        hieu: 'Viết được phản ứng với Na, tách nước, oxi hóa, phản ứng của polyalcohol với Cu(OH)<sub>2</sub>.',
        van_dung: 'Tính độ cồn, nhiệt lượng cháy; giải thích tác hại của methanol, ethanol.' } },
      { no: 21, name: 'Phenol', periods: 2, obj: {
        biet: 'Nêu được cấu tạo, tính chất vật lí, ứng dụng và tính độc của phenol.',
        hieu: 'Giải thích được tính acid yếu của phenol và phản ứng thế ở vòng thơm dễ hơn benzene.',
        van_dung: 'So sánh tính acid với alcohol, carbonic acid; tính toán theo phương trình.' } },
    ],
  },
  {
    name: 'Chương 6: Hợp chất carbonyl – Carboxylic acid',
    extraPeriods: 8,
    lessons: [
      { no: 23, name: 'Hợp chất carbonyl', periods: 3, obj: {
        biet: 'Nêu được khái niệm, danh pháp aldehyde, ketone; tín hiệu C=O trên phổ IR; ứng dụng.',
        hieu: 'Viết được phản ứng khử, phản ứng với thuốc thử Tollens, Cu(OH)<sub>2</sub>/OH<sup>-</sup>, I<sub>2</sub>/NaOH.',
        van_dung: 'Phân biệt aldehyde và ketone; xác định cấu tạo từ dữ kiện thí nghiệm và phổ.' } },
      { no: 24, name: 'Carboxylic acid', periods: 3, obj: {
        biet: 'Nêu được khái niệm, danh pháp, tính chất vật lí, tín hiệu phổ IR, ứng dụng của carboxylic acid.',
        hieu: 'Viết được phản ứng thể hiện tính acid, phản ứng ester hóa; giải thích nhiệt độ sôi cao.',
        van_dung: 'Tính hằng số cân bằng và hiệu suất ester hóa; thiết kế thí nghiệm điều chế ester.' } },
    ],
  },
];

const GRADE_12: ChapterSeed[] = [
  {
    name: 'Chương 1: Ester – Lipid',
    extraPeriods: 1,
    lessons: [
      { no: 1, name: 'Ester – Lipid', periods: 3, obj: {
        biet: 'Nêu được khái niệm, danh pháp ester, chất béo, acid béo; tính chất vật lí; ứng dụng.',
        hieu: 'Viết được phản ứng thủy phân ester, xà phòng hóa, hydrogen hóa chất béo; đọc phổ IR của ester.',
        van_dung: 'Tính toán xà phòng hóa, chỉ số chất béo; thiết kế thí nghiệm khảo sát phản ứng ester hóa.' } },
      { no: 2, name: 'Xà phòng và chất giặt rửa tổng hợp', periods: 2, obj: {
        biet: 'Nêu được thành phần, cấu tạo phần ưa nước và kị nước của xà phòng, chất giặt rửa tổng hợp.',
        hieu: 'Giải thích được cơ chế giặt rửa và hạn chế của xà phòng trong nước cứng.',
        van_dung: 'Tính khối lượng xà phòng theo hiệu suất; đánh giá tác động môi trường của chất giặt rửa.' } },
    ],
  },
  {
    name: 'Chương 2: Carbohydrate',
    extraPeriods: 1,
    lessons: [
      { no: 4, name: 'Giới thiệu về carbohydrate. Glucose và fructose', periods: 3, obj: {
        biet: 'Nêu được khái niệm, phân loại carbohydrate; dạng mạch hở và mạch vòng α, β của glucose, fructose.',
        hieu: 'Viết được phản ứng với Cu(OH)<sub>2</sub>, thuốc thử Tollens, nước bromine, phản ứng lên men; nhận ra nhóm –OH hemiacetal.',
        van_dung: 'Tính toán lên men, tráng bạc theo hiệu suất; giải thích ứng dụng của glucose.' } },
      { no: 5, name: 'Saccharose và maltose', periods: 2, obj: {
        biet: 'Nêu được cấu tạo, tính chất vật lí, trạng thái tự nhiên, ứng dụng của saccharose, maltose.',
        hieu: 'Phân tích được liên kết α-1,2-glycoside, α-1,4-glycoside; viết phản ứng thủy phân, phản ứng với Cu(OH)<sub>2</sub>.',
        van_dung: 'Tính toán thủy phân, cân bằng vật chất trong sản xuất đường saccharose.' } },
      { no: 6, name: 'Tinh bột và cellulose', periods: 2, obj: {
        biet: 'Nêu được thành phần, cấu trúc (amylose, amylopectin, cellulose), trạng thái tự nhiên, ứng dụng.',
        hieu: 'Viết được phản ứng thủy phân, phản ứng của tinh bột với iodine, cellulose với HNO<sub>3</sub>.',
        van_dung: 'Tính toán sản xuất ethanol, cellulose nitrate; giải thích quá trình quang hợp và chuyển hóa tinh bột.' } },
    ],
  },
  {
    name: 'Chương 3: Hợp chất chứa nitrogen',
    extraPeriods: 1,
    lessons: [
      { no: 8, name: 'Amine', periods: 3, obj: {
        biet: 'Nêu được khái niệm, bậc amine, danh pháp, tính chất vật lí, ứng dụng.',
        hieu: 'Viết được phản ứng thể hiện tính base, phản ứng của aniline với nước bromine, với HNO<sub>2</sub>; so sánh lực base.',
        van_dung: 'Giải bài toán amine với acid; xác định cấu tạo; giải thích cách khử mùi tanh của cá.' } },
      { no: 9, name: 'Amino acid và peptide', periods: 3, obj: {
        biet: 'Nêu được khái niệm amino acid, tên thường gọi và kí hiệu một số amino acid; liên kết peptide.',
        hieu: 'Giải thích được tính lưỡng tính, dạng ion lưỡng cực, tính điện di; phản ứng màu biuret, thủy phân peptide.',
        van_dung: 'Xác định số loại peptide, tính khối lượng khi thủy phân, dự đoán điện di theo pH.' } },
      { no: 10, name: 'Protein và enzyme', periods: 2, obj: {
        biet: 'Nêu được khái niệm, cấu tạo, tính chất vật lí của protein; khái niệm và đặc điểm của enzyme.',
        hieu: 'Giải thích được sự đông tụ, phản ứng màu biuret, thủy phân protein.',
        van_dung: 'Vận dụng vào dinh dưỡng, đời sống và ứng dụng của enzyme trong công nghiệp.' } },
    ],
  },
  {
    name: 'Chương 4: Polymer',
    extraPeriods: 2,
    lessons: [
      { no: 12, name: 'Đại cương về polymer', periods: 2, obj: {
        biet: 'Nêu được khái niệm polymer, monomer, mắt xích, hệ số trùng hợp, danh pháp, phân loại.',
        hieu: 'Phân biệt được phản ứng trùng hợp, trùng ngưng; phản ứng giữ mạch, cắt mạch, tăng mạch.',
        van_dung: 'Tính hệ số trùng hợp, hiệu suất trùng hợp; xác định monomer từ polymer.' } },
      { no: 13, name: 'Vật liệu polymer', periods: 3, obj: {
        biet: 'Nêu được khái niệm và ứng dụng của chất dẻo, tơ, cao su, keo dán, vật liệu composite.',
        hieu: 'Viết được phản ứng tổng hợp polymer thông dụng (PE, PVC, PS, PMMA, nylon-6,6, capron, cao su buna).',
        van_dung: 'Đề xuất sử dụng, xử lí rác thải polymer; tính toán theo sơ đồ sản xuất.' } },
    ],
  },
  {
    name: 'Chương 5: Pin điện và điện phân',
    extraPeriods: 1,
    lessons: [
      { no: 15, name: 'Thế điện cực và nguồn điện hóa học', periods: 3, obj: {
        biet: 'Nêu được khái niệm cặp oxi hóa – khử, thế điện cực chuẩn E<sup>o</sup>, cấu tạo pin Galvani Zn–Cu, cầu muối, acquy, pin nhiên liệu.',
        hieu: 'So sánh tính oxi hóa – khử dựa vào E<sup>o</sup>; viết quá trình ở các điện cực; dự đoán chiều phản ứng.',
        van_dung: 'Tính sức điện động chuẩn E<sup>o</sup><sub>pin</sub>; đánh giá ưu nhược điểm của các nguồn điện.' } },
      { no: 16, name: 'Điện phân', periods: 2, obj: {
        biet: 'Nêu được khái niệm điện phân nóng chảy, điện phân dung dịch; các điện cực anode, cathode.',
        hieu: 'Viết được quá trình ở các điện cực và phương trình điện phân NaCl, CuSO<sub>4</sub>; thứ tự điện phân.',
        van_dung: 'Tính toán định lượng theo công thức Faraday (dung dịch CuSO<sub>4</sub> + NaCl); ứng dụng tinh luyện, mạ điện, sản xuất Al.' } },
    ],
  },
  {
    name: 'Chương 6: Đại cương về kim loại',
    startsSemester2: true,
    extraPeriods: 1,
    lessons: [
      { no: 18, name: 'Cấu tạo và liên kết trong tinh thể kim loại', periods: 1, obj: {
        biet: 'Nêu được đặc điểm cấu tạo nguyên tử kim loại, liên kết kim loại.',
        hieu: 'Giải thích tính chất chung của kim loại dựa vào liên kết kim loại.',
        van_dung: 'Liên hệ cấu tạo với ứng dụng của một số kim loại.' } },
      { no: 19, name: 'Tính chất vật lí và tính chất hóa học của kim loại', periods: 3, obj: {
        biet: 'Nêu được tính chất vật lí chung và tính chất hóa học đặc trưng của kim loại.',
        hieu: 'Viết được phản ứng của kim loại với phi kim, HCl, H<sub>2</sub>SO<sub>4</sub>, nước, dung dịch muối dựa vào giá trị E<sup>o</sup>.',
        van_dung: 'Giải bài toán kim loại tác dụng với acid, muối bằng bảo toàn electron.' } },
      { no: 20, name: 'Kim loại trong tự nhiên và phương pháp tách kim loại', periods: 2, obj: {
        biet: 'Nêu được trạng thái tự nhiên và các phương pháp nhiệt luyện, thủy luyện, điện phân.',
        hieu: 'Chọn được phương pháp tách phù hợp với từng kim loại; viết phản ứng nhiệt nhôm, khử quặng.',
        van_dung: 'Tính khối lượng kim loại thu được theo hiệu suất; đánh giá tái chế kim loại.' } },
      { no: 21, name: 'Hợp kim', periods: 1, obj: {
        biet: 'Nêu được khái niệm hợp kim, thành phần và ứng dụng của gang, thép, duralumin.',
        hieu: 'So sánh tính chất của hợp kim với kim loại thành phần.',
        van_dung: 'Giải thích cách chọn hợp kim trong thực tiễn; tính thành phần hợp kim.' } },
      { no: 22, name: 'Sự ăn mòn kim loại', periods: 2, obj: {
        biet: 'Nêu được khái niệm ăn mòn hóa học, ăn mòn điện hóa, các biện pháp chống ăn mòn.',
        hieu: 'Phân tích điều kiện và cơ chế ăn mòn điện hóa, viết quá trình ở điện cực.',
        van_dung: 'Đề xuất biện pháp bảo vệ kim loại (phủ bề mặt, bảo vệ điện hóa) trong tình huống thực tế.' } },
    ],
  },
  {
    name: 'Chương 7: Nguyên tố nhóm IA và nhóm IIA',
    extraPeriods: 1,
    lessons: [
      { no: 24, name: 'Nguyên tố nhóm IA', periods: 3, obj: {
        biet: 'Nêu được cấu hình electron, tính chất vật lí, cách bảo quản kim loại nhóm IA; ứng dụng của NaCl, NaHCO<sub>3</sub>, Na<sub>2</sub>CO<sub>3</sub>.',
        hieu: 'Giải thích tính khử mạnh của kim loại IA; viết phản ứng; trình bày phương pháp Solvay, nhận biết ion bằng màu ngọn lửa.',
        van_dung: 'Tính toán sản xuất soda; xử lí tình huống sử dụng và an toàn với kim loại kiềm.' } },
      { no: 25, name: 'Nguyên tố nhóm IIA', periods: 3, obj: {
        biet: 'Nêu được cấu hình electron, tính chất, ứng dụng của kim loại nhóm IIA và hợp chất; khái niệm nước cứng.',
        hieu: 'Giải thích xu hướng độ tan, độ bền nhiệt của muối; phản ứng của Ca(OH)<sub>2</sub>, CaCO<sub>3</sub>; phương pháp làm mềm nước cứng.',
        van_dung: 'Tính toán về nước cứng, đá vôi, xi măng; giải thích hiện tượng tự nhiên (hang động, thạch nhũ).' } },
    ],
  },
  {
    name: 'Chương 8: Sơ lược về dãy kim loại chuyển tiếp thứ nhất và phức chất',
    extraPeriods: 11,
    lessons: [
      { no: 27, name: 'Đại cương về kim loại chuyển tiếp dãy thứ nhất', periods: 2, obj: {
        biet: 'Nêu được cấu hình electron, số oxi hóa đặc trưng, tính chất vật lí của kim loại chuyển tiếp dãy thứ nhất.',
        hieu: 'Trình bày được màu và tính oxi hóa – khử của hợp chất Fe, Cu, Cr, Mn; chuẩn độ KMnO<sub>4</sub>/FeSO<sub>4</sub>.',
        van_dung: 'Giải bài toán chuẩn độ KMnO<sub>4</sub> và xác định hàm lượng Fe(II).' } },
      { no: 28, name: 'Sơ lược về phức chất', periods: 2, obj: {
        biet: 'Nêu được khái niệm phức chất, nguyên tử trung tâm, phối tử, liên kết cho – nhận, phức chất aqua.',
        hieu: 'Xác định được điện tích, số phối trí, dạng hình học của phức chất như [Cu(NH<sub>3</sub>)<sub>4</sub>]<sup>2+</sup>, [Al(OH)<sub>4</sub>]<sup>-</sup>, [Co(OH<sub>2</sub>)<sub>6</sub>]<sup>2+</sup>.',
        van_dung: 'Phân tích sơ đồ hình thành phức chất và số liên kết cho – nhận.' } },
      { no: 29, name: 'Một số tính chất và ứng dụng của phức chất', periods: 2, obj: {
        biet: 'Nêu được một số ứng dụng của phức chất trong y học, sản xuất, phân tích hóa học.',
        hieu: 'Giải thích được sự thay đổi màu khi thay thế phối tử trong dung dịch.',
        van_dung: 'Thiết kế, giải thích thí nghiệm tạo phức chất; xử lí tình huống về phản ứng thế phối tử.' } },
    ],
  },
];

const GRADE_DATA: Record<string, ChapterSeed[]> = { '10': GRADE_10, '11': GRADE_11, '12': GRADE_12 };

const PERIODS_PER_WEEK = 2;
const SEMESTER_1_WEEKS = 18;

/** Dựng danh sách chương + tuần học từ dữ liệu một khối. */
const buildGrade = (grade: string, namePrefix = ''): Chapter[] => {
  let elapsed = 0;
  return GRADE_DATA[grade].map((seed, ci) => {
    if (seed.startsSemester2) elapsed = Math.max(elapsed, SEMESTER_1_WEEKS * PERIODS_PER_WEEK);
    const chapterId = `g${grade}_c${ci + 1}`;
    const lessons: Lesson[] = seed.lessons.map(l => {
      const weekStart = Math.floor(elapsed / PERIODS_PER_WEEK) + 1;
      elapsed += l.periods;
      const weekEnd = Math.floor((elapsed - 1) / PERIODS_PER_WEEK) + 1;
      return {
        id: `g${grade}_b${l.no}`,
        name: `Bài ${l.no}. ${l.name}`,
        periods: l.periods,
        weekStart,
        weekEnd,
        objectives: { ...l.obj },
      };
    });
    elapsed += seed.extraPeriods;
    return {
      id: chapterId,
      name: `${namePrefix}${seed.name}`,
      lessons,
      totalPeriods: lessons.reduce((sum, l) => sum + l.periods, 0),
    };
  });
};

/** Chương trình của một khối theo sách Kết nối tri thức. */
export const getChemistryChapters = (grade: string): Chapter[] =>
  GRADE_DATA[grade] ? buildGrade(grade) : [];

/** Toàn bộ chương trình 3 khối (cho đề ôn thi tốt nghiệp THPT). */
export const getAllChemistryChapters = (): Chapter[] =>
  ['12', '11', '10'].flatMap(g => buildGrade(g, `Lớp ${g} – `));
