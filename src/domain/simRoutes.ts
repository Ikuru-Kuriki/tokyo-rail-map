import { parseClock } from './clock';
import type { Place } from './types';

/** 時刻を出発時刻として使うか、到着時刻（この時刻までに着く）として使うか */
export type TimeKind = 'depart' | 'arrive';

/** 経路 2 以降の時刻の決め方 */
export type StartMode = 'same' | 'offset' | 'time';

export interface SimRouteInput {
  id: number;
  from: Place | null;
  to: Place | null;
  mode: StartMode;
  /** mode = 'offset' のとき、経路 1 の何分後か */
  offset: number;
  /** mode = 'time' のとき、"HH:MM" */
  time: string;
}

/** 各経路の基準の時刻（出発または到着。営業日の分）。経路 1 は共通の時刻。決められなければ null */
export function baseMinutes(routes: SimRouteInput[], baseTime: string): (number | null)[] {
  const base = parseClock(baseTime);
  return routes.map((r, i) => {
    if (i === 0 || r.mode === 'same') return base;
    if (r.mode === 'offset') return base === null ? null : base + r.offset;
    return parseClock(r.time);
  });
}
