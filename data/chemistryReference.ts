/**
 * DỮ LIỆU THAM CHIẾU MÔN HÓA HỌC: nguyên tử khối, hằng số, thế điện cực chuẩn, số sóng phổ IR,
 * danh pháp IUPAC, và khuôn mẫu đề rút ra từ 2 đề tốt nghiệp THPT 2026 (mã 0323, mã 0344 lần 2)
 * trong thư mục tailieuhoahoc. Phần khuôn mẫu chỉ tóm tắt cấu trúc và dạng bài, không chép câu hỏi.
 */

/** Nguyên tử khối dùng trong đề (làm tròn theo SGK). */
export const ATOMIC_MASSES: Record<string, number> = {
  H: 1, He: 4, Li: 7, Be: 9, B: 11, C: 12, N: 14, O: 16, F: 19, Ne: 20, Na: 23, Mg: 24, Al: 27, Si: 28, P: 31, S: 32,
  Cl: 35.5, Ar: 40, K: 39, Ca: 40, Ti: 48, V: 51, Cr: 52, Mn: 55, Fe: 56, Co: 59, Ni: 59, Cu: 64, Zn: 65, As: 75,
  Br: 80, Rb: 85.5, Sr: 88, Ag: 108, Sn: 119, I: 127, Cs: 133, Ba: 137, Au: 197, Hg: 201, Pb: 207,
};

/** Tên IUPAC của nguyên tố → kí hiệu (để nhận ra nguyên tố được nhắc đến bằng chữ). */
export const ELEMENT_NAMES: Record<string, string> = {
  hydrogen: 'H', helium: 'He', lithium: 'Li', beryllium: 'Be', boron: 'B', carbon: 'C', nitrogen: 'N', oxygen: 'O',
  fluorine: 'F', neon: 'Ne', sodium: 'Na', magnesium: 'Mg', aluminium: 'Al', silicon: 'Si', phosphorus: 'P', sulfur: 'S',
  chlorine: 'Cl', argon: 'Ar', potassium: 'K', calcium: 'Ca', titanium: 'Ti', vanadium: 'V', chromium: 'Cr',
  manganese: 'Mn', iron: 'Fe', cobalt: 'Co', nickel: 'Ni', copper: 'Cu', zinc: 'Zn', arsenic: 'As', bromine: 'Br',
  rubidium: 'Rb', strontium: 'Sr', silver: 'Ag', tin: 'Sn', iodine: 'I', caesium: 'Cs', barium: 'Ba', gold: 'Au',
  mercury: 'Hg', lead: 'Pb',
};

/** Thứ tự in trong dòng "Cho biết nguyên tử khối" (theo số hiệu nguyên tử). */
export const ELEMENT_ORDER = Object.keys(ATOMIC_MASSES);

export const CHEM_CONSTANTS = {
  molarVolumeStandard: '24,79 L/mol (điều kiện chuẩn: 25 °C, 1 bar)',
  avogadro: '6,022.10²³ mol⁻¹',
  gasConstant: '8,314 J/(mol.K)',
  faraday: '96 500 C/mol',
  waterIonProduct: '10⁻¹⁴ (ở 25 °C)',
};

/** Thế điện cực chuẩn (V) của các cặp thường gặp. */
export const STANDARD_POTENTIALS: Array<[string, number]> = [
  ['Li⁺/Li', -3.04], ['K⁺/K', -2.925], ['Ba²⁺/Ba', -2.906], ['Ca²⁺/Ca', -2.866], ['Na⁺/Na', -2.714], ['Mg²⁺/Mg', -2.356],
  ['Al³⁺/Al', -1.676], ['Mn²⁺/Mn', -1.18], ['Zn²⁺/Zn', -0.763], ['Cr³⁺/Cr', -0.74], ['Fe²⁺/Fe', -0.44], ['Ni²⁺/Ni', -0.257],
  ['Sn²⁺/Sn', -0.137], ['Pb²⁺/Pb', -0.126], ['2H⁺/H₂', 0], ['Cu²⁺/Cu', 0.34], ['Fe³⁺/Fe²⁺', 0.771], ['Ag⁺/Ag', 0.799], ['Au³⁺/Au', 1.52],
];

/** Số sóng hấp thụ đặc trưng trên phổ IR (cm⁻¹). */
export const IR_BANDS: Array<[string, string]> = [
  ['O–H (alcohol, phenol)', '3650 – 3200'],
  ['O–H (carboxylic acid)', '3300 – 2500'],
  ['N–H (amine)', '3500 – 3300'],
  ['C–H (no)', '3000 – 2850'],
  ['C≡C', '2260 – 2100'],
  ['C=O (aldehyde, ketone, ester, acid)', '1780 – 1650'],
  ['C=C', '1680 – 1620'],
  ['C–O', '1300 – 1000'],
];

