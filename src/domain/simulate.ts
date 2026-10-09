import { CHANGE_MINUTES, type Footpaths, type LastTrainJourney } from './lastTrain';
import type { LonLat } from './types';

/** 時間順に並べた区間（1 日分の時刻表の一部をつないだもの） */
export interface Connections {
  stations: string[];
  /** trip ごとの行き先（駅名） */
  tripDestination: (trip: number) => string;
  from: number[];
  to: number[];
  dep: number[];
  arr: number[];
  trip: number[];
}

export interface Hop {
  from: string;
  to: string;
  dep: number;
  arr: number;
}

export type SimLeg =
  | { kind: 'ride'; trip: number; destination: string; hops: Hop[] }
  | { kind: 'walk'; from: string; to: string; dep: number; arr: number };

export interface SimJourney {
  /** 出発時刻（指定した時刻。実際に乗るのは legs の最初） */
  start: number;
  dep: number;
  arr: number;
  legs: SimLeg[];
}

/** 行き方を探すときの条件 */
export interface SearchOptions {
  /** 別の列車に乗り換えるたびに余分にかかるとみなす分（乗換の少ない行き方を探すとき） */
  transferPenalty?: number;
  /** 使わない区間（connections の添字）。別の路線の行き方を探すとき */
  skip?: (k: number) => boolean;
}

type Step = { kind: 'ride'; enter: number; exit: number } | { kind: 'walk'; from: number; minutes: number };

/**
 * 前向きの Connection Scan（最早到着）。出発駅のどれかを departAt 以降に出て、到着駅のどれかに最も早く着く行き方。
 * 別の列車への乗換には CHANGE_MINUTES、同じ駅（place）内の別路線・徒歩連絡には footpaths の時間を足す。
 */
export function earliestJourney(
  c: Connections,
  footpaths: Footpaths,
  fromStations: string[],
  toStations: string[],
  departAt: number,
  options: SearchOptions = {},
): SimJourney | null {
  const penalty = options.transferPenalty ?? 0;
  const n = c.stations.length;
  const index = new Map(c.stations.map((id, i) => [id, i]));
  const foot: [number, number][][] = Array.from({ length: n }, () => []);
  c.stations.forEach((id, i) => {
    for (const [to, minutes] of footpaths.get(id) ?? []) {
      const j = index.get(to);
      if (j !== undefined) foot[i]!.push([j, minutes]);
    }
  });

  /** その駅に着く最も早い時刻 */
  const arrival = new Float64Array(n).fill(Infinity);
  /** その駅で（別の列車に）乗れるようになる時刻 */
  const ready = new Float64Array(n).fill(Infinity);
  const step: (Step | undefined)[] = new Array(n);
  const origins = new Set<number>();
  for (const id of fromStations) {
    const i = index.get(id);
    if (i === undefined) continue;
    origins.add(i);
    arrival[i] = departAt;
    ready[i] = departAt;
  }
  for (const o of origins)
    for (const [w, minutes] of foot[o]!) {
      if (origins.has(w) || departAt + minutes >= ready[w]!) continue;
      arrival[w] = departAt + minutes;
      ready[w] = departAt + minutes;
      step[w] = { kind: 'walk', from: o, minutes };
    }
  const targets = new Set(toStations.map((id) => index.get(id)).filter((i): i is number => i !== undefined));
  let best = Infinity;
  for (const t of targets) best = Math.min(best, arrival[t]!);

  const enterOf = new Map<number, number>();
  for (let k = 0; k < c.dep.length; k++) {
    const dep = c.dep[k]!;
    if (dep < departAt) continue;
    if (dep > best) break;
    const trip = c.trip[k]!;
    if (options.skip?.(k)) {
      // 使わない区間。その列車にはここから先も乗り続けられない
      enterOf.delete(trip);
      continue;
    }
    const u = c.from[k]!;
    if (!enterOf.has(trip)) {
      if (ready[u]! > dep) continue;
      enterOf.set(trip, k);
    }
    const v = c.to[k]!;
    const arr = c.arr[k]!;
    if (arr < arrival[v]!) {
      arrival[v] = arr;
      ready[v] = arr + CHANGE_MINUTES + penalty;
      step[v] = { kind: 'ride', enter: enterOf.get(trip)!, exit: k };
      if (targets.has(v)) best = Math.min(best, arr);
      for (const [w, minutes] of foot[v]!) {
        if (arr + minutes < arrival[w]!) {
          arrival[w] = arr + minutes;
          ready[w] = arr + minutes + CHANGE_MINUTES + penalty;
          step[w] = { kind: 'walk', from: v, minutes };
          if (targets.has(w)) best = Math.min(best, arr + minutes);
        }
      }
    }
  }

  let goal = -1;
  for (const t of targets) if (arrival[t] === best && best < Infinity) goal = t;
  if (goal < 0 || origins.has(goal)) return null;

  const legs: SimLeg[] = [];
  let cur = goal;
  for (let guard = 0; !origins.has(cur) && guard < 50; guard++) {
    const s = step[cur];
    if (!s) return null;
    if (s.kind === 'walk') {
      legs.unshift({
        kind: 'walk',
        from: c.stations[s.from]!,
        to: c.stations[cur]!,
        dep: arrival[s.from]!,
        arr: arrival[s.from]! + s.minutes,
      });
      cur = s.from;
    } else {
      const trip = c.trip[s.enter]!;
      const hops: Hop[] = [];
      for (let k = s.enter; k <= s.exit; k++)
        if (c.trip[k] === trip)
          hops.push({ from: c.stations[c.from[k]!]!, to: c.stations[c.to[k]!]!, dep: c.dep[k]!, arr: c.arr[k]! });
      legs.unshift({ kind: 'ride', trip, destination: c.tripDestination(trip), hops });
      cur = c.from[s.enter]!;
    }
  }
  if (!origins.has(cur)) return null;
  const rides = legs.filter((l): l is Extract<SimLeg, { kind: 'ride' }> => l.kind === 'ride');
  if (rides.length === 0) return null;
  return { start: departAt, dep: rides[0]!.hops[0]!.dep, arr: best, legs };
}

