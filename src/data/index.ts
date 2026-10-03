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
