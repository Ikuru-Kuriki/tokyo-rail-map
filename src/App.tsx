import { useCallback, useMemo, useState } from 'react';
import { graph, network } from './data';
import { todayDayType, useTimetable } from './data/timetable';
import { journeyToRoute } from './domain/journeyRoute';
import { buildFootpaths, formatMinutes, journeyFrom, scanLastTrains } from './domain/lastTrain';
import { bucketOf } from './domain/lastTrainColors';
import { findRoute } from './domain/route';
import type { DayType } from './domain/timetableTypes';
import type { Place } from './domain/types';
import { RailMap } from './map/RailMap';
import { hexToRgb } from './map/style';
import { RouteSearch, type Slot } from './components/RouteSearch';
import { RouteResult } from './components/RouteResult';
import { LastTrainSearch, type LastSlot } from './components/LastTrainSearch';
import { LastTrainResult, Legend } from './components/LastTrainResult';

type Mode = 'route' | 'last';

const footpaths = buildFootpaths(network);

export default function App() {
  const [mode, setMode] = useState<Mode>('route');

  // 経路
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [slot, setSlot] = useState<Slot>('from');
  const route = useMemo(() => (from && to ? findRoute(network, graph, from, to) : null), [from, to]);

  // 終電
  const [home, setHome] = useState<Place | null>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [lastSlot, setLastSlot] = useState<LastSlot>('home');
  const [day, setDay] = useState<DayType>(() => todayDayType());
  const timetable = useTimetable(day, mode === 'last');

  const scan = useMemo(() => {
    if (!home || timetable.status !== 'ready') return null;
    return scanLastTrains(timetable.timetable, footpaths, home.stations);
  }, [home, timetable]);

  /** place ごとの終電時刻（その駅のどの路線から出てもよい） */
  const placeLatest = useMemo(() => {
    if (!scan) return null;
    const m = new Map<string, number>();
    for (const p of network.places) {
      let best = -Infinity;
      for (const id of p.stations) best = Math.max(best, scan.latest.get(id) ?? -Infinity);
      if (best > -Infinity) m.set(p.id, best);
    }
    return m;
  }, [scan]);

  const journey = useMemo(() => {
    if (!scan || !origin || !placeLatest) return null;
    // 最も遅くまで帰れる路線の駅から出る
    let start: string | null = null;
    let best = -Infinity;
    for (const id of origin.stations) {
      const v = scan.latest.get(id) ?? -Infinity;
      if (v > best) {
        best = v;
        start = id;
      }
    }
    return start ? journeyFrom(scan, start) : null;
  }, [scan, origin, placeLatest]);

  const lastRoute = useMemo(() => (journey ? journeyToRoute(journey, network) : null), [journey]);

  const stationColors = useMemo(() => {
    if (!placeLatest) return null;
    const m = new Map<string, [number, number, number]>();
    for (const p of network.places) {
      const v = placeLatest.get(p.id);
      if (v === undefined) continue;
      const rgb = hexToRgb(bucketOf(v).color);
      for (const id of p.stations) m.set(id, rgb);
    }
    return m;
  }, [placeLatest]);

  const placeTimes = useMemo(() => {
    if (!placeLatest) return null;
    const m = new Map<string, string>();
    for (const [id, v] of placeLatest) m.set(id, Number.isFinite(v) ? formatMinutes(v) : '');
    return m;
  }, [placeLatest]);

  // 地図上の駅クリック
  const onPick = useCallback(
    (p: Place) => {
      if (mode === 'route') {
        if (slot === 'from') {
          setFrom(p);
          setSlot('to');
        } else {
          setTo(p);
          setSlot('from');
        }
      } else if (lastSlot === 'home' && !home) {
        setHome(p);
        setLastSlot('origin');
      } else if (lastSlot === 'home') {
        setHome(p);
      } else {
        setOrigin(p);
      }
    },
    [mode, slot, lastSlot, home],
  );

  const isLast = mode === 'last';
  const endpoints = useMemo(
    () => (isLast ? [home, origin] : [from, to]).filter((p): p is Place => p !== null),
    [isLast, home, origin, from, to],
  );

  return (
    <main className="fixed inset-0">
      <RailMap
        route={isLast ? lastRoute : route}
        endpoints={endpoints}
        stationColors={isLast ? stationColors : null}
        placeTimes={isLast ? placeTimes : null}
        onPick={onPick}
      />
      {/* スマホでは検索を上、結果を下に。PC では左上に縦に並べる */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 md:justify-start md:p-4">
        <section className="panel pointer-events-auto w-full rounded-2xl bg-white/95 p-3 backdrop-blur md:w-80 md:p-4">
          <h1 className="mb-2 flex items-baseline gap-2 md:mb-3">
            <span className="text-lg font-bold">首都圏 路線図</span>
            <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-400">TOKYO RAIL MAP</span>
          </h1>
          <div role="tablist" className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
            {(
              [
                ['route', '経路'],
                ['last', '終電'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={`rounded-md py-1.5 ${mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {isLast ? (
            <LastTrainSearch
              home={home}
              origin={origin}
              day={day}
              slot={lastSlot}
              onSlot={setLastSlot}
              onHome={(p) => {
                setHome(p);
                if (p) setLastSlot('origin');
              }}
              onOrigin={setOrigin}
              onDay={setDay}
              onClear={() => {
                setHome(null);
                setOrigin(null);
                setLastSlot('home');
              }}
            />
          ) : (
            <RouteSearch
              from={from}
              to={to}
              slot={slot}
              onSlot={setSlot}
              onFrom={(p) => {
                setFrom(p);
                if (p) setSlot('to');
              }}
              onTo={(p) => {
                setTo(p);
                if (p) setSlot('from');
              }}
              onSwap={() => {
                setFrom(to);
                setTo(from);
              }}
              onClear={() => {
                setFrom(null);
                setTo(null);
                setSlot('from');
              }}
            />
          )}
        </section>
        {!isLast && from && to && (
          <section className="panel pointer-events-auto max-h-[40vh] w-full overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur md:max-h-none md:w-80">
            <RouteResult route={route} from={from} to={to} />
          </section>
        )}
        {isLast && home && (
          <section className="panel pointer-events-auto max-h-[40vh] w-full overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur md:max-h-[calc(100vh-26rem)] md:w-80">
            {timetable.status === 'loading' && <p className="text-sm text-slate-500">時刻表を読み込んでいます…</p>}
            {timetable.status === 'error' && <p className="text-sm text-red-700">{timetable.message}</p>}
            {timetable.status === 'ready' &&
              (origin ? <LastTrainResult home={home} origin={origin} journey={journey} /> : <Legend />)}
          </section>
        )}
      </div>
      <p className="pointer-events-none absolute right-2 bottom-1 text-[10px] text-slate-400">
        <span className="hidden md:inline">地下の路線は深さを強調して描いています（深さは目安）・</span>
        データ: Mini Tokyo 3D / 公共交通オープンデータセンター
      </p>
    </main>
  );
}