/** 地図上の位置を決めるための駅・路線の情報 */
export interface Geometry {
  coord: (stationId: string) => LonLat;
  depth: (stationId: string) => number;
  name: (stationId: string) => string;
  railwayName: (stationId: string) => string;
  /** 駅 a から b までの線路の形（通過駅を含む駅 ID の並び）。同じ路線でなければ [a, b] */
  path: (a: string, b: string) => string[];
}

export type SimPhase = 'waiting' | 'riding' | 'stopped' | 'transfer' | 'arrived';

export interface SimPosition {
  coord: LonLat;
  depth: number;
  phase: SimPhase;
  status: string;
}

const hhmm = (m: number) => {
  const r = Math.floor(m);
  return `${Math.floor(r / 60) % 24}:${String(r % 60).padStart(2, '0')}`;
};

/** 線路の形に沿って、全体の長さの fraction（0〜1）の位置 */
function along(stations: string[], fraction: number, g: Geometry): { coord: LonLat; depth: number } {
  const pts = stations.map((id) => ({ c: g.coord(id), d: g.depth(id) }));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!.c;
    const b = pts[i]!.c;
    const len = Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]);
    seg.push(len);
    total += len;
  }
  if (total === 0) return { coord: pts[0]!.c, depth: pts[0]!.d };
  let target = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]! || i === seg.length - 1) {
      const f = seg[i]! === 0 ? 0 : Math.min(1, target / seg[i]!);
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return {
        coord: [a.c[0] + (b.c[0] - a.c[0]) * f, a.c[1] + (b.c[1] - a.c[1]) * f],
        depth: a.d + (b.d - a.d) * f,
      };
    }
    target -= seg[i]!;
  }
  const last = pts[pts.length - 1]!;
  return { coord: last.c, depth: last.d };
}

/** 時刻 t に、この行程の電車（または人）がどこにいて何をしているか */
export function positionAt(j: SimJourney, t: number, g: Geometry): SimPosition {
  const at = (id: string, phase: SimPhase, status: string): SimPosition => ({
    coord: g.coord(id),
    depth: g.depth(id),
    phase,
    status,
  });
  const first = j.legs[0]!;
  const firstStation = first.kind === 'ride' ? first.hops[0]!.from : first.from;
  if (t < j.dep) return at(firstStation, 'waiting', `${g.name(firstStation)}で出発待ち（${hhmm(j.dep)} 発）`);

  for (let i = 0; i < j.legs.length; i++) {
    const leg = j.legs[i]!;
    if (leg.kind === 'walk') {
      if (t <= leg.arr) {
        const p = along([leg.from, leg.to], leg.arr === leg.dep ? 1 : (t - leg.dep) / (leg.arr - leg.dep), g);
        const where = g.name(leg.from) === g.name(leg.to) ? `${g.railwayName(leg.to)}のホーム` : `${g.name(leg.to)}駅`;
        return { ...p, phase: 'transfer', status: `${g.name(leg.from)}で乗換（${where}へ移動中）` };
      }
      continue;
    }
    const firstHop = leg.hops[0]!;
    const lastHop = leg.hops[leg.hops.length - 1]!;
    if (t > lastHop.arr) continue;
    // この列車の発車前 = 乗換の待ち時間
    if (t < firstHop.dep)
      return at(firstHop.from, 'transfer', `${g.name(firstHop.from)}で乗換（${hhmm(firstHop.dep)} 発を待つ）`);
    for (const h of leg.hops) {
      if (t < h.dep)
        return at(
          h.from,
          'stopped',
          `${g.railwayName(h.from)} ${leg.destination ? `${leg.destination}行 ` : ''}・ ${g.name(h.from)}に停車中`,
        );
      if (t <= h.arr) {
        const p = along(g.path(h.from, h.to), h.arr === h.dep ? 1 : (t - h.dep) / (h.arr - h.dep), g);
        return {
          ...p,
          phase: 'riding',
          status: `${g.railwayName(h.from)} ${leg.destination ? `${leg.destination}行 ` : ''}・ ${g.name(h.to)}へ（${hhmm(h.arr)} 着）`,
        };
      }
    }
  }
  const last = j.legs[j.legs.length - 1]!;
  const lastStation = last.kind === 'ride' ? last.hops[last.hops.length - 1]!.to : last.to;
  return at(lastStation, 'arrived', `${g.name(lastStation)}に到着（${hhmm(j.arr)}）`);
}

