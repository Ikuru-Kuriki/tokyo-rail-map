/**
 * Mini Tokyo 3D の列車時刻表から、次の 2 つを生成する。
 * - 終電の計算に使う夜間の区間だけ: public/timetable/{weekday,holiday}.json
 * - シミュレーション用の 1 日分を 1 時間ごとに分けたもの: public/timetable/day/{weekday,holiday}/{HH}.json と index.json
 * 先に `npm run data` で src/data/network.json を作っておくこと。
 *
 *   NODE_USE_ENV_PROXY=1 npm run timetable
 *
 * ダウンロードした元データは .cache/ に置き、2 回目以降は再利用する。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Network } from '../src/domain/types.ts';
import type { DayChunk, DayIndex, Timetable } from '../src/domain/timetableTypes.ts';

const BASE = 'https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/';
const CACHE = new URL('../.cache/', import.meta.url);
/** この時刻（分）以降に発車する区間だけを残す */
const FROM_MINUTES = 21 * 60;

interface SrcStop { s: string; a?: string; d?: string }
interface SrcTrain { id: string; r: string; ds?: string[]; tt: SrcStop[]; nt?: string[] }
interface SrcStation { id: string; title: { ja: string } }

async function cached<T>(name: string): Promise<T> {
  const file = new URL(name, CACHE);
  if (!existsSync(file)) {
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    mkdirSync(new URL('.', file), { recursive: true });
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** "HH:MM" → 営業日の分（3 時前は翌日扱い） */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return (h < 3 ? h + 24 : h) * 60 + m;
}

const network = JSON.parse(
  readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8'),
) as Network;
const inNetwork = new Set(network.stations.map((s) => s.id));
const titles = new Map((await cached<SrcStation[]>('stations.json')).map((s) => [s.id, s.title.ja]));

const fileName = (railwayId: string) => {
  const [op, line] = railwayId.split(/\.(.*)/) as [string, string];
  return `train-timetables/${op === 'JR-East' ? 'jreast' : op.toLowerCase()}-${line.toLowerCase()}.json`;
};

const trains: SrcTrain[] = [];
for (const r of network.railways) trains.push(...(await cached<SrcTrain[]>(fileName(r.id))));

for (const [day, label] of [
  ['weekday', '.Weekday'],
  ['holiday', '.SaturdayHoliday'],
] as const) {
  const dayTrains = trains.filter((t) => t.id.includes(label));
  interface Conn { from: string; to: string; dep: number; arr: number; train: number; trainId: string; seq: number }
  const conns: Conn[] = [];
  const destinations: string[] = [];
  const destIndex = new Map<string, number>();
  /** 列車ごとの最初の区間（直通のつなぎに使う） */
  const firstConn = new Map<string, Conn>();
  const seqOf = new Map<string, Conn[]>();

  for (const t of dayTrains) {
    const dest = titles.get(t.ds?.[0] ?? '') ?? '';
    if (!destIndex.has(dest)) {
      destIndex.set(dest, destinations.length);
      destinations.push(dest);
    }
    // 対象外の駅は飛ばし、対象の駅どうしを順につなぐ
    const stops = t.tt.filter((s) => inNetwork.has(s.s));
    const list: Conn[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!;
      const b = stops[i]!;
      const depStr = a.d ?? a.a;
      const arrStr = b.a ?? b.d;
      if (!depStr || !arrStr) continue;
      const dep = toMinutes(depStr);
      const arr = toMinutes(arrStr);
      if (arr < dep) continue; // データの不整合
      list.push({ from: a.s, to: b.s, dep, arr, train: destIndex.get(dest)!, trainId: t.id, seq: i });
    }
    if (list.length === 0) continue;
    seqOf.set(t.id, list);
    firstConn.set(t.id, list[0]!);
    conns.push(...list);
  }

  // 夜間の区間だけにして発車順に並べる
  const kept = conns.filter((c) => c.dep >= FROM_MINUTES).sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const indexOf = new Map(kept.map((c, i) => [c, i]));
  const stationIndex = new Map<string, number>();
  const stations: string[] = [];
  const idx = (id: string) => {
    let i = stationIndex.get(id);
    if (i === undefined) {
      i = stations.length;
      stationIndex.set(id, i);
      stations.push(id);
    }
    return i;
  };

  const out: Timetable = {
    stations,
    destinations,
    from: [], to: [], dep: [], arr: [], train: [], next: [], next2: [],
  };
  const byTrain = new Map(dayTrains.map((t) => [t.id, t]));
  for (const c of kept) {
    const list = seqOf.get(c.trainId)!;
    const pos = list.indexOf(c);
    let nexts: Conn[] = [];
    if (pos < list.length - 1) nexts = [list[pos + 1]!];
    else {
      // 終点で直通先の列車に続く
      nexts = (byTrain.get(c.trainId)!.nt ?? [])
        .map((id) => firstConn.get(id))
        .filter((n): n is Conn => n !== undefined);
    }
    const ni = nexts.map((n) => indexOf.get(n)).filter((n): n is number => n !== undefined);
    out.from.push(idx(c.from));
    out.to.push(idx(c.to));
    out.dep.push(c.dep);
    out.arr.push(c.arr);
    out.train.push(c.train);
    out.next.push(ni[0] ?? -1);
    out.next2.push(ni[1] ?? -1);
  }

  mkdirSync(new URL('../public/timetable/', import.meta.url), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(new URL(`../public/timetable/${day}.json`, import.meta.url), json);
  console.log(`${day}: trains ${dayTrains.length}, connections ${out.dep.length}, ${(json.length / 1e6).toFixed(1)} MB`);

  // ---- シミュレーション用の 1 日分 ----
  // 直通運転（nt の最初の行き先）でつながる列車は同じ trip にする
  const prevOf = new Map<string, string>();
  for (const t of dayTrains) {
    const n = t.nt?.[0];
    if (n && !prevOf.has(n)) prevOf.set(n, t.id);
  }
  const rootOf = (id: string) => {
    let cur = id;
    for (let guard = 0; prevOf.has(cur) && guard < 20; guard++) cur = prevOf.get(cur)!;
    return cur;
  };
  const tripIndex = new Map<string, number>();
  const tripDest: number[] = [];
  const tripOf = (trainId: string) => {
    const root = rootOf(trainId);
    let i = tripIndex.get(root);
    if (i === undefined) {
      i = tripDest.length;
      tripIndex.set(root, i);
      tripDest.push(-1);
    }
    return i;
  };
  // 行き先は直通の最後の列車のもの
  for (const t of dayTrains) {
    if (!seqOf.has(t.id)) continue;
    tripDest[tripOf(t.id)] = seqOf.get(t.id)![0]!.train;
  }
  const dayStations = [...stations];
  const dayStationIndex = new Map(dayStations.map((id, i) => [id, i]));
  const dIdx = (id: string) => {
    let i = dayStationIndex.get(id);
    if (i === undefined) {
      i = dayStations.length;
      dayStationIndex.set(id, i);
      dayStations.push(id);
    }
    return i;
  };
  const all = [...conns].sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const chunks = new Map<number, DayChunk>();
  for (const c of all) {
    const hour = Math.floor(c.dep / 60);
    let ch = chunks.get(hour);
    if (!ch) {
      ch = { from: [], to: [], dep: [], arr: [], trip: [] };
      chunks.set(hour, ch);
    }
    ch.from.push(dIdx(c.from));
    ch.to.push(dIdx(c.to));
    ch.dep.push(c.dep);
    ch.arr.push(c.arr);
    ch.trip.push(tripOf(c.trainId));
  }
  const dir = new URL(`../public/timetable/day/${day}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  const hours = [...chunks.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const h of hours) {
    const text = JSON.stringify(chunks.get(h));
    total += text.length;
    writeFileSync(new URL(`${String(h).padStart(2, '0')}.json`, dir), text);
  }
  const index: DayIndex = { stations: dayStations, destinations, tripDest, hours };
  writeFileSync(new URL('index.json', dir), JSON.stringify(index));
  console.log(
    `${day} (1 日分): connections ${all.length}, trips ${tripDest.length}, hours ${hours[0]}-${hours[hours.length - 1]}, ${(total / 1e6).toFixed(1)} MB`,
  );
}
