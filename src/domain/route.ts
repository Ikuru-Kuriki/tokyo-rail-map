import type { Graph } from './graph';
import type { Network, Place } from './types';

export interface Leg {
  railway: string;
  /** この区間で通る駅（乗る駅〜降りる駅） */
  stations: string[];
}

export interface Route {
  legs: Leg[];
  transfers: number;
  /** 目安の所要時間（分） */
  minutes: number;
}

/** 小さな二分ヒープ（Dijkstra 用） */
class MinHeap {
  private items: [number, string][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, string]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * 出発地から目的地への最短経路を求める。出発地・目的地内の駅はどれを使ってもよい。
 * 到達できなければ null。
 */
export function findRoute(
  network: Network,
  graph: Graph,
  from: Place,
  to: Place,
): Route | null {
  if (from.id === to.id) return null;
  const starts = from.stations;
  const goals = new Set(to.stations);
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const heap = new MinHeap();
  for (const s of starts) {
    dist.set(s, 0);
    heap.push([0, s]);
  }

  let goal: string | undefined;
  while (heap.size) {
    const [d, node] = heap.pop()!;
    if (d > (dist.get(node) ?? Infinity)) continue;
    if (goals.has(node)) {
      goal = node;
      break;
    }
    for (const e of graph.get(node) ?? []) {
      const nd = d + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, node);
        heap.push([nd, e.to]);
      }
    }
  }
  if (!goal) return null;

  const path: string[] = [goal];
  for (let n = goal; prev.has(n); ) {
    n = prev.get(n)!;
    path.unshift(n);
  }

  const railwayOf = new Map(network.stations.map((s) => [s.id, s.railway]));
  const legs: Leg[] = [];
  for (const id of path) {
    const railway = railwayOf.get(id)!;
    const last = legs[legs.length - 1];
    if (last && last.railway === railway) last.stations.push(id);
    else legs.push({ railway, stations: [id] });
  }
  // 乗換だけで生じた 1 駅の区間（構内の移動）は取り除く
  const rides = legs.filter((l) => l.stations.length > 1);
  return {
    legs: rides,
    transfers: Math.max(0, rides.length - 1),
    minutes: Math.round(dist.get(goal)!),
  };
}