/** 地図の強調表示（journeyToRoute）に渡せる形に変える */
export function toStopsJourney(j: SimJourney): LastTrainJourney {
  return {
    dep: j.dep,
    arr: j.arr,
    legs: j.legs.map((l) =>
      l.kind === 'ride'
        ? {
            kind: 'ride' as const,
            stops: [l.hops[0]!.from, ...l.hops.map((h) => h.to)],
            dep: l.hops[0]!.dep,
            arr: l.hops[l.hops.length - 1]!.arr,
            destination: l.destination,
          }
        : { kind: 'walk' as const, from: l.from, to: l.to, minutes: l.arr - l.dep },
    ),
  };
}

export type CandidateLabel = '最速' | '次の電車' | '乗換が少ない' | '別ルート';

export interface JourneyCandidate {
  journey: SimJourney;
  labels: CandidateLabel[];
}

const ridesOf = (j: SimJourney) => j.legs.filter((l): l is Extract<SimLeg, { kind: 'ride' }> => l.kind === 'ride');

/** 同じ行き方か（乗る列車と乗る時刻の並びが同じ） */
const signature = (j: SimJourney) =>
  ridesOf(j)
    .map((r) => `${r.trip}@${r.hops[0]!.dep}`)
    .join('|');

/**
 * 行き方の候補。最速の行き方に加えて、次の電車・乗換の少ない行き方・最速で使う路線を避けた行き方を集める。
 * 同じ行き方は 1 つにまとめ、到着の早い順に並べる。railwayOf は駅 ID から路線 ID を返す。
 */
export function journeyCandidates(
  c: Connections,
  footpaths: Footpaths,
  fromStations: string[],
  toStations: string[],
  departAt: number,
  railwayOf: (stationId: string) => string,
  max = 6,
): JourneyCandidate[] {
  const search = (at: number, options?: SearchOptions) =>
    earliestJourney(c, footpaths, fromStations, toStations, at, options);
  const best = search(departAt);
  if (!best) return [];
  const list: JourneyCandidate[] = [];
  const add = (j: SimJourney | null, label: CandidateLabel) => {
    if (!j) return false;
    const sig = signature(j);
    const found = list.find((x) => signature(x.journey) === sig);
    if (found) {
      if (!found.labels.includes(label)) found.labels.push(label);
      return false;
    }
    list.push({ journey: j, labels: [label] });
    return true;
  };
  add(best, '最速');

  // 次の電車（出発から 60 分以内に出るものを 3 本まで）
  let at = best.dep + 1;
  // 探す回数にも上限を付ける（同じ最後の列車ばかりのときに探し続けないように）
  for (let i = 0, tries = 0; i < 3 && tries < 8; i++, tries++) {
    const j = search(at);
    if (!j || j.dep > departAt + 60) break;
    // 結局同じ最後の列車に乗るだけの行き方（途中で待つだけ）は候補にしない
    const lastTrip = (x: SimJourney) => ridesOf(x).at(-1)!.trip;
    if (!list.some((x) => lastTrip(x.journey) === lastTrip(j))) add(j, '次の電車');
    else i--;
    at = j.dep + 1;
    if (at > departAt + 60) break;
  }

  // 乗換の少ない行き方（乗換 1 回を 20 分の遅れとみなす）
  const fewer = search(departAt, { transferPenalty: 20 });
  if (fewer && ridesOf(fewer).length < ridesOf(best).length) add(fewer, '乗換が少ない');

  // 別ルート: 最速の行き方で使う路線を 1 つずつ避ける（新しい行き方は 2 つまで）
  const railways = [...new Set(ridesOf(best).flatMap((r) => r.hops.map((h) => railwayOf(h.from))))];
  let alternatives = 0;
  for (const railway of railways) {
    if (alternatives >= 2) break;
    const j = search(departAt, { skip: (k) => railwayOf(c.stations[c.from[k]!]!) === railway });
    // 最速より極端に遅い行き方は候補にしない
    if (j && j.arr <= best.arr + 45 && add(j, '別ルート')) alternatives++;
  }

  return list.sort((a, b) => a.journey.arr - b.journey.arr || a.journey.dep - b.journey.dep).slice(0, max);
}

