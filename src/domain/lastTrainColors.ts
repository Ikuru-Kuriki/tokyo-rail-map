/**
 * 終電時刻の色分け。遅い時刻ほど濃い青（1 色の連続スケール）。
 * 色は dataviz の検証済みパレット（blue 250 → 700）から取る。
 */
export interface Bucket {
  /** この時刻（分）以上 */
  from: number;
  label: string;
  color: string;
}

export const BUCKETS: Bucket[] = [
  { from: -Infinity, label: '〜22:59', color: '#86b6ef' },
  { from: 23 * 60, label: '23:00〜', color: '#5598e7' },
  { from: 23 * 60 + 30, label: '23:30〜', color: '#2a78d6' },
  { from: 24 * 60, label: '0:00〜', color: '#1c5cab' },
  { from: 24 * 60 + 30, label: '0:30〜', color: '#104281' },
  { from: 25 * 60, label: '1:00〜', color: '#0d366b' },
];

export const UNREACHABLE_COLOR = '#c9c5bd';

export function bucketOf(minutes: number): Bucket {
  let found = BUCKETS[0]!;
  for (const b of BUCKETS) if (minutes >= b.from) found = b;
  return found;
}
