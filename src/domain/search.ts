import type { Place } from './types';

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-ー・]/g, '');

/** 駅名（日本語・ローマ字）で前方一致 → 部分一致の順に探す。乗換駅が多い駅を先にする */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: [number, Place][] = [];
  for (const p of places) {
    const ja = normalize(p.ja);
    const en = normalize(p.en);
    let score: number;
    if (ja === q || en === q) score = 0;
    else if (ja.startsWith(q) || en.startsWith(q)) score = 1;
    else if (ja.includes(q) || en.includes(q)) score = 2;
    else continue;
    scored.push([score * 100 - p.lines, p]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, p]) => p);
}
