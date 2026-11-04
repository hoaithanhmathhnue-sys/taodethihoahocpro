import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FlaskConical, ImagePlus } from 'lucide-react';
import { downloadSvgAsPng, renderFigureSpecToSvg, svgToDataUrl } from '../services/figureEngine';
import { APPARATUS_LABELS, GLASSWARE_LABELS, GlasswareName } from '../services/chemFigures';
import { parseExamForShuffle } from '../services/examShuffle';
import { backOverOpenTags } from '../services/examLayout';

export interface FigureDocument {
  id: string;
  label: string;
  content: string;
  onUpdate: (next: string) => void;
}

type FigureKind = 'apparatus' | 'glassware' | 'ir' | 'ms' | 'structure' | 'haworth' | 'peptide' | 'polymer';

const KIND_LABELS: Record<FigureKind, string> = {
  apparatus: 'Bộ thí nghiệm',
  glassware: 'Dụng cụ rời (I), (II)…',
  ir: 'Phổ hồng ngoại (IR)',
  ms: 'Phổ khối lượng (MS)',
  structure: 'Công thức cấu tạo 2D',
  haworth: 'Mạch vòng glucose, fructose',
  peptide: 'Chuỗi peptide',
  polymer: 'Mắt xích polymer',
};

const STRUCTURE_SAMPLES: Array<[string, string]> = [
  ['Ethyl acetate', 'CC(=O)OCC'],
  ['Benzene', 'c1ccccc1'],
  ['Toluene', 'Cc1ccccc1'],
  ['Phenol', 'Oc1ccccc1'],
  ['Aniline', 'Nc1ccccc1'],
  ['Acetic acid', 'CC(=O)O'],
  ['Ethanol', 'CCO'],
  ['Propanal', 'CCC=O'],
  ['Glycine', 'NCC(=O)O'],
  ['Alanine', 'CC(N)C(=O)O'],
  ['Isobutane', 'CC(C)C'],
];

const POLYMER_PRESETS: Array<[string, string]> = [
  ['pe', 'Polyethylene'], ['pp', 'Polypropylene'], ['pvc', 'Poly(vinyl chloride)'], ['ps', 'Polystyrene'],
  ['pan', 'Polyacrylonitrile'], ['pmma', 'Poly(methyl methacrylate)'], ['capron', 'Nylon-6 (capron)'], ['nylon-6,6', 'Nylon-6,6'], ['cao-su-buna', 'Cao su buna'],
];

const parseIrLines = (text: string) =>
  text.split('\n').map(l => l.split(',').map(x => x.trim())).filter(p => p[0])
    .map(([wavenumber, transmittance, label]) => ({ wavenumber: Number(wavenumber), transmittance: Number(transmittance || 20), label: label || undefined }));

const parseMsLines = (text: string) =>
  text.split('\n').map(l => l.split(',').map(x => x.trim())).filter(p => p[0])
    .map(([mz, intensity]) => ({ mz: Number(mz), intensity: Number(intensity || 10) }));

/** Chèn khai báo hình vào ngay dưới lời dẫn của câu đã chọn, trước các phương án. */
export const insertFigureIntoQuestion = (content: string, questionIndex: number, spec: object): string => {
  const exam = parseExamForShuffle(content);
  const q = exam.questions[questionIndex];
  if (!q) return content;
  const json = JSON.stringify(spec);
  const block = exam.isHtml
    ? `\n<script type="application/json" class="figure-json">${json}</script>\n`
    : `\n\n\`\`\`figure-json\n${json}\n\`\`\`\n\n`;
  const at = q.slots ? backOverOpenTags(content, q.slots[0].labelStart).pos : q.end;
  return content.slice(0, at) + block + content.slice(at);
};

