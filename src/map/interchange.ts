import type { LonLat } from '../domain/types';

/** この距離（m）より近い点は同じ位置とみなす */
const SAME_POINT_M = 25;

function distM([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110540);
}

/**
 * 同じ駅（place）なのに路線ごとに位置がずれている駅を、1 本のつながりとして描くための線分。
 * 駅の点どうしを最短でつなぐ木（最小全域木）を返す。点が 1 か所にまとまっていれば空。
 */
export function interchangeLinks(points: LonLat[]): [LonLat, LonLat][] {
  const uniq: LonLat[] = [];
  for (const p of points) if (!uniq.some((q) => distM(p, q) < SAME_POINT_M)) uniq.push(p);
  if (uniq.length < 2) return [];
  const inTree = [0];
  const links: [LonLat, LonLat][] = [];
  while (inTree.length < uniq.length) {
    let best: [number, number, number] | null = null;
    for (const i of inTree)
      for (let j = 0; j < uniq.length; j++) {
        if (inTree.includes(j)) continue;
        const d = distM(uniq[i]!, uniq[j]!);
        if (!best || d < best[2]) best = [i, j, d];
      }
    inTree.push(best![1]);
    links.push([uniq[best![0]]!, uniq[best![1]]!]);
  }
  return links;
}
