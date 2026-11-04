/**
 * CẤU TRÚC ĐỀ THIẾT LẬP 1 CHẠM (theo tài liệu đặc tả).
 * Chọn loại đề → tự đặt số câu, thời gian, thang điểm; thanh trượt tỉ lệ Biết – Hiểu – Vận dụng
 * phân lại số lệnh hỏi theo mức mà vẫn giữ đúng số câu từng phần.
 */
import type { DungSaiLevel, DungSaiLevelConfig, PointScheme, QuestionConfig } from '../types';

export type PresetGroup = 'tn' | 'dinh-ky' | 'thuong-xuyen';

export interface LevelRatio { biet: number; hieu: number; vd: number }

export interface ExamPreset {
  id: string;
  group: PresetGroup;
  label: string;
  description: string;
  duration: number;
  counts: { type1: number; type2: number; type3: number; essay: number };
  points: PointScheme;
  /** Áp cho toàn bộ chương trình 3 khối (đề ôn thi tốt nghiệp) */
  allGrades?: boolean;
  /** Được chỉnh điểm từng phần trên màn hình */
  customPoints?: boolean;
}

export const EXAM_PRESETS: ExamPreset[] = [
  {
    id: 'tn-thpt',
    group: 'tn',
    label: 'Thi Tốt nghiệp THPT / Đại học',
    description: '50 phút · 28 câu (40 lệnh hỏi) · Phần I 4,5đ – II 4,0đ – III 1,5đ',
    duration: 50,
    counts: { type1: 18, type2: 4, type3: 6, essay: 0 },
    points: { type1: 4.5, type2: 4, type3: 1.5, essay: 0 },
    allGrades: true,
  },
  {
    id: 'dinh-ky',
    group: 'dinh-ky',
    label: 'Kiểm tra định kỳ (Giữa kỳ / Cuối kỳ)',
    description: '45 phút · 12 + 2 + 4 câu + 3 câu tự luận · 3,0 – 2,0 – 2,0 – 3,0đ',
    duration: 45,
    counts: { type1: 12, type2: 2, type3: 4, essay: 3 },
    points: { type1: 3, type2: 2, type3: 2, essay: 3 },
  },
  {
    id: 'thuong-xuyen-10',
    group: 'thuong-xuyen',
    label: 'Thường xuyên: 10 câu 4 lựa chọn',
    description: '15 phút · 10 câu · mỗi câu 1,0đ',
    duration: 15,
    counts: { type1: 10, type2: 0, type3: 0, essay: 0 },
    points: { type1: 10, type2: 0, type3: 0, essay: 0 },
  },
  {
    id: 'thuong-xuyen-to-hop',
    group: 'thuong-xuyen',
    label: 'Thường xuyên: tổ hợp rút gọn',
    description: '20 phút · 8 câu 4 lựa chọn + 1 câu Đúng/Sai + 2 câu trả lời ngắn · tự chọn tỉ trọng',
    duration: 20,
    counts: { type1: 8, type2: 1, type3: 2, essay: 0 },
    points: { type1: 4, type2: 3, type3: 3, essay: 0 },
    customPoints: true,
  },
];

export const DEFAULT_LEVEL_RATIO: LevelRatio = { biet: 40, hieu: 30, vd: 30 };

export const RATIO_SHORTCUTS: Array<{ label: string; ratio: LevelRatio }> = [
  { label: 'Đề cơ bản 40 – 30 – 30', ratio: { biet: 40, hieu: 30, vd: 30 } },
  { label: 'Đề phân hóa 30 – 30 – 40', ratio: { biet: 30, hieu: 30, vd: 40 } },
];

export const getPreset = (id?: string): ExamPreset | undefined => EXAM_PRESETS.find(p => p.id === id);

export const examTypeForPreset = (preset: ExamPreset, semesterExam: string): string => {
  if (preset.group === 'tn') return 'Thi Tốt nghiệp THPT';
  if (preset.group === 'thuong-xuyen') return 'Kiểm tra thường xuyên';
  return semesterExam;
};

type LevelKey = keyof LevelRatio;
const LEVELS: LevelKey[] = ['biet', 'hieu', 'vd'];

// Phần I thiên về Biết, Phần III và Tự luận thiên về Vận dụng (đúng xu hướng đề tốt nghiệp 2026)
const PART_SKEW: Record<'type1' | 'type2' | 'type3' | 'essay', LevelRatio> = {
  type1: { biet: 1.5, hieu: 0.9, vd: 0.6 },
  type2: { biet: 1, hieu: 1, vd: 1 },
  type3: { biet: 0.3, hieu: 1, vd: 1.6 },
  essay: { biet: 0.1, hieu: 0.9, vd: 2 },
};

/** Chia n phần theo trọng số, phần dư cấp cho nơi có số lẻ lớn nhất. */
const apportion = (n: number, weights: number[]): number[] => {
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const exact = weights.map(w => (w / total) * n);
  const out = exact.map(Math.floor);
  let left = n - out.reduce((s, x) => s + x, 0);
  exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left-- > 0) out[i]++;
  });
  return out;
};

