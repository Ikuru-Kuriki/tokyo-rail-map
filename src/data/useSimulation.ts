import { useEffect, useState } from 'react';
import { network, stationById } from '.';
import { buildFootpaths } from '../domain/lastTrain';
import { arrivalCandidates, journeyCandidates, type Connections, type SimJourney } from '../domain/simulate';
import { baseMinutes, type SimRouteInput, type TimeKind } from '../domain/simRoutes';
import type { DayType } from '../domain/timetableTypes';
import { loadConnections } from './dayTimetable';

const footpaths = buildFootpaths(network);

export type SimulationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      kind: TimeKind;
      candidates: { journey: SimJourney; labels: string[] }[][];
      /** 経路ごとの基準の時刻（出発指定なら出発時刻、到着指定なら締切） */
      starts: (number | null)[];
      /** 読み込んだ時刻表（区間ごとに列車を選び直すときに使う） */
      connections: Connections;
    };

const railwayOf = (id: string) => stationById.get(id)?.railway ?? '';

/**
 * 各経路の行き方の候補を時刻表から求める（出発・到着がそろった経路だけ）。
 * 出発指定なら先頭が最速、到着指定なら先頭が締切に間に合う最終
 */
export function useSimulation(
  day: DayType,
  routes: SimRouteInput[],
  baseTime: string,
  kind: TimeKind = 'depart',
): SimulationState {
  const [state, setState] = useState<SimulationState>({ status: 'idle' });
  const key = JSON.stringify([
    day,
    baseTime,
    kind,
    routes.map((r) => [r.from?.id, r.to?.id, r.mode, r.offset, r.time]),
  ]);

  useEffect(() => {
    const starts = baseMinutes(routes, baseTime);
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
    // 出発指定: 最初の出発から最後の出発の 4 時間後まで。到着指定: 最初の締切の 4 時間前から最後の締切まで
    const from = kind === 'depart' ? first : first - 240;
    const hours = kind === 'depart' ? Math.ceil((last - first) / 60) + 4 : Math.ceil((last - from) / 60) + 1;
    loadConnections(day, from, hours).then(
      (conns) => {
        if (!alive) return;
        const find = kind === 'depart' ? journeyCandidates : arrivalCandidates;
        const candidates = routes.map((r, i) =>
          usable[i] ? find(conns, footpaths, r.from!.stations, r.to!.stations, starts[i]!, railwayOf) : [],
        );
        setState({ status: 'ready', kind, candidates, starts, connections: conns });
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
