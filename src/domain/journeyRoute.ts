import type { LastTrainJourney } from './lastTrain';
import type { Leg, Route } from './route';
import type { Network } from './types';

/**
 * 路線上の a から b までの駅を順に返す（通過駅も含める）。
 * 環状線は始点と終点に同じ駅があるので、近い向きを選ぶ。
 */
export function stationsBetween(order: string[], a: string, b: string): string[] {
  const loop = order.length > 2 && order[0] === order[order.length - 1];
  const ring = loop ? order.slice(0, -1) : order;
  const i = ring.indexOf(a);
  const j = ring.indexOf(b);
  if (i < 0 || j < 0) return [a, b];
  if (!loop) return i <= j ? ring.slice(i, j + 1) : ring.slice(j, i + 1).reverse();
  const n = ring.length;
  const step = (j - i + n) % n <= (i - j + n) % n ? 1 : -1;
  const out = [a];
  for (let k = i; k !== j; ) {
    k = (k + step + n) % n;
    out.push(ring[k]!);
  }
  return out;
}

/** 終電の行き方を、地図で強調表示するための Route に変換する */
export function journeyToRoute(journey: LastTrainJourney, network: Network): Route {
  const railwayOf = new Map(network.stations.map((s) => [s.id, s.railway]));
  const orderOf = new Map(network.railways.map((r) => [r.id, r.stations]));
  const legs: Leg[] = [];
  for (const leg of journey.legs) {
    if (leg.kind !== 'ride') continue;
    let current: Leg | null = null;
    for (let i = 0; i < leg.stops.length; i++) {
      const id = leg.stops[i]!;
      const railway = railwayOf.get(id)!;
      if (current && current.railway === railway) {
        const prev = current.stations[current.stations.length - 1]!;
        current.stations.push(...stationsBetween(orderOf.get(railway)!, prev, id).slice(1));
      } else {
        // 直通運転で路線が変わるところでは区間を分ける
        current = { railway, stations: [id] };
        legs.push(current);
      }
    }
  }
  const rides = legs.filter((l) => l.stations.length > 1);
  return {
    legs: rides,
    transfers: Math.max(0, journey.legs.filter((l) => l.kind === 'ride').length - 1),
    minutes: Number.isFinite(journey.arr) ? journey.arr - journey.dep : 0,
  };
}