/**
 * Chuyển tên cũ → danh pháp IUPAC theo SGK mới. Sắp xếp để cụm dài được thay trước cụm ngắn.
 * Không đưa vào đây các từ nhiều nghĩa ("đồng", "bạc", "vàng", "chì", "oxi" trong "oxi hóa"):
 * các từ đó có quy tắc riêng trong services/chemFormat.ts.
 */
export const IUPAC_NAME_MAP: Array<[string, string]> = [
  // Acid
  ['axit clohiđric', 'hydrochloric acid'], ['axit clohidric', 'hydrochloric acid'],
  ['axit sunfuric', 'sulfuric acid'], ['axit nitric', 'nitric acid'], ['axit photphoric', 'phosphoric acid'],
  ['axit axetic', 'acetic acid'], ['axit fomic', 'formic acid'], ['axit cacboxylic', 'carboxylic acid'],
  ['axit béo', 'acid béo'], ['axit cacbonic', 'carbonic acid'], ['axit sunfurơ', 'sulfurous acid'],
  ['amino axit', 'amino acid'], ['aminoaxit', 'amino acid'], ['axit', 'acid'],
  // Hợp chất hữu cơ
  ['anđehit axetic', 'acetaldehyde'], ['anđehit fomic', 'formaldehyde'], ['fomanđehit', 'formaldehyde'],
  ['anđehit', 'aldehyde'], ['andehit', 'aldehyde'], ['xeton', 'ketone'], ['axeton', 'acetone'],
  ['ancol etylic', 'ethanol'], ['ancol metylic', 'methanol'], ['ancol', 'alcohol'], ['rượu etylic', 'ethanol'],
  ['etyl axetat', 'ethyl acetate'], ['metyl axetat', 'methyl acetate'], ['este', 'ester'], ['chất béo', 'chất béo'],
  ['ankan', 'alkane'], ['anken', 'alkene'], ['ankin', 'alkyne'], ['ankađien', 'alkadiene'], ['aren', 'arene'],
  ['metan', 'methane'], ['etan', 'ethane'], ['propan', 'propane'], ['butan', 'butane'], ['etilen', 'ethylene'], ['propilen', 'propylene'],
  ['axetilen', 'acetylene'], ['benzen', 'benzene'], ['toluen', 'toluene'], ['stiren', 'styrene'], ['naphtalen', 'naphthalene'],
  ['etanol', 'ethanol'], ['metanol', 'methanol'], ['glixerol', 'glycerol'], ['etylen glicol', 'ethylene glycol'], ['phenol', 'phenol'],
  ['glucozơ', 'glucose'], ['glucoza', 'glucose'], ['fructozơ', 'fructose'], ['saccarozơ', 'saccharose'], ['mantozơ', 'maltose'],
  ['xenlulozơ', 'cellulose'], ['amilozơ', 'amylose'], ['amilopectin', 'amylopectin'], ['triglixerit', 'triglyceride'], ['tristearin', 'tristearin'],
  ['anilin', 'aniline'], ['metylamin', 'methylamine'], ['etylamin', 'ethylamine'], ['đimetylamin', 'dimethylamine'], ['amin', 'amine'],
  ['glyxin', 'glycine'], ['alanin', 'alanine'], ['valin', 'valine'], ['lysin', 'lysine'], ['polime', 'polymer'], ['monome', 'monomer'],
  ['polietilen', 'polyethylene'], ['polipropilen', 'polypropylene'], ['polistiren', 'polystyrene'], ['poli(vinyl clorua)', 'poly(vinyl chloride)'], ['vinyl clorua', 'vinyl chloride'],
  ['enzim', 'enzyme'], ['protit', 'protein'], ['cacbohiđrat', 'carbohydrate'], ['cacbohidrat', 'carbohydrate'],
  // Gốc muối, oxide
  ['hiđroxit', 'hydroxide'], ['hidroxit', 'hydroxide'], ['oxit', 'oxide'], ['clorua', 'chloride'], ['bromua', 'bromide'], ['florua', 'fluoride'], ['iotua', 'iodide'],
  ['sunfat', 'sulfate'], ['sunfit', 'sulfite'], ['sunfua', 'sulfide'], ['nitrat', 'nitrate'], ['nitrit', 'nitrite'], ['cacbonat', 'carbonate'],
  ['hiđrocacbonat', 'hydrogencarbonate'], ['hidrocacbonat', 'hydrogencarbonate'], ['photphat', 'phosphate'], ['axetat', 'acetate'], ['pemanganat', 'permanganate'],
  ['đicromat', 'dichromate'], ['cromat', 'chromate'], ['amoniac', 'ammonia'], ['amoni', 'ammonium'], ['hiđrocacbon', 'hydrocarbon'], ['hidrocacbon', 'hydrocarbon'],
  // Nguyên tố
  ['natri', 'sodium'], ['kali', 'potassium'], ['magie', 'magnesium'], ['magiê', 'magnesium'], ['canxi', 'calcium'], ['bari', 'barium'], ['nhôm', 'aluminium'],
  ['sắt', 'iron'], ['kẽm', 'zinc'], ['crom', 'chromium'], ['mangan', 'manganese'], ['niken', 'nickel'], ['coban', 'cobalt'], ['thủy ngân', 'mercury'], ['thuỷ ngân', 'mercury'],
  ['liti', 'lithium'], ['xesi', 'caesium'], ['stronti', 'strontium'], ['lưu huỳnh', 'sulfur'], ['photpho', 'phosphorus'], ['cacbon', 'carbon'], ['silic', 'silicon'],
  ['nitơ', 'nitrogen'], ['hiđro', 'hydrogen'], ['hidro', 'hydrogen'], ['clo', 'chlorine'], ['brom', 'bromine'], ['iot', 'iodine'], ['flo', 'fluorine'],
];

