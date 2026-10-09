import type { Connections } from '../domain/simulate';
import type { DayChunk, DayIndex, DayType } from '../domain/timetableTypes';

/** 1 時間ごとのファイルをつないで、時刻順の区間にする（ファイルは時刻順に渡す） */
export function mergeChunks(index: DayIndex, chunks: DayChunk[]): Connections {
  const c: Connections = {
    stations: index.stations,
    tripDestination: (trip) => index.destinations[index.tripDest[trip] ?? -1] ?? '',
    from: [],
    to: [],
    dep: [],
    arr: [],
    trip: [],
  };
  for (const ch of chunks) {
    c.from.push(...ch.from);
    c.to.push(...ch.to);
    c.dep.push(...ch.dep);
    c.arr.push(...ch.arr);
    c.trip.push(...ch.trip);
  }
  return c;
}

const base = () => `${import.meta.env.BASE_URL}timetable/day/`;
const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(base() + path).then((res) => {
      if (!res.ok) throw new Error(`時刻表を読み込めませんでした（${res.status}）`);
      return res.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

/** 出発時刻（営業日の分）から hours 時間分の区間を読み込む */
export async function loadConnections(day: DayType, fromMinutes: number, hours = 4): Promise<Connections> {
  const index = await load<DayIndex>(`${day}/index.json`);
  const first = Math.floor(fromMinutes / 60);
  const wanted = index.hours.filter((h) => h >= first && h < first + hours);
  const chunks = await Promise.all(wanted.map((h) => load<DayChunk>(`${day}/${String(h).padStart(2, '0')}.json`)));
  return mergeChunks(index, chunks);
}