/** 到着時刻を指定して探すとき、出発時刻をさかのぼる幅（分） */
const ARRIVAL_WINDOW = 240;

/**
 * 到着時刻 arriveBy までに着く行き方のうち、出発が最も遅いもの。
 * earliestJourney は出発時刻を遅くするほど到着も遅くなる（単調）ので、出発時刻を二分探索する。
 */
export function latestJourney(
  c: Connections,
  footpaths: Footpaths,
  fromStations: string[],
  toStations: string[],
  arriveBy: number,
  options: SearchOptions = {},
): SimJourney | null {
  const search = (at: number) => earliestJourney(c, footpaths, fromStations, toStations, at, options);
  const ok = (j: SimJourney | null): j is SimJourney => j !== null && j.arr <= arriveBy;
  let lo = arriveBy - ARRIVAL_WINDOW;
  let hi = Math.floor(arriveBy);
  let found = search(lo);
  if (!ok(found)) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const j = search(mid);
    if (ok(j)) {
      lo = mid;
      found = j;
    } else hi = mid - 1;
  }
  // 出発時刻の指定ではなく、実際に乗る時刻を起点にする
  return { ...found, start: found.dep };
}

export type ArrivalLabel = '間に合う最終' | '1本前' | '乗換が少ない' | '別ルート';

/**
 * 到着時刻を指定したときの行き方の候補。締切に間に合う最終の行き方に加えて、1 本前・乗換の少ない行き方・
 * 別ルートを集める。同じ行き方は 1 つにまとめ、出発の遅い順に並べる。
 */
export function arrivalCandidates(
  c: Connections,
  footpaths: Footpaths,
  fromStations: string[],
  toStations: string[],
  arriveBy: number,
  railwayOf: (stationId: string) => string,
  max = 6,
): { journey: SimJourney; labels: ArrivalLabel[] }[] {
  const search = (deadline: number, options?: SearchOptions) =>
    latestJourney(c, footpaths, fromStations, toStations, deadline, options);
  const last = search(arriveBy);
  if (!last) return [];
  const list: { journey: SimJourney; labels: ArrivalLabel[] }[] = [];
  const add = (j: SimJourney | null, label: ArrivalLabel) => {
    if (!j) return false;
    const sig = signature(j);
    const found = list.find((x) => signature(x.journey) === sig);
    if (found) {
      if (!found.labels.includes(label)) found.labels.push(label);
      return false;
    }
    list.push({ journey: j, labels: [label] });
    return true;
  };
  add(last, '間に合う最終');

  // 1 本前（締切から 60 分以内に着くものを 2 本まで）
  let deadline = last.arr - 1;
  for (let i = 0; i < 2; i++) {
    const j = search(deadline);
    if (!j || j.arr < arriveBy - 60) break;
    add(j, '1本前');
    deadline = j.arr - 1;
  }

  const fewer = search(arriveBy, { transferPenalty: 20 });
  if (fewer && ridesOf(fewer).length < ridesOf(last).length) add(fewer, '乗換が少ない');

  const railways = [...new Set(ridesOf(last).flatMap((r) => r.hops.map((h) => railwayOf(h.from))))];
  let alternatives = 0;
  for (const railway of railways) {
    if (alternatives >= 2) break;
    const j = search(arriveBy, { skip: (k) => railwayOf(c.stations[c.from[k]!]!) === railway });
    // 最終より極端に早く出ないといけない行き方は候補にしない
    if (j && j.dep >= last.dep - 45 && add(j, '別ルート')) alternatives++;
  }

  // 到着指定では、ゆっくり出られる（出発が遅い）順。同じ出発なら早く着く方を先に
  return list.sort((a, b) => b.journey.dep - a.journey.dep || a.journey.arr - b.journey.arr).slice(0, max);
}
