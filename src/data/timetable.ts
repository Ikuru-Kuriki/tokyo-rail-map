import { useEffect, useState } from 'react';
import type { DayType, Timetable } from '../domain/timetableTypes';

const cache = new Map<DayType, Promise<Timetable>>();

/** 時刻表は大きいので、終電タブを開いたときに初めて読み込む */
export function loadTimetable(day: DayType): Promise<Timetable> {
  let p = cache.get(day);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}timetable/${day}.json`).then((res) => {
      if (!res.ok) throw new Error(`時刻表を読み込めませんでした（${res.status}）`);
      return res.json() as Promise<Timetable>;
    });
    p.catch(() => cache.delete(day));
    cache.set(day, p);
  }
  return p;
}

export type TimetableState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; timetable: Timetable };

export function useTimetable(day: DayType, enabled: boolean): TimetableState {
  const [state, setState] = useState<TimetableState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: 'loading' });
    loadTimetable(day).then(
      (timetable) => alive && setState({ status: 'ready', timetable }),
      (e: unknown) => alive && setState({ status: 'error', message: String(e instanceof Error ? e.message : e) }),
    );
    return () => {
      alive = false;
    };
  }, [day, enabled]);
  return state;
}

/** 今の営業日（3 時までは前日扱い）が土日なら土休日ダイヤ。祝日は手動で切り替える */
export function todayDayType(now = new Date()): DayType {
  const d = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return d.getDay() === 0 || d.getDay() === 6 ? 'holiday' : 'weekday';
}
