export interface LabelCandidate {
  id: string;
  ja: string;
  en: string;
  /** 駅名の横に添える時刻（終電マップ） */
  time?: string;
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

export const LABEL_HEIGHT = 42;
/** ラベルの下端と駅の点の間隔 */
const GAP = 8;

export function labelWidth(ja: string, en: string, time = ''): number {
  return Math.max(ja.length * 17 + (time ? time.length * 9 + 6 : 0), en.length * 7.6) + 24;
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
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    if (placed.length >= max) break;
    const w = labelWidth(c.ja, c.en, c.time);
    let left = c.x - w / 2;
    let top = c.y - LABEL_HEIGHT - GAP;
    if (c.pinned) {
      left = Math.min(Math.max(left, 4), width - w - 4);
      top = Math.min(Math.max(top, 4), height - LABEL_HEIGHT - 4);
    } else if (left < 0 || top < 0 || left + w > width || c.y > height) continue;
    const hit = placed.some(
      (p) =>
        left < p.left + p.width + 4 &&
        p.left < left + w + 4 &&
        top < p.top + p.height + 4 &&
        p.top < top + LABEL_HEIGHT + 4,
    );
    if (hit) continue;
    placed.push({ ...c, left, top, width: w, height: LABEL_HEIGHT });
  }
  return placed;
}
