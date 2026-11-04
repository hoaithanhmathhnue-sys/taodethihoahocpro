// Chạy: node tests/chemistry.test.mjs
// Kiểm thử phần Hóa học: dữ liệu chương trình, cấu trúc đề, chuẩn hóa công thức, kiểm duyệt, hình vẽ, chế bản, Excel.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const stubMammoth = {
  name: 'stub-mammoth',
  setup(b) {
    b.onResolve({ filter: /^mammoth$/ }, () => ({ path: 'mammoth', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' }));
  },
};
const out = await build({
  stdin: {
    contents: `
      export * from './data/chemistryCurriculum.ts';
      export * from './data/examPresets.ts';
      export * from './services/chemFormat.ts';
      export * from './services/chemGuardrails.ts';
      export * from './services/chemFigures.ts';
      export * from './services/examLayout.ts';
      export * from './services/examShuffle.ts';
      export * from './services/xlsxWriter.ts';
      export * from './services/answerSheet.ts';
      export { computeCv7991Layout } from './services/cv7991Template.ts';
      export { validateExamHtml } from './services/examValidator.ts';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true, format: 'esm', write: false, platform: 'node', logLevel: 'error',
  external: ['jszip'],
  plugins: [stubMammoth],
});
mkdirSync(new URL('../node_modules/.cache/', import.meta.url), { recursive: true });
const f = new URL('../node_modules/.cache/chemistry.mjs', import.meta.url);
writeFileSync(f, out.outputFiles[0].text);
const m = await import(f.href);

let ok = 0;
const t = async (name, fn) => { await fn(); ok++; console.log('✓', name); };

/* ---------- Dữ liệu chương trình ---------- */
await t('Chương trình KNTT đủ 3 khối, mỗi bài có đủ yêu cầu cần đạt và tuần học', () => {
  for (const [grade, chapters, firstHk2] of [['10', 7, 'Chương 5'], ['11', 6, 'Chương 4'], ['12', 8, 'Chương 6']]) {
    const data = m.getChemistryChapters(grade);
    assert.equal(data.length, chapters);
    const ids = new Set();
    data.forEach(c => c.lessons.forEach(l => {
      assert.ok(l.objectives.biet && l.objectives.hieu && l.objectives.van_dung, `${grade} ${l.name}`);
      assert.ok(l.periods > 0 && l.weekStart >= 1 && l.weekEnd >= l.weekStart && l.weekEnd <= 35, `${grade} ${l.name} tuần ${l.weekStart}-${l.weekEnd}`);
      assert.ok(!ids.has(l.id));
      ids.add(l.id);
    }));
    const hk2 = data.find(c => c.name.startsWith(firstHk2));
    assert.equal(hk2.lessons[0].weekStart, 19, `lớp ${grade} học kì II bắt đầu tuần 19`);
    data.slice(0, data.indexOf(hk2)).forEach(c => c.lessons.forEach(l => assert.ok(l.weekEnd <= 18, `${grade} ${l.name} phải thuộc học kì I`)));
  }
  assert.equal(m.getAllChemistryChapters().length, 21);
  assert.ok(m.getAllChemistryChapters()[0].name.startsWith('Lớp 12'));
  assert.deepEqual(m.getChemistryChapters('9'), []);
});

/* ---------- Cấu trúc đề ---------- */
await t('Preset đúng số câu và thang điểm theo đặc tả, tổng 10 điểm', () => {
  const expected = { 'tn-thpt': [18, 4, 6, 0, 40], 'dinh-ky': [12, 2, 4, 3, 27], 'thuong-xuyen-10': [10, 0, 0, 0, 10], 'thuong-xuyen-to-hop': [8, 1, 2, 0, 14] };
  for (const preset of m.EXAM_PRESETS) {
    const cfg = m.buildQuestionConfig(preset, m.DEFAULT_LEVEL_RATIO);
    const n = c => c.biet + c.hieu + c.van_dung + c.van_dung_cao;
    const [a, b, c, d, cmds] = expected[preset.id];
    assert.equal(n(cfg.type1), a);
    assert.equal(cfg.type2QuestionCount, b);
    assert.equal(n(cfg.type2), b * 4);
    assert.equal(n(cfg.type3), c);
    assert.equal(n(cfg.essay), d);
    assert.equal(a + b * 4 + c + d, cmds);
    const layout = m.computeCv7991Layout(cfg, true);
    assert.equal(layout.totalPoints, 10, preset.id);
  }
  const tn = m.computeCv7991Layout(m.buildQuestionConfig(m.getPreset('tn-thpt'), m.DEFAULT_LEVEL_RATIO), true);
  assert.deepEqual(tn.types.map(x => x.points), [4.5, 4, 1.5]);
  assert.equal(tn.types[0].pointPerCommand, 0.25);
  assert.equal(tn.types[2].pointPerCommand, 0.25);
});

await t('Thanh tỉ lệ: bám sát mục tiêu, Phần I nghiêng về Biết, Phần III nghiêng về Vận dụng', () => {
  for (const ratio of [{ biet: 40, hieu: 30, vd: 30 }, { biet: 30, hieu: 30, vd: 40 }]) {
    for (const id of ['tn-thpt', 'dinh-ky']) {
      const cfg = m.buildQuestionConfig(m.getPreset(id), ratio);
      const actual = m.actualLevelPercent(cfg);
      assert.ok(Math.abs(actual.biet - ratio.biet) <= 4 && Math.abs(actual.hieu - ratio.hieu) <= 4 && Math.abs(actual.vd - ratio.vd) <= 4, `${id}: ${JSON.stringify(actual)}`);
      assert.ok(cfg.type1.biet >= cfg.type1.van_dung, `${id} Phần I`);
      assert.ok(cfg.type3.van_dung >= cfg.type3.biet, `${id} Phần III`);
    }
  }
});

await t('Mức độ từng ý Đúng/Sai tăng dần trong một câu và khớp tổng', () => {
  const cfg = m.buildQuestionConfig(m.getPreset('tn-thpt'), m.DEFAULT_LEVEL_RATIO);
  const rank = { nhan_biet: 0, thong_hieu: 1, van_dung: 2 };
  let counts = { nhan_biet: 0, thong_hieu: 0, van_dung: 0 };
  cfg.dungSaiLevelConfigs.forEach(q => {
    const seq = [q.yA, q.yB, q.yC, q.yD];
    seq.forEach(l => counts[l]++);
    for (let i = 1; i < 4; i++) assert.ok(rank[seq[i]] >= rank[seq[i - 1]]);
  });
  assert.deepEqual([counts.nhan_biet, counts.thong_hieu, counts.van_dung], [cfg.type2.biet, cfg.type2.hieu, cfg.type2.van_dung]);
});

/* ---------- Chuẩn hóa công thức ---------- */
await t('Công thức viết thường → chỉ số, điện tích đúng', () => {
  const n = m.normalizeChemText;
  assert.equal(n('H2SO4'), 'H<sub>2</sub>SO<sub>4</sub>');
  assert.equal(n('Al2(SO4)3'), 'Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>');
  assert.equal(n('Fe3+'), 'Fe<sup>3+</sup>');
  assert.equal(n('Cr2O72-'), 'Cr<sub>2</sub>O<sub>7</sub><sup>2-</sup>');
  assert.equal(n('SO42-'), 'SO<sub>4</sub><sup>2-</sup>');
  assert.equal(n('NH4+'), 'NH<sub>4</sub><sup>+</sup>');
  assert.equal(n('Cl- và OH-'), 'Cl<sup>-</sup> và OH<sup>-</sup>');
  assert.equal(n('[Cu(NH3)4]2+'), '[Cu(NH<sub>3</sub>)<sub>4</sub>]<sup>2+</sup>');
  assert.equal(n('[Al(OH)4]-'), '[Al(OH)<sub>4</sub>]<sup>-</sup>');
  assert.equal(n('2H2 + O2 → 2H2O'), '2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O');
  assert.equal(n('CuSO4.5H2O'), 'CuSO<sub>4</sub>.5H<sub>2</sub>O');
  assert.equal(n('CH3-CH2-OH'), 'CH<sub>3</sub>-CH<sub>2</sub>-OH');
  assert.equal(n('CO2+H2O'), 'CO<sub>2</sub>+H<sub>2</sub>O');
  assert.equal(n('Zn2+/Zn'), 'Zn<sup>2+</sup>/Zn');
});

await t('Không đụng tới chữ thường, mã câu, số báo danh, thẻ HTML', () => {
  const n = m.normalizeChemText;
  for (const text of ['Câu 12. Mã đề 0323', 'Phần II, câu 3', 'I.1, II.1a, III.2, IV.1', 'A. 12,5', 'Bước 2: lọc', '10 câu', 'năm 2026']) {
    assert.equal(n(text), text);
  }
  const html = '<p class="H2O" title="Fe3+"><span style="width:12px">x</span></p><script class="figure-json">{"a":"H2O"}</script>';
  assert.equal(n(html), html);
});

await t('LaTeX đơn giản → HTML; phân số giữ nguyên để đổi thành Equation', () => {
  const n = m.normalizeChemText;
  assert.equal(n('$H_2O$'), 'H<sub>2</sub>O');
  assert.equal(n('$Fe^{3+}$'), 'Fe<sup>3+</sup>');
  assert.equal(n('$\\ce{H2SO4}$'), 'H<sub>2</sub>SO<sub>4</sub>');
  assert.equal(n('$A \\rightarrow B$'), 'A → B');
  assert.equal(n('$A \\rightleftharpoons B$'), 'A ⇌ B');
  assert.ok(n('$\\frac{a}{b}$').includes('\\frac{a}{b}'));
  assert.equal(n('H₂SO₄'), 'H<sub>2</sub>SO<sub>4</sub>');
  assert.equal(n('Fe³⁺'), 'Fe<sup>3+</sup>');
});

await t('Kí hiệu nhiệt động, nhiệt độ, mũi tên', () => {
  const n = m.normalizeChemText;
  assert.equal(n('ΔrHo298 = -285 kJ'), 'Δ<sub>r</sub>H<sup>o</sup><sub>298</sub> = -285 kJ');
  assert.equal(n('25 oC'), '25 <sup>o</sup>C');
  assert.equal(n('25°C'), '25 <sup>o</sup>C');
  assert.equal(n('A -> B'), 'A → B');
  assert.equal(n('A &lt;=&gt; B'), 'A ⇌ B');
});

await t('Danh pháp IUPAC đổi đúng, không phá từ thường', () => {
  const n = m.normalizeChemText;
  assert.equal(n('axit clohiđric'), 'hydrochloric acid');
  assert.equal(n('natri clorua'), 'sodium chloride');
  assert.equal(n('Sắt(III) oxit'), 'Iron(III) oxide');
  assert.equal(n('ancol etylic'), 'ethanol');
  assert.equal(n('este và amin'), 'ester và amine');
  assert.equal(n('glucozơ, saccarozơ, xenlulozơ'), 'glucose, saccharose, cellulose');
  assert.equal(n('khí oxi'), 'khí oxygen');
  assert.equal(n('kim loại đồng và đồng(II) sunfat'), 'kim loại copper và copper(II) sulfate');
  assert.equal(n('Nhôm (aluminium, Al)'), 'Aluminium (Al)');
  for (const keep of ['phản ứng oxi hóa – khử', 'chất oxi hoá', 'đồng phân, đồng đẳng, đồng vị', 'tráng bạc', 'màu vàng', 'đồng thời', 'bút chì', 'amino acid', 'Bình tam giác', 'bromine', 'chlorine', 'clothing']) {
    assert.equal(n(keep), keep, keep);
  }
});

await t('Chuẩn hóa nhiều lần cho cùng kết quả', () => {
  const text = '<p>Cho Fe2O3 + 3CO → 2Fe + 3CO2 ở 25 oC, axit HCl, ΔrHo298, Na+, SO42-.</p>';
  const once = m.normalizeChemText(text);
  assert.equal(m.normalizeChemText(once), once);
});

/* ---------- Kiểm duyệt ---------- */
const sampleExam = (over = {}) => `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Đề</title><style>p{margin:0}</style></head><body>
<h3>ĐỀ AI TỰ VIẾT</h3>
<p><b>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 2.</b></p>
<p><span class="question-number">Câu 1.</span> Công thức của sodium chloride là</p>
<div class="options"><div class="option-item">A. NaCl.</div><div class="option-item">B. KCl.</div><div class="option-item">C. CaCl<sub>2</sub>.</div><div class="option-item">D. HCl.</div></div>
<p><span class="question-number">Câu 2.</span> ${over.stem2 || 'Phát biểu nào sau đây đúng về chất béo?'}</p>
<div class="options"><div class="option-item">A. Chất béo là trieste của glycerol với các acid béo.</div><div class="option-item">B. Chất béo là polymer có khối lượng phân tử rất lớn.</div><div class="option-item">C. Chất béo tan rất tốt trong nước ở điều kiện thường.</div><div class="option-item">D. Chất béo không bị thủy phân trong môi trường acid.</div></div>
<p><b>PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu 1.</b></p>
<p><span class="question-number">Câu 1.</span> Xét phản ứng Fe + 2HCl → FeCl<sub>2</sub> + H<sub>2</sub>. Mỗi phát biểu sau đúng hay sai?</p>
<div class="options"><div class="option-item">a) Fe là chất khử.</div><div class="option-item">b) HCl là chất khử.</div><div class="option-item">c) Có khí thoát ra.</div><div class="option-item">d) Sản phẩm có FeCl<sub>3</sub>.</div></div>
<p><b>PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu 2.</b></p>
<p><span class="question-number">Câu 1.</span> ${over.short1 || 'Tính thể tích khí H<sub>2</sub> (L) ở điều kiện chuẩn thu được từ 0,5 mol Zn.'}</p>
<p><span class="question-number">Câu 2.</span> Sắp xếp các chất theo chiều tăng nhiệt độ sôi thành dãy số.</p>
<p><b>ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI</b></p>
<p><b>PHẦN I</b></p>
<table class="answer-table" border="1"><tr><th>Câu</th><th>1</th><th>2</th></tr><tr><td>Đáp án</td><td>A</td><td>A</td></tr></table>
<p><b>PHẦN II</b></p>
<table class="answer-table" border="1"><thead><tr><th>Câu</th><th>Ý a)</th><th>Ý b)</th><th>Ý c)</th><th>Ý d)</th></tr></thead><tbody><tr><td>Câu 1</td><td>Đ</td><td>S</td><td>Đ</td><td>S</td></tr></tbody></table>
<p><b>PHẦN III</b></p>
<table class="answer-table" border="1"><thead><tr><th>Câu</th><th>Đáp án</th><th>Hướng dẫn giải chi tiết</th></tr></thead><tbody><tr><td>1</td><td>${over.ans1 || '12,4'}</td><td>V = 0,5 . 24,79 = 12,395 L</td></tr><tr><td>2</td><td>${over.ans2 || '2413'}</td><td>Đáp số 2413.</td></tr></tbody></table>
</body></html>`;

await t('Đáp án Trả lời ngắn: giới hạn 4 kí tự, dấu phẩy', () => {
  assert.equal(m.shortAnswerProblem('12,5'), null);
  assert.equal(m.shortAnswerProblem('-89'), null);
  assert.equal(m.shortAnswerProblem('0,25'), null);
  assert.equal(m.shortAnswerProblem('2413'), null);
  assert.ok(m.shortAnswerProblem('12,34'));
  assert.ok(m.shortAnswerProblem('12.5'));
  assert.ok(m.shortAnswerProblem('abc'));
  assert.ok(m.shortAnswerProblem(''));
});

await t('Tự chèn câu lệnh làm tròn đúng hàng; đã có thì không chèn; giữ cấu trúc đề', () => {
  const first = m.enforceShortAnswerRounding(sampleExam());
  assert.deepEqual(first.added, [1]);
  assert.ok(first.html.includes('(Làm tròn kết quả đến hàng phần mười.)'));
  const again = m.enforceShortAnswerRounding(first.html);
  assert.deepEqual(again.added, []);
  assert.equal(m.parseExamForShuffle(first.html).questions.length, 5);
  const hundredth = m.enforceShortAnswerRounding(sampleExam({ ans1: '0,63' }));
  assert.ok(hundredth.html.includes('hàng phần trăm'));
});

await t('Bắt lỗi 22,4 L, đktc, đáp án quá dài', () => {
  const codes = html => m.checkChemistryExam(html).map(i => i.code);
  assert.deepEqual(codes(sampleExam()), []);
  assert.ok(codes(sampleExam({ short1: 'Tính thể tích khí (đktc) thu được.' })).includes('OLD_STP'));
  assert.ok(codes(sampleExam({ short1: 'Biết 1 mol khí chiếm 22,4 L.' })).includes('OLD_MOLAR_VOLUME'));
  assert.ok(codes(sampleExam({ ans1: '12,395' })).includes('SHORT_ANSWER'));
  assert.equal(m.checkChemistryExam(sampleExam({ ans1: '12,395' })).find(i => i.code === 'SHORT_ANSWER').severity, 'error');
});

await t('Kiểm tra cân bằng phương trình: nguyên tố và điện tích', () => {
  const bad = m.findUnbalancedEquations;
  assert.deepEqual(bad('<p>Fe<sub>2</sub>O<sub>3</sub> + 3CO → 2Fe + 3CO<sub>2</sub></p>'), []);
  assert.deepEqual(bad('<p>2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O</p>'), []);
  assert.deepEqual(bad('<p>5Fe<sup>2+</sup> + MnO<sub>4</sub><sup>-</sup> + 8H<sup>+</sup> → 5Fe<sup>3+</sup> + Mn<sup>2+</sup> + 4H<sub>2</sub>O</p>'), []);
  assert.deepEqual(bad('<p>Cu<sup>2+</sup> + 2e → Cu</p>'), []);
  assert.deepEqual(bad('<p>CH<sub>4</sub>(g) + 2O<sub>2</sub>(g) → CO<sub>2</sub>(g) + 2H<sub>2</sub>O(l)</p>'), []);
  assert.deepEqual(bad('<p>Câu hỏi: cho phản ứng Al(OH)<sub>3</sub> + NaOH → Na[Al(OH)<sub>4</sub>]</p>'), []);
  assert.equal(bad('<p>Fe + HCl → FeCl<sub>2</sub> + H<sub>2</sub></p>').length, 1);
  assert.equal(bad('<p>Fe<sup>2+</sup> + MnO<sub>4</sub><sup>-</sup> + 8H<sup>+</sup> → Fe<sup>3+</sup> + Mn<sup>2+</sup> + 4H<sub>2</sub>O</p>').length, 1);
  // Mắt xích polymer có hệ số n: bỏ qua, không báo nhầm
  assert.deepEqual(bad('<p>nCH<sub>2</sub>=CH<sub>2</sub> → (CH<sub>2</sub>–CH<sub>2</sub>)<sub>n</sub></p>'), []);
  // Chữ thường cạnh mũi tên không phải phương trình
  assert.deepEqual(bad('<p>Chuyển từ dạng lỏng → dạng rắn</p>'), []);
});

/* ---------- Hình vẽ ---------- */
const isSvg = s => { assert.ok(s.startsWith('<svg') && s.endsWith('</svg>')); assert.ok(!/NaN|undefined/.test(s), s.slice(0, 200)); };

await t('Bộ thí nghiệm và dụng cụ vẽ được, không có giá trị lỗi', () => {
  ['distillation', 'extraction', 'titration', 'electrolysis', 'galvanic'].forEach(preset => isSvg(m.renderChemFigure({ type: 'apparatus', preset })));
  isSvg(m.renderChemFigure({ type: 'glassware', items: Object.keys(m.GLASSWARE_LABELS) }));
  assert.throws(() => m.renderChemFigure({ type: 'apparatus', preset: 'xyz' }));
  assert.throws(() => m.renderChemFigure({ type: 'bbt', fn: 'x^2' }));
});

await t('Phổ IR, MS theo số liệu; thiếu đỉnh thì báo lỗi', () => {
  const ir = m.renderChemFigure({ type: 'ir', peaks: [{ wavenumber: 1710, transmittance: 10, label: 'C=O' }] });
  isSvg(ir);
  assert.ok(ir.includes('C=O'));
  const ms = m.renderChemFigure({ type: 'ms', molecularIon: 58, peaks: [{ mz: 58, intensity: 30 }, { mz: 43, intensity: 100 }] });
  isSvg(ms);
  assert.ok(ms.includes('>58<') && ms.includes('>43<'));
  assert.throws(() => m.renderChemFigure({ type: 'ir', peaks: [] }));
  assert.throws(() => m.renderChemFigure({ type: 'ms', peaks: [{ mz: 'abc', intensity: 1 }] }));
});

await t('SMILES đọc đúng số nguyên tử, liên kết, vòng', () => {
  const ester = m.parseSmiles('CC(=O)OCC');
  assert.equal(ester.atoms.length, 6);
  assert.equal(ester.bonds.filter(b => b.order === 2).length, 1);
  const benzene = m.parseSmiles('c1ccccc1');
  assert.equal(benzene.atoms.length, 6);
  assert.equal(benzene.bonds.length, 6);
  const salt = m.parseSmiles('CC(=O)[O-]');
  assert.equal(salt.atoms[3].charge, -1);
  ['CC(=O)OCC', 'c1ccccc1', 'Cc1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1', 'CC(N)C(=O)O', 'CC(C)C', 'C=C', 'C#C', 'C1CCCCC1'].forEach(smiles => isSvg(m.renderChemFigure({ type: 'structure', smiles })));
  const phenol = m.renderChemFigure({ type: 'structure', smiles: 'Oc1ccccc1' });
  assert.ok(phenol.includes('O') && phenol.includes('H'));
  assert.throws(() => m.parseSmiles('C?C'));
  // Số H của nguyên tử dị tố tính đúng theo hóa trị
  const digitsNear = (svg, el) => svg.replace(/<[^>]+>/g, '').includes(el);
  assert.ok(digitsNear(m.renderChemFigure({ type: 'structure', smiles: 'Nc1ccccc1' }), 'NH2'));
  assert.ok(digitsNear(m.renderChemFigure({ type: 'structure', smiles: 'CCO' }), 'OH'));
  assert.ok(digitsNear(m.renderChemFigure({ type: 'structure', smiles: 'CC(=O)[O-]' }), 'O-'));
});

await t('Haworth, peptide, polymer', () => {
  ['alpha-glucose', 'beta-glucose', 'alpha-fructose', 'beta-fructose'].forEach(sugar => isSvg(m.renderChemFigure({ type: 'haworth', sugar })));
  assert.throws(() => m.renderChemFigure({ type: 'haworth', sugar: 'lactose' }));
  isSvg(m.renderChemFigure({ type: 'peptide', residues: ['Gly', 'Ala', 'Val'] }));
  ['pe', 'pp', 'pvc', 'ps', 'pan', 'pmma', 'capron', 'nylon-6,6', 'cao-su-buna'].forEach(preset => isSvg(m.renderChemFigure({ type: 'polymer', preset })));
});

/* ---------- Chế bản ---------- */
await t('Khung tiêu đề: nguyên tử khối theo chất có trong đề, thay phần đầu AI viết, thêm HẾT', () => {
  const line = m.atomicMassLine('<p>Cho Fe<sub>2</sub>O<sub>3</sub>, NaCl và kim loại copper. Ba chất này. Câu 1. Bước 2. II. III.</p>');
  ['H = 1', 'C = 12', 'N = 14', 'O = 16', 'Na = 23', 'Cl = 35,5', 'Fe = 56', 'Cu = 64'].forEach(x => assert.ok(line.includes(x), x));
  assert.ok(!line.includes('Ba ='));
  assert.ok(!line.includes('I ='));
  const html = m.applyExamHeader(sampleExam(), m.DEFAULT_HEADER_PROFILE, { examType: 'Giữa kỳ 1', grade: '10', duration: 45 });
  assert.ok(!html.includes('ĐỀ AI TỰ VIẾT'));
  assert.ok(html.includes('TRƯỜNG THPT NGUYỄN THƯỢNG HIỀN'));
  assert.ok(html.includes('ĐỀ KIỂM TRA GIỮA HỌC KÌ I'));
  assert.ok(html.includes('Lớp 10'));
  assert.ok(html.includes('Cho biết nguyên tử khối:'));
  assert.ok(html.includes('s: rắn; l: lỏng; g: khí; aq: dung dịch nước'));
  assert.ok(html.includes('--- HẾT ---'));
  const reparsed = m.parseExamForShuffle(html);
  assert.equal(reparsed.questions.length, 5);
  assert.equal(reparsed.answers.mc[1], 'A');
  assert.equal(reparsed.answers.short[2], '2413');
  const tn = m.applyExamHeader(sampleExam(), m.DEFAULT_HEADER_PROFILE, { examType: 'Thi Tốt nghiệp THPT', grade: '12', duration: 50 });
  assert.ok(tn.includes('ĐỀ ÔN THI TỐT NGHIỆP THPT'));
  assert.ok(tn.includes('50 phút'));
});

await t('Tách đề và đáp án: đề in cho học sinh không lộ đáp án', () => {
  const html = m.applyExamHeader(sampleExam(), m.DEFAULT_HEADER_PROFILE, { examType: 'Cuối kỳ 2', grade: '11', duration: 45 });
  const { exam, key } = m.splitExamAndKey(html);
  assert.ok(!exam.includes('ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI'));
  assert.ok(!exam.includes('answer-table'));
  assert.ok(exam.includes('--- HẾT ---'));
  assert.ok(exam.trim().endsWith('</html>'));
  assert.ok(key.includes('ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI'));
  assert.ok(key.includes('24,79'));
  assert.ok(!key.includes('Công thức của sodium chloride'));
});

await t('Chia cột theo độ dài; dùng Tab chuẩn, không dùng dấu cách; giữ trọn câu', () => {
  assert.equal(m.columnsForOptions(['NaCl.', 'KCl.', 'CaCl<sub>2</sub>.', 'HCl.']), 4);
  assert.equal(m.columnsForOptions(['Một phương án độ dài trung bình', 'B', 'C', 'D']), 2);
  assert.equal(m.columnsForOptions(['Chất béo là trieste của glycerol với các acid béo và nhiều chất khác', 'B', 'C', 'D']), 1);
  assert.equal(m.columnsForOptions(['<img src="x">', 'B', 'C', 'D']), 1);
  const laid = m.layoutExamForPrint(sampleExam());
  assert.ok(laid.includes('mso-tab-count:1'));
  assert.ok(laid.includes('tab-stops:left 130pt 261pt 392pt'));
  assert.ok(laid.includes('page-break-after:avoid'));
  assert.equal((laid.match(/class="q-block"/g) || []).length, 5);
  // Tiêu đề phần nằm cùng khối với câu đầu của phần
  assert.ok(/<div class="q-block">\s*<p style="[^"]*page-break-after:avoid[^"]*"><b>PHẦN II\./.test(laid));
  // Chỗ đặt hình không bị đổi thuộc tính
  const withPh = m.layoutExamForPrint(sampleExam().replace('Phát biểu nào sau đây đúng về chất béo?</p>', 'Phát biểu nào sau đây đúng về chất béo?</p><div data-fig-ph="0"></div>'));
  assert.ok(withPh.includes('<div data-fig-ph="0"></div>'));
  // Vẫn còn đủ 4 phương án đúng nội dung, đáp án không đổi, phần đáp án không bị chế bản
  const parsed = m.parseExamForShuffle(laid);
  assert.equal(parsed.questions.filter(q => q.kind === 'mc').length, 2);
  assert.ok(laid.includes('<b>A.</b> NaCl.'));
  assert.ok(laid.includes('<b>D.</b> Chất béo không bị thủy phân'));
  assert.equal(m.layoutExamForPrint(laid), laid);
  // Ý Đúng/Sai thành đoạn văn; thẻ bọc .options không còn để tránh các câu dính chuỗi khi sang trang
  assert.ok(laid.includes('<b>a)</b> Fe là chất khử.'));
  assert.ok(!laid.includes('class="options"'));
  assert.ok(!/<div[^>]*page-break-after:avoid[^>]*>\s*<(?:div|p)\b/.test(laid));
  // Đoạn cuối mỗi câu không được "dính" với câu sau
  [...laid.matchAll(/<div class="q-block">([\s\S]*?)<\/div>\s*(?=<div class="q-block">|<p|$)/g)].forEach(x => {
    const tags = x[1].match(/<(?:p|div|li)\b[^>]*>/g) || [];
    assert.ok(!tags[tags.length - 1].includes('page-break-after'), tags[tags.length - 1]);
  });
});

await t('Đảo đề giữ trật tự mức độ: câu chỉ đổi chỗ với câu cùng mức', () => {
  const qs = Array.from({ length: 12 }, (_x, i) => `<p><span class="question-number">Câu ${i + 1}.</span> Nội dung câu số ${i + 1} về hóa học</p><div class="options"><div class="option-item">A. a${i}</div><div class="option-item">B. b${i}</div><div class="option-item">C. c${i}</div><div class="option-item">D. d${i}</div></div>`).join('\n');
  const key = `<p><b>ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI</b></p><table border="1"><tr><th>Câu</th>${Array.from({ length: 12 }, (_x, i) => `<th>${i + 1}</th>`).join('')}</tr><tr><td>Đáp án</td>${Array.from({ length: 12 }, () => '<td>A</td>').join('')}</tr></table>`;
  const exam = m.parseExamForShuffle(`<html><body><p><b>PHẦN I. Trắc nghiệm nhiều lựa chọn</b></p>${qs}${key}</body></html>`);
  const levelOf = (_kind, num) => (num <= 6 ? 'biet' : num <= 9 ? 'hieu' : 'van_dung');
  const versions = m.generateExamVersions(exam, exam.answers, { count: 8, startCode: 101, shuffleQuestions: true, shuffleOptions: false, shuffleStatements: false, levelOf }, 42);
  versions.forEach(v => v.questions.forEach(q => assert.equal(levelOf('mc', q.num), levelOf('mc', q.originalNum), `mã ${v.code} câu ${q.num}`)));
  assert.ok(versions.some(v => v.questions.some(q => q.num !== q.originalNum)));
});

/* ---------- Excel, phiếu trả lời ---------- */
await t('Excel: file đúng cấu trúc, ô gộp theo bảng HTML, công thức thành chỉ số Unicode', async () => {
  assert.equal(m.cellText('H<sub>2</sub>SO<sub>4</sub> và Fe<sup>3+</sup>'), 'H₂SO₄ và Fe³⁺');
  const sheet = m.htmlTableToSheet('<table><tr><th rowspan="2">TT</th><th colspan="2">Mức</th></tr><tr><th>Biết</th><th>Hiểu</th></tr><tr><td>1</td><td>I.1</td><td>I.2</td></tr></table>', 'Ma_tran');
  assert.deepEqual(sheet.rows, [['TT', 'Mức'], [null, 'Biết', 'Hiểu'], ['1', 'I.1', 'I.2']]);
  assert.equal(sheet.merges.length, 2);
  const blob = await m.buildXlsxBlob([sheet, { name: 'A/B*C', rows: [['a&b', 1]] }]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file('xl/worksheets/sheet2.xml'));
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(sheetXml.includes('<mergeCell ref="A1:A2"/>') && sheetXml.includes('<mergeCell ref="B1:C1"/>'));
  const wb = await zip.file('xl/workbook.xml').async('string');
  assert.ok(wb.includes('name="A B C"'));
  assert.ok((await zip.file('xl/worksheets/sheet2.xml').async('string')).includes('a&amp;b'));
});

await t('Phiếu trả lời khớp số câu của đề, nằm trong khổ A4', () => {
  const pages = m.buildAnswerSheetPages(m.DEFAULT_HEADER_PROFILE, { mc: 18, tf: 4, short: 6, essay: 0 }, 'Đề thử');
  assert.equal(pages.length, 1);
  const html = pages.join('');
  assert.ok(html.includes('từ câu 1 đến câu 18'));
  assert.ok(html.includes('từ câu 1 đến câu 4'));
  assert.ok(html.includes('từ câu 1 đến câu 6'));
  assert.ok(!html.includes('Tự luận'));
  assert.ok(!/NaN|undefined/.test(html));
  // Ô tô: 18×4 + 4×4×2 + 6×(10×4 + 1 + 2) + số báo danh 6×10 + mã đề 3×10
  assert.equal((html.match(/<circle/g) || []).length, 72 + 32 + 258 + 90);
  [...html.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].forEach(c => assert.ok(+c[1] < 794 - 30 && +c[2] < 1123 - 30, `${c[1]},${c[2]}`));
  assert.ok(m.buildAnswerSheetPages(m.DEFAULT_HEADER_PROFILE, { mc: 12, tf: 2, short: 4, essay: 3 }, 'x').join('').includes('Tự luận (3 câu)'));
  // Đề nhiều câu: sang trang mới thay vì tràn
  assert.ok(m.buildAnswerSheetPages(m.DEFAULT_HEADER_PROFILE, { mc: 40, tf: 8, short: 12, essay: 0 }, 'x').length >= 2);
});

console.log(`\n${ok} kiểm thử đạt.`);