/**
 * KHUÔN MẪU ĐỀ TỐT NGHIỆP THPT rút ra từ 2 đề năm 2026 (tóm tắt, không chép câu hỏi).
 */
export const TN_THPT_BLUEPRINT = `
**===== KHUÔN MẪU ĐỀ TỐT NGHIỆP THPT MÔN HÓA HỌC (rút từ 2 đề năm 2026 — làm theo cấu trúc, KHÔNG chép câu hỏi) =====**
1. Mở đầu đề luôn có 2 dòng: "Cho biết nguyên tử khối: ..." và "Các kí hiệu và chữ viết tắt: s: rắn; l: lỏng; g: khí; aq: dung dịch nước; xt: xúc tác; p: áp suất."
2. Mỗi phần đánh số lại từ Câu 1. Phần I 18 câu, Phần II 4 câu, Phần III 6 câu; thường có 2 câu dùng chung một đoạn thông tin ("Sử dụng thông tin cho dưới đây để trả lời các câu số x – y").
3. Tỉ trọng kiến thức: Lớp 12 khoảng 70%, Lớp 11 khoảng 20–25%, Lớp 10 khoảng 5–10%.
4. Dạng câu lặp lại ở cả 2 đề, phải có mặt:
   - Phần I: nhận biết dụng cụ thí nghiệm qua hình (phễu chiết, ống sinh hàn, burette, ống đong); pin Galvani và quá trình ở điện cực; điện phân; danh pháp alkane, amine, amino acid; protein; đọc phổ IR qua bảng số sóng; tình huống khảo sát biến số thí nghiệm ester hóa (yếu tố nào phải giữ giống nhau); chùm 2 câu về pH và xử lí nước trong thực tiễn; điền chỗ trống (1), (2) về xu hướng tuần hoàn.
   - Phần II: 1 câu có giả thuyết của học sinh + các bước thí nghiệm + bảng số liệu + chuẩn độ (mệnh đề cuối kết luận giả thuyết đúng hay bị bác bỏ, có quy định làm tròn ngay trong mệnh đề); 1 câu phức chất hoặc quy trình công nghiệp (Solvay, cân bằng chuyển dịch); 2 câu hữu cơ (chất béo, carbohydrate, polymer) có sơ đồ cấu tạo.
   - Phần III: tính sức điện động chuẩn của pin; sắp xếp hoặc liệt kê trả lời bằng dãy số (ví dụ: 1234, 2413, 56, 124); bài toán quy trình sản xuất nhiều giai đoạn (Haber – Bosch, Ostwald, xi măng, thủy tinh, sấy đường) ghi rõ "không làm tròn các phép tính trung gian, chỉ làm tròn kết quả cuối cùng tới hàng ...".
5. Đáp án Phần III tối đa 4 kí tự, gồm số thập phân dấu phẩy (0,63; 62,3; 9,05) hoặc dãy số (2413).
6. Đáp án và hướng dẫn giải: bảng đáp án nhanh trước, sau đó từng câu có "Hướng dẫn giải"; câu Đúng/Sai phải chứng minh từng ý; câu Trả lời ngắn mở đầu bằng "Đáp số ...".
`;