const ChemFigurePanel: React.FC<{ documents: FigureDocument[]; className?: string }> = ({ documents, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FigureKind>('apparatus');
  const [apparatus, setApparatus] = useState('galvanic');
  const [items, setItems] = useState<GlasswareName[]>(['separatory-funnel', 'graduated-cylinder', 'burette', 'condenser']);
  const [irText, setIrText] = useState('3350, 25, O–H\n2950, 45\n1710, 10, C=O');
  const [msText, setMsText] = useState('58, 30\n43, 100\n15, 20');
  const [molecularIon, setMolecularIon] = useState('58');
  const [smiles, setSmiles] = useState('CC(=O)OCC');
  const [caption, setCaption] = useState('');
  const [sugar, setSugar] = useState('alpha-glucose');
  const [peptide, setPeptide] = useState('Gly-Ala-Val');
  const [polymer, setPolymer] = useState('pvc');
  const [docId, setDocId] = useState(documents[0]?.id || '');
  const [question, setQuestion] = useState(0);
  const [notice, setNotice] = useState('');

  const doc = documents.find(d => d.id === docId) || documents[0];
  const exam = useMemo(() => (open && doc?.content ? parseExamForShuffle(doc.content) : null), [open, doc?.content]);

  const spec = useMemo<Record<string, unknown>>(() => {
    switch (kind) {
      case 'apparatus': return { type: 'apparatus', preset: apparatus };
      case 'glassware': return { type: 'glassware', items };
      case 'ir': return { type: 'ir', peaks: parseIrLines(irText) };
      case 'ms': return { type: 'ms', molecularIon: Number(molecularIon) || undefined, peaks: parseMsLines(msText) };
      case 'structure': return { type: 'structure', smiles, caption: caption || undefined };
      case 'haworth': return { type: 'haworth', sugar };
      case 'peptide': return { type: 'peptide', residues: peptide.split(/[-–\s]+/).filter(Boolean) };
      default: return { type: 'polymer', preset: polymer };
    }
  }, [kind, apparatus, items, irText, msText, molecularIon, smiles, caption, sugar, peptide, polymer]);

  const svg = useMemo(() => (open ? renderFigureSpecToSvg(spec, undefined, { showError: true }) : ''), [open, spec]);

  const questionOptions = (exam?.questions || []).map((q, i) => ({
    index: i,
    label: `${exam!.sections[q.sectionIndex]?.title?.split('.')[0] || 'Phần'} – Câu ${q.num}`,
  }));

  const insert = () => {
    if (!doc) return;
    doc.onUpdate(insertFigureIntoQuestion(doc.content, question, spec));
    const chosen = questionOptions.find(o => o.index === question);
    setNotice(`Đã chèn hình vào ${chosen?.label || 'câu đã chọn'}.`);
  };

  const inputClass = 'w-full border border-slate-300 rounded-md px-2 py-1.5 bg-white text-xs';

  return (
    <div className={`card-elevated flex-shrink-0 ${className}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="flex items-center gap-2 font-bold text-teal-800 text-sm">
          <FlaskConical className="w-4 h-4" /> Thư viện hình Hóa học
          <span className="font-normal text-slate-500 text-xs">Dụng cụ thí nghiệm, phổ IR/MS, công thức cấu tạo</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto">
          <div className="space-y-3 text-xs text-slate-700">
            <label className="block">
              <span className="block mb-1 font-semibold">Loại hình</span>
              <select value={kind} onChange={e => setKind(e.target.value as FigureKind)} className={inputClass}>
                {(Object.keys(KIND_LABELS) as FigureKind[]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </label>

            {kind === 'apparatus' && (
              <label className="block">
                <span className="block mb-1 font-semibold">Bộ thí nghiệm</span>
                <select value={apparatus} onChange={e => setApparatus(e.target.value)} className={inputClass}>
                  {Object.entries(APPARATUS_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            )}

            {kind === 'glassware' && (
              <fieldset>
                <legend className="mb-1 font-semibold">Dụng cụ (đánh kí hiệu theo thứ tự chọn)</legend>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(GLASSWARE_LABELS) as GlasswareName[]).map(name => (
                    <label key={name} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={items.includes(name)}
                        onChange={e => setItems(e.target.checked ? [...items, name] : items.filter(x => x !== name))}
                      />
                      {GLASSWARE_LABELS[name]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {kind === 'ir' && (
              <label className="block">
                <span className="block mb-1 font-semibold">Mỗi dòng một đỉnh: số sóng, % truyền qua, nhãn</span>
                <textarea rows={5} value={irText} onChange={e => setIrText(e.target.value)} className={`${inputClass} font-mono`} />
              </label>
            )}

            {kind === 'ms' && (
              <>
                <label className="block">
                  <span className="block mb-1 font-semibold">Mỗi dòng một đỉnh: m/z, cường độ tương đối</span>
                  <textarea rows={5} value={msText} onChange={e => setMsText(e.target.value)} className={`${inputClass} font-mono`} />
                </label>
                <label className="block">
                  <span className="block mb-1 font-semibold">m/z ion phân tử</span>
                  <input value={molecularIon} onChange={e => setMolecularIon(e.target.value)} className={inputClass} />
                </label>
              </>
            )}

            {kind === 'structure' && (
              <>
                <label className="block">
                  <span className="block mb-1 font-semibold">Chất có sẵn</span>
                  <select value={smiles} onChange={e => setSmiles(e.target.value)} className={inputClass}>
                    {!STRUCTURE_SAMPLES.some(s => s[1] === smiles) && <option value={smiles}>Tự nhập</option>}
                    {STRUCTURE_SAMPLES.map(([name, code]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block mb-1 font-semibold">Mã SMILES</span>
                  <input value={smiles} onChange={e => setSmiles(e.target.value)} className={`${inputClass} font-mono`} />
                </label>
                <label className="block">
                  <span className="block mb-1 font-semibold">Chú thích dưới hình (tùy chọn)</span>
                  <input value={caption} onChange={e => setCaption(e.target.value)} className={inputClass} />
                </label>
              </>
            )}

            {kind === 'haworth' && (
              <label className="block">
                <span className="block mb-1 font-semibold">Chất</span>
                <select value={sugar} onChange={e => setSugar(e.target.value)} className={inputClass}>
                  <option value="alpha-glucose">α-glucose</option>
                  <option value="beta-glucose">β-glucose</option>
                  <option value="alpha-fructose">α-fructose</option>
                  <option value="beta-fructose">β-fructose</option>
                </select>
              </label>
            )}

            {kind === 'peptide' && (
              <label className="block">
                <span className="block mb-1 font-semibold">Các gốc amino acid, cách nhau bằng dấu gạch</span>
                <input value={peptide} onChange={e => setPeptide(e.target.value)} className={inputClass} />
              </label>
            )}

            {kind === 'polymer' && (
              <label className="block">
                <span className="block mb-1 font-semibold">Polymer</span>
                <select value={polymer} onChange={e => setPolymer(e.target.value)} className={inputClass}>
                  {POLYMER_PRESETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            )}

            {documents.length > 1 && (
              <label className="block">
                <span className="block mb-1 font-semibold">Chèn vào tài liệu</span>
                <select value={doc?.id} onChange={e => { setDocId(e.target.value); setQuestion(0); }} className={inputClass}>
                  {documents.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[140px]">
                <span className="block mb-1 font-semibold">Chèn vào câu</span>
                <select value={question} onChange={e => setQuestion(Number(e.target.value))} className={inputClass} disabled={!questionOptions.length}>
                  {questionOptions.map(o => <option key={o.index} value={o.index}>{o.label}</option>)}
                </select>
              </label>
              <button type="button" onClick={insert} disabled={!questionOptions.length} className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white hover:bg-teal-700 rounded-md font-medium disabled:opacity-50">
                <ImagePlus className="w-3.5 h-3.5" /> Chèn hình
              </button>
              <button type="button" onClick={() => downloadSvgAsPng(svg, `hinh-hoa-hoc-${kind}.png`)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 rounded-md font-medium">
                <Download className="w-3.5 h-3.5" /> Tải PNG
              </button>
            </div>
            {notice && <p className="text-emerald-700" role="status">{notice}</p>}
          </div>

          <div className="flex items-center justify-center bg-white border border-slate-200 rounded-lg p-3 min-h-[220px] overflow-auto">
            {svg && <img src={svgToDataUrl(svg)} alt={`Xem trước ${KIND_LABELS[kind]}`} className="max-w-full h-auto" />}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChemFigurePanel;
