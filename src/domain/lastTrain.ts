import type { Network } from './types';
import type { Timetable } from './timetableTypes';

/** 別の列車に乗り換えるときに最低限必要な時間（分） */
export const CHANGE_MINUTES = 2;
/** 同じ構内の別の駅（路線）への移動（分）。乗換時間に足される */
export const STATION_WALK_MINUTES = 2;
/** 徒歩連絡（例: 有楽町 ↔ 日比谷）の移動（分）。乗換時間に足される */
export const STREET_WALK_MINUTES = 6;

/** 駅 → [移動先の駅, 分] */
export type Footpaths = Map<string, [string, number][]>;

export function buildFootpaths(network: Network): Footpaths {
  const paths: Footpaths = new Map();
  for (const t of network.transfers) {
    t.forEach((group, gi) =>
      t.forEach((other, oi) => {
        const minutes = gi === oi ? STATION_WALK_MINUTES : STREET_WALK_MINUTES;
        for (const a of group)
          for (const b of other) {
            if (a === b) continue;
            const list = paths.get(a);
            if (list) list.push([b, minutes]);
            else paths.set(a, [[b, minutes]]);
          }
      }),
    );
  }
  return paths;
}

export interface LastTrainResult {
  /** 駅 ID → その駅を出て目的地に着ける最も遅い時刻（分）。Infinity は目的地か徒歩で行ける駅 */
  latest: Map<string, number>;
  /** 内部状態（経路の復元に使う） */
  state: ScanState;
}

interface ScanState {
  tt: Timetable;
  targets: Set<number>;
  latest: Float64Array;
  /** 駅ごとに latest を与えた区間。-1 なら徒歩（via）か目的地 */
  best: Int32Array;
  /** 駅ごとの徒歩の移動先（-1 = 徒歩ではない） */
  via: Int32Array;
  viaMinutes: Float64Array;
  /** 区間ごとの続け方: 0 = 降りる, 1 = next に乗ったまま, 2 = next2 に乗ったまま, -1 = 使えない */
  choice: Int8Array;
}

/**
 * 逆向きの Connection Scan。目的地の駅（どれか）に着ける、各駅の最も遅い出発時刻を求める。
 * 区間を発車の遅い順に見ていくので、各駅で最初に決まった値が最も遅い。
 */
export function scanLastTrains(
  tt: Timetable,
  footpaths: Footpaths,
  targetStations: string[],
): LastTrainResult {
  const n = tt.stations.length;
  const index = new Map(tt.stations.map((id, i) => [id, i]));
  const foot: [number, number][][] = Array.from({ length: n }, () => []);
  tt.stations.forEach((id, i) => {
    for (const [to, minutes] of footpaths.get(id) ?? []) {
      const j = index.get(to);
      if (j !== undefined) foot[i]!.push([j, minutes]);
    }
  });

  const latest = new Float64Array(n).fill(-Infinity);
  const best = new Int32Array(n).fill(-1);
  const via = new Int32Array(n).fill(-1);
  const viaMinutes = new Float64Array(n);
  const choice = new Int8Array(tt.dep.length).fill(-1);
  const targets = new Set<number>();
  for (const id of targetStations) {
    const i = index.get(id);
    if (i === undefined) continue;
    targets.add(i);
    latest[i] = Infinity;
  }
  // 目的地へ歩いて行ける駅
  for (const t of targets)
    for (const [w] of foot[t]!) {
      // 足 w → t の向きの徒歩は foot[w] にあるが、乗換のまとまりは対称なので foot[t] で代用できる
      if (latest[w] !== Infinity) {
        latest[w] = Infinity;
        via[w] = t;
      }
    }

  for (let c = tt.dep.length - 1; c >= 0; c--) {
    const nx = tt.next[c]!;
    const nx2 = tt.next2[c]!;
    const v = tt.to[c]!;
    let how = -1;
    if (nx >= 0 && choice[nx] !== -1) how = 1;
    else if (nx2 >= 0 && choice[nx2] !== -1) how = 2;
    else if (targets.has(v) || latest[v]! >= tt.arr[c]! + CHANGE_MINUTES) how = 0;
    if (how === -1) continue;
    choice[c] = how;

    const u = tt.from[c]!;
    const dep = tt.dep[c]!;
    if (dep > latest[u]!) {
      latest[u] = dep;
      best[u] = c;
      via[u] = -1;
      for (const [w, minutes] of foot[u]!) {
        if (dep - minutes > latest[w]!) {
          latest[w] = dep - minutes;
          best[w] = -1;
          via[w] = u;
          viaMinutes[w] = minutes;
        }
      }
    }
  }

  const result = new Map<string, number>();
  tt.stations.forEach((id, i) => {
    if (latest[i]! > -Infinity) result.set(id, latest[i]!);
  });
  return { latest: result, state: { tt, targets, latest, best, via, viaMinutes, choice } };
}

export interface RideLeg {
  kind: 'ride';
  /** 停車する駅（乗る駅〜降りる駅） */
  stops: string[];
  dep: number;
  arr: number;
  /** 行き先（駅名） */
  destination: string;
}

export interface WalkLeg {
  kind: 'walk';
  from: string;
  to: string;
  minutes: number;
}

export interface LastTrainJourney {
  dep: number;
  arr: number;
  legs: (RideLeg | WalkLeg)[];
}

/** その駅からの終電の行き方を復元する。帰れない・目的地そのものなら null */
export function journeyFrom(result: LastTrainResult, stationId: string): LastTrainJourney | null {
  const { tt, targets, latest, best, via, viaMinutes, choice } = result.state;
  let cur = tt.stations.indexOf(stationId);
  if (cur < 0 || latest[cur] === -Infinity || targets.has(cur)) return null;

  const legs: (RideLeg | WalkLeg)[] = [];
  for (let guard = 0; guard < 30 && !targets.has(cur); guard++) {
    if (via[cur]! >= 0) {
      const to = via[cur]!;
      legs.push({
        kind: 'walk',
        from: tt.stations[cur]!,
        to: tt.stations[to]!,
        minutes: latest[cur] === Infinity ? 0 : viaMinutes[cur]!,
      });
      cur = to;
      continue;
    }
    let c = best[cur]!;
    if (c < 0) return null;
    const stops = [tt.stations[tt.from[c]!]!];
    const dep = tt.dep[c]!;
    const destination = tt.destinations[tt.train[c]!]!;
    for (;;) {
      stops.push(tt.stations[tt.to[c]!]!);
      const how = choice[c];
      if (how === 1) c = tt.next[c]!;
      else if (how === 2) c = tt.next2[c]!;
      else break;
    }
    legs.push({ kind: 'ride', stops, dep, arr: tt.arr[c]!, destination });
    cur = tt.to[c]!;
  }
  if (!targets.has(cur)) return null;

  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  if (rides.length === 0) return { dep: Infinity, arr: Infinity, legs };
  return { dep: rides[0]!.dep, arr: rides[rides.length - 1]!.arr, legs };
}

/** 分 → "0:12" のような表示（24 時以降は 0 時から数える） */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60) % 24;
  return `${h}:${String(m % 60).padStart(2, '0')}`;
}
