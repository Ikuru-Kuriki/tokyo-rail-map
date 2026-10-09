import raw from './network.json';
import { buildGraph } from '../domain/graph';
import type { Network, Place, Railway, Station } from '../domain/types';

export const network = raw as unknown as Network;
export const graph = buildGraph(network);

export const railwayById = new Map<string, Railway>(network.railways.map((r) => [r.id, r]));
export const stationById = new Map<string, Station>(network.stations.map((s) => [s.id, s]));
export const placeById = new Map<string, Place>(network.places.map((p) => [p.id, p]));
export const placeByStation = new Map<string, Place>(
  network.places.flatMap((p) => p.stations.map((id) => [id, p] as const)),
);

/** 駅に乗り入れる路線（色の表示用） */
export function railwaysOf(place: Place): Railway[] {
  const ids = new Set(place.stations.map((id) => stationById.get(id)!.railway));
  return [...ids].map((id) => railwayById.get(id)!);
}

/** 路線記号（"JK" など）。駅の番号から多いものを取る。番号の無い路線は null */
const symbolOf = new Map<string, string | null>(
  network.railways.map((r) => {
    const count = new Map<string, number>();
    for (const id of r.stations) {
      const code = stationById.get(id)!.code;
      if (code) {
        const sym = code.replace(/\d+$/, '');
        count.set(sym, (count.get(sym) ?? 0) + 1);
      }
    }
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return [r.id, best ? best[0] : null];
  }),
);

export function railwaySymbol(railwayId: string): string | null {
  return symbolOf.get(railwayId) ?? null;
}

/** 駅の番号と路線の色（表示用）。番号の無い駅は null */
export function stationCode(stationId: string): { code: string; color: string } | null {
  const s = stationById.get(stationId);
  if (!s?.code) return null;
  return { code: s.code, color: railwayById.get(s.railway)!.color };
}
