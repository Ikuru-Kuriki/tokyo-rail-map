import type { LonLat, Network } from './types';

/** 移動コストの単位は「分」の目安 */
export const MINUTES_PER_KM = 1.5;
export const STOP_MINUTES = 0.5;
/** 同じ構内での乗換 */
export const TRANSFER_MINUTES = 5;
/** 別の構内への徒歩連絡（例: JR 有楽町 ↔ 日比谷） */
export const WALK_TRANSFER_MINUTES = 8;

export interface Edge {
  to: string;
  cost: number;
  /** 乗換なら true、同じ路線の隣の駅なら false */
  transfer: boolean;
}

export type Graph = Map<string, Edge[]>;

export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function buildGraph(network: Network): Graph {
  const graph: Graph = new Map();
  const coordOf = new Map(network.stations.map((s) => [s.id, s.coord]));
  const add = (from: string, edge: Edge) => {
    const list = graph.get(from);
    if (list) list.push(edge);
    else graph.set(from, [edge]);
  };

  for (const r of network.railways) {
    for (let i = 1; i < r.stations.length; i++) {
      const a = r.stations[i - 1]!;
      const b = r.stations[i]!;
      const cost = distanceKm(coordOf.get(a)!, coordOf.get(b)!) * MINUTES_PER_KM + STOP_MINUTES;
      add(a, { to: b, cost, transfer: false });
      add(b, { to: a, cost, transfer: false });
    }
  }

  for (const t of network.transfers) {
    t.forEach((group, gi) => {
      t.forEach((other, oi) => {
        const cost = gi === oi ? TRANSFER_MINUTES : WALK_TRANSFER_MINUTES;
        for (const a of group) for (const b of other) if (a !== b) add(a, { to: b, cost, transfer: true });
      });
    });
  }
  return graph;
}