/** Phát danh sách mức tăng dần cho từng ý: ý a của mọi câu trước, rồi ý b… để trong một câu a ≤ b ≤ c ≤ d. */
export const dealDungSaiLevels = (questionCount: number, levels: LevelRatio): DungSaiLevelConfig[] => {
  const sorted: DungSaiLevel[] = [
    ...Array<DungSaiLevel>(levels.biet).fill('nhan_biet'),
    ...Array<DungSaiLevel>(levels.hieu).fill('thong_hieu'),
    ...Array<DungSaiLevel>(levels.vd).fill('van_dung'),
  ];
  return Array.from({ length: questionCount }, (_x, q) => ({
    yA: sorted[q],
    yB: sorted[questionCount + q],
    yC: sorted[questionCount * 2 + q],
    yD: sorted[questionCount * 3 + q],
  }));
};

interface PartAllocation { key: 'type1' | 'type2' | 'type3' | 'essay'; commands: number; pointEach: number; levels: LevelRatio }

const pointsByLevel = (parts: PartAllocation[]): LevelRatio => {
  const out: LevelRatio = { biet: 0, hieu: 0, vd: 0 };
  parts.forEach(p => LEVELS.forEach(l => { out[l] += p.levels[l] * p.pointEach; }));
  return out;
};

/**
 * Dựng cấu hình số câu từ preset và tỉ lệ mức độ. Giữ đúng số câu từng phần;
 * tỉ lệ tính theo ĐIỂM, tinh chỉnh từng lệnh hỏi để sát mục tiêu nhất có thể.
 */
export const buildQuestionConfig = (preset: ExamPreset, ratio: LevelRatio, points: PointScheme = preset.points): QuestionConfig => {
  const { counts } = preset;
  const commandsOf = { type1: counts.type1, type2: counts.type2 * 4, type3: counts.type3, essay: counts.essay };
  const parts: PartAllocation[] = (['type1', 'type2', 'type3', 'essay'] as const)
    .filter(key => commandsOf[key] > 0)
    .map(key => {
      const weights = LEVELS.map(l => ratio[l] * PART_SKEW[key][l]);
      const [biet, hieu, vd] = apportion(commandsOf[key], weights);
      return { key, commands: commandsOf[key], pointEach: points[key] / commandsOf[key], levels: { biet, hieu, vd } };
    });

  const targetTotal = parts.reduce((s, p) => s + p.commands * p.pointEach, 0);
  const sumRatio = ratio.biet + ratio.hieu + ratio.vd || 1;
  const error = () => {
    const got = pointsByLevel(parts);
    return LEVELS.reduce((s, l) => s + Math.abs(got[l] - (ratio[l] / sumRatio) * targetTotal), 0);
  };
  for (let round = 0; round < 60; round++) {
    let best: { part: PartAllocation; from: LevelKey; to: LevelKey } | null = null;
    let bestErr = error() - 1e-9;
    for (const part of parts) {
      for (const from of LEVELS) {
        if (part.levels[from] === 0) continue;
        for (const to of LEVELS) {
          if (to === from) continue;
          // Giữ độ dốc của từng phần: Phần I không đảo thành toàn Vận dụng, Phần III không về toàn Biết
          if (part.key === 'type1' && to === 'vd' && part.levels.vd >= part.levels.biet) continue;
          if ((part.key === 'type3' || part.key === 'essay') && to === 'biet' && part.levels.biet >= Math.ceil(part.commands / 3)) continue;
          part.levels[from]--; part.levels[to]++;
          const e = error();
          part.levels[from]++; part.levels[to]--;
          if (e < bestErr) { bestErr = e; best = { part, from, to }; }
        }
      }
    }
    if (!best) break;
    best.part.levels[best.from]--; best.part.levels[best.to]++;
  }

  const levelOf = (key: PartAllocation['key']) => parts.find(p => p.key === key)?.levels || { biet: 0, hieu: 0, vd: 0 };
  const cfg = (l: LevelRatio) => ({ biet: l.biet, hieu: l.hieu, van_dung: l.vd, van_dung_cao: 0 });
  return {
    type1: cfg(levelOf('type1')),
    type2: cfg(levelOf('type2')),
    type2QuestionCount: counts.type2,
    dungSaiLevelConfigs: dealDungSaiLevels(counts.type2, levelOf('type2')),
    type3: cfg(levelOf('type3')),
    essay: cfg(levelOf('essay')),
    pointScheme: { ...points },
  };
};

/** Tỉ lệ % điểm thực tế theo mức của một cấu hình. */
export const actualLevelPercent = (config: QuestionConfig, points?: PointScheme): LevelRatio => {
  const pts = points || config.pointScheme;
  const out: LevelRatio = { biet: 0, hieu: 0, vd: 0 };
  if (!pts) return out;
  const add = (key: 'type1' | 'type2' | 'type3' | 'essay') => {
    const c = config[key];
    const n = c.biet + c.hieu + c.van_dung + c.van_dung_cao;
    if (!n) return;
    const each = pts[key] / n;
    out.biet += c.biet * each;
    out.hieu += c.hieu * each;
    out.vd += (c.van_dung + c.van_dung_cao) * each;
  };
  (['type1', 'type2', 'type3', 'essay'] as const).forEach(add);
  const total = out.biet + out.hieu + out.vd || 1;
  return { biet: Math.round(out.biet / total * 100), hieu: Math.round(out.hieu / total * 100), vd: Math.round(out.vd / total * 100) };
};
