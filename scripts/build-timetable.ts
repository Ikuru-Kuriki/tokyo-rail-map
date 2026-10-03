/**
 * Mini Tokyo 3D の列車時刻表から、終電の計算に使う夜間の区間だけを抜き出して
 * public/timetable/{weekday,holiday}.json を生成する。
 * 先に `npm run data` で src/data/network.json を作っておくこと。
 *
 *   NODE_USE_ENV_PROXY=1 npm run timetable
 *
 * ダウンロードした元データは .cache/ に置き、2 回目以降は再利用する。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Network } from '../src/domain/types.ts';
import type { Timetable } from '../src/domain/timetableTypes.ts';

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
}
