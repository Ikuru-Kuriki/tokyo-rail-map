export interface LabelCandidate {
  id: string;
  ja: string;
  en: string;
  /** 駅名の横に添える時刻（終電マップ） */
  time?: string;
  /** 駅名の左に出す駅ナンバリング */
  codes?: { code: string; color: string }[];
  /** 画面上の位置（駅の点） */
  x: number;
  y: number;
  /** 大きいほど優先 */
  priority: number;
  /** 出発・到着駅など、画面端でも必ず出すラベル（画面内に寄せる） */
  pinned?: boolean;
  /** 強調中の路線に無い駅（薄く表示する） */
  dim?: boolean;
}

export interface PlacedLabel extends LabelCandidate {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const overlaps = (a: Rect, b: Rect, margin: number) =>
  a.left < b.left + b.width + margin &&
  b.left < a.left + a.width + margin &&
  a.top < b.top + b.height + margin &&
  b.top < a.top + a.height + margin;

export const LABEL_HEIGHT = 42;
/** スマホ用の小さいラベル（英字を出さない）の高さ */
export const COMPACT_LABEL_HEIGHT = 30;
/** ラベルの下端と駅の点の間隔 */
const GAP = 8;

/** 駅ナンバリング 1 つ分の幅（枠と間隔を含む） */
const CODE_WIDTH = 34;

export function labelWidth(ja: string, en: string, time = '', codes = 0, compact = false): number {
  if (compact) return ja.length * 14 + (time ? time.length * 8 + 4 : 0) + 16 + codes * CODE_WIDTH;
  return Math.max(ja.length * 17 + (time ? time.length * 9 + 6 : 0), en.length * 7.6) + 24 + codes * CODE_WIDTH;
}

/**
 * 優先度の高い順に、他のラベルと重ならず画面内に収まるものだけを置く。
 * ラベルは駅の点の少し上に、左右中央で置く。
 */
export function placeLabels(
  candidates: LabelCandidate[],
  width: number,
  height: number,
  max = 60,
  /** スマホ用の小さいラベルにする */
  compact = false,
  /** ボタンなどで覆われていて、ラベルを置かない範囲（出発・到着などの固定のラベルは除く） */
  blocked: Rect[] = [],
): PlacedLabel[] {
  const h = compact ? COMPACT_LABEL_HEIGHT : LABEL_HEIGHT;
  const placed: PlacedLabel[] = [];
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    if (placed.length >= max) break;
    const w = labelWidth(c.ja, c.en, c.time, c.codes?.length ?? 0, compact);
    let left = c.x - w / 2;
    let top = c.y - h - GAP;
    if (c.pinned) {
      left = Math.min(Math.max(left, 4), width - w - 4);
      top = Math.min(Math.max(top, 4), height - h - 4);
    } else if (left < 0 || top < 0 || left + w > width || c.y > height) continue;
    const rect = { left, top, width: w, height: h };
    if (!c.pinned && blocked.some((b) => overlaps(rect, b, 0))) continue;
    const hit = placed.some((p) => overlaps(rect, p, 4));
    if (hit) continue;
    placed.push({ ...c, left, top, width: w, height: h });
  }
  return placed;
}

/** 駅名ラベルの出し方: 標準・主要駅のみ・なし（出発・到着と経路の乗換駅だけ） */
export type LabelDensity = 'normal' | 'major' | 'none';

export const LABEL_DENSITIES: { value: LabelDensity; label: string }[] = [
  { value: 'normal', label: '標準' },
  { value: 'major', label: '主要駅' },
  { value: 'none', label: 'なし' },
];

/**
 * ラベルを出す優先度の下限。優先度は駅の路線数に、強調中の路線 +50、経路の乗換駅 +100、
 * 出発・到着 +200 を足したもの。
 */
export function minLabelPriority(zoom: number, density: LabelDensity): number {
  if (density === 'none') return 100;
  if (density === 'major') return zoom < 11.3 ? 4 : zoom < 12.5 ? 3 : 2;
  return zoom < 10.3 ? 3 : zoom < 11.3 ? 2 : 1;
}
