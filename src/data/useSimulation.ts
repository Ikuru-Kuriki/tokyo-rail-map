import { useEffect, useState } from 'react';
import { network, stationById } from '.';
import { buildFootpaths } from '../domain/lastTrain';
import { journeyCandidates, type JourneyCandidate } from '../domain/simulate';
import { startMinutes, type SimRouteInput } from '../domain/simRoutes';
import type { DayType } from '../domain/timetableTypes';
import { loadConnections } from './dayTimetable';

const footpaths = buildFootpaths(network);

export type SimulationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; candidates: JourneyCandidate[][]; starts: (number | null)[] };

const railwayOf = (id: string) => stationById.get(id)?.railway ?? '';

/** 各経路の行き方の候補を時刻表から求める（出発・到着がそろった経路だけ。先頭が最速） */
export function useSimulation(day: DayType, routes: SimRouteInput[], baseTime: string): SimulationState {
  const [state, setState] = useState<SimulationState>({ status: 'idle' });
  const key = JSON.stringify([day, baseTime, routes.map((r) => [r.from?.id, r.to?.id, r.mode, r.offset, r.time])]);

  useEffect(() => {
    const starts = startMinutes(routes, baseTime);
    const usable = routes.map((r, i) => r.from && r.to && r.from.id !== r.to.id && starts[i] !== null);
    if (!usable.some(Boolean)) {
      setState({ status: 'idle' });
      return;
    }
    const times = starts.filter((s, i): s is number => s !== null && usable[i]!);
    const first = Math.min(...times);
    const last = Math.max(...times);
    let alive = true;
    setState({ status: 'loading' });
    // 最初の出発から、最後の出発の 4 時間後までを読み込む
    loadConnections(day, first, Math.ceil((last - first) / 60) + 4).then(
      (conns) => {
        if (!alive) return;
        const candidates = routes.map((r, i) =>
          usable[i] ? journeyCandidates(conns, footpaths, r.from!.stations, r.to!.stations, starts[i]!, railwayOf) : [],
        );
        setState({ status: 'ready', candidates, starts });
      },
      (e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
    // key に経路の中身をまとめているので routes は直接見ない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
