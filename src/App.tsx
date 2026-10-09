import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { graph, network, railwayById, stationById } from './data';
import { useSimulation } from './data/useSimulation';
import { todayDayType, useTimetable } from './data/timetable';
import { rememberStation } from './data/history';
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
import { LineSelect } from './components/LineSelect';
import { MAX_SIM_ROUTES, SimulationPanel, type SimSlot } from './components/SimulationPanel';
import { PlaybackBar } from './components/PlaybackBar';
import { nowClock } from './domain/clock';
import { stationsBetween } from './domain/journeyRoute';
import { positionAt, toStopsJourney, type Geometry } from './domain/simulate';
import type { SimRouteInput } from './domain/simRoutes';
import type { Route } from './domain/route';
import type { TrainMarker } from './map/layers';
import { SIM_COLORS, trainIconUrl } from './map/trainIcon';

type Mode = 'route' | 'last' | 'sim';

const footpaths = buildFootpaths(network);

/** シミュレーションの電車の位置を決めるための、駅と線路の情報 */
const geometry: Geometry = {
  coord: (id) => stationById.get(id)!.coord,
  depth: (id) => stationById.get(id)!.depth,
  name: (id) => stationById.get(id)!.ja,
  railwayName: (id) => railwayById.get(stationById.get(id)!.railway)!.ja,
  path: (a, b) => {
    const ra = stationById.get(a)!.railway;
    if (ra !== stationById.get(b)!.railway) return [a, b];
    return stationsBetween(railwayById.get(ra)!.stations, a, b);
  },
};

const TRAIN_ICONS = SIM_COLORS.map((c, i) => trainIconUrl(c, i + 1));

let nextSimRouteId = 1;
const newSimRoute = (): SimRouteInput => ({
  id: nextSimRouteId++,
  from: null,
  to: null,
  mode: 'offset',
  offset: 15,
  time: '',
});

export default function App() {
  const [mode, setMode] = useState<Mode>('route');
  /** 検索パネルを開いているか */
  const [panelOpen, setPanelOpen] = useState(true);
  /** 強調する路線（複数可。ほかの路線はグレーになる） */
  const [focusRailways, setFocusRailways] = useState<string[]>([]);

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

  // シミュレーション
  const [simRoutes, setSimRoutes] = useState<SimRouteInput[]>(() => [
    { ...newSimRoute(), mode: 'same' },
    newSimRoute(),
  ]);
  const [simBaseTime, setSimBaseTime] = useState(() => nowClock());
  const [simSlot, setSimSlot] = useState<SimSlot>({ route: 0, field: 'from' });
  const sim = useSimulation(day, simRoutes, simBaseTime);
  const [simTime, setSimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const simJourneys = useMemo(() => (sim.status === 'ready' ? sim.journeys : []), [sim]);
  /** 再生する時刻の範囲（最初の出発〜最後の到着の少し後） */
  const simRange = useMemo((): [number, number] | null => {
    const js = simJourneys.filter((j) => j !== null);
    if (js.length === 0) return null;
    return [Math.min(...js.map((j) => j.start)), Math.max(...js.map((j) => j.arr)) + 2];
  }, [simJourneys]);
  // 行程が変わったら最初に戻して止める
  useEffect(() => {
    if (simRange) setSimTime(simRange[0]);
    setPlaying(false);
  }, [simRange]);
  // 再生: 実際の 1 秒で speed 秒ぶん進める
  const lastFrame = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !simRange || mode !== 'sim') return;
    let raf = 0;
    const tick = (now: number) => {
      const prev = lastFrame.current ?? now;
      lastFrame.current = now;
      setSimTime((t) => {
        const next = t + ((now - prev) / 1000) * (speed / 60);
        if (next >= simRange[1]) {
          setPlaying(false);
          return simRange[1];
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastFrame.current = null;
    };
  }, [playing, simRange, speed, mode]);
  const simPositions = useMemo(
    () => simJourneys.map((j) => (j ? positionAt(j, simTime, geometry) : null)),
    [simJourneys, simTime],
  );
  const trains = useMemo<TrainMarker[]>(
    () =>
      simPositions.flatMap((p, i) =>
        p ? [{ id: `sim-${i}`, coord: p.coord, depth: p.depth, icon: TRAIN_ICONS[i]! }] : [],
      ),
    [simPositions],
  );
  /** 全経路の通り道をまとめて強調する */
  const simRoute = useMemo((): Route | null => {
    const routes = simJourneys.filter((j) => j !== null).map((j) => journeyToRoute(toStopsJourney(j), network));
    if (routes.length === 0) return null;
    return { legs: routes.flatMap((r) => r.legs), transfers: 0, minutes: 0 };
  }, [simJourneys]);
  const updateSimRoute = useCallback((index: number, patch: Partial<SimRouteInput>) => {
    setSimRoutes((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  // 選んだ駅を履歴に残す（入力欄で何も打っていないときに出る）
  useEffect(() => {
    for (const p of [from, to, home, origin, ...simRoutes.flatMap((r) => [r.from, r.to])]) if (p) rememberStation(p);
  }, [from, to, home, origin, simRoutes]);

  const onPickRailway = useCallback((id: string) => {
    // 地図の線をクリック: 強調中なら外し、そうでなければ追加する
    setFocusRailways((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);

  // 地図上の駅クリック
  const onPick = useCallback(
    (p: Place) => {
      if (mode === 'sim') {
        // 選んでいる欄に入れる。出発を入れたら同じ経路の到着へ進む
        updateSimRoute(simSlot.route, { [simSlot.field]: p });
        if (simSlot.field === 'from') setSimSlot({ route: simSlot.route, field: 'to' });
      } else if (mode === 'route') {
        // 出発が未入力か、出発の欄を選んでいるときは出発に入れる。
        // それ以外（出発・到着とも入れた後も含む）は到着を入れ替える
        if (slot === 'from' || !from) {
          setFrom(p);
          setSlot('to');
        } else {
          setTo(p);
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
    [mode, slot, from, lastSlot, home, simSlot, updateSimRoute],
  );

  const isLast = mode === 'last';
  const isSim = mode === 'sim';
  const endpoints = useMemo(
    () =>
      (isSim ? simRoutes.flatMap((r) => [r.from, r.to]) : isLast ? [home, origin] : [from, to]).filter(
        (p): p is Place => p !== null,
      ),
    [isSim, simRoutes, isLast, home, origin, from, to],
  );

  return (
    <main className="fixed inset-0">
      <RailMap
        route={isSim ? simRoute : isLast ? lastRoute : route}
        endpoints={endpoints}
        stationColors={isLast ? stationColors : null}
        placeTimes={isLast ? placeTimes : null}
        focusRailways={focusRailways}
        onPick={onPick}
        onPickRailway={onPickRailway}
        trains={isSim ? trains : undefined}
      />
      {/* スマホでは検索を上、結果を下に。PC では左上に縦に並べる */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 md:justify-start md:p-4">
        <section
          className={`panel pointer-events-auto w-full rounded-2xl bg-white/95 p-3 backdrop-blur md:w-80 md:p-4 ${isSim ? 'max-h-[45vh] overflow-y-auto md:max-h-[calc(100vh-2rem)]' : ''}`}
        >
          <div className={`flex items-center gap-2 ${panelOpen ? 'mb-2 md:mb-3' : ''}`}>
            <h1 className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="text-lg font-bold whitespace-nowrap">首都圏 路線図</span>
              <span className="hidden truncate text-[10px] font-semibold tracking-[0.15em] text-slate-400 sm:inline">
                TOKYO RAIL MAP
              </span>
            </h1>
            <button
              type="button"
              className="btn shrink-0 !px-2.5 !py-1 text-xs"
              aria-expanded={panelOpen}
              aria-controls="search-panel-body"
              onClick={() => setPanelOpen((o) => !o)}
            >
              {panelOpen ? '閉じる ▴' : '開く ▾'}
            </button>
          </div>
          <div id="search-panel-body" hidden={!panelOpen}>
            <div role="tablist" className="mb-3 flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
              {(
                [
                  ['route', '経路'],
                  ['last', '終電'],
                  ['sim', 'シミュレーション'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  className={`flex-auto rounded-md px-2 py-1.5 whitespace-nowrap ${mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {isSim ? (
              <SimulationPanel
                routes={simRoutes}
                baseTime={simBaseTime}
                day={day}
                slot={simSlot}
                state={sim}
                onSlot={setSimSlot}
                onChange={(i, patch) => {
                  updateSimRoute(i, patch);
                  if (patch.from) setSimSlot({ route: i, field: 'to' });
                }}
                onAdd={() => {
                  if (simRoutes.length >= MAX_SIM_ROUTES) return;
                  setSimRoutes((rs) => [...rs, newSimRoute()]);
                  setSimSlot({ route: simRoutes.length, field: 'from' });
                }}
                onRemove={(i) => {
                  setSimRoutes((rs) => rs.filter((_, j) => j !== i));
                  setSimSlot({ route: 0, field: 'from' });
                }}
                onBaseTime={setSimBaseTime}
                onDay={setDay}
              />
            ) : isLast ? (
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
                  // 到着を入れた後も到着の欄のままにする（次に地図で選んだ駅で到着を入れ替えられる）
                  setTo(p);
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
            <LineSelect
              value={focusRailways}
              onChange={(ids) => {
                // スマホではパネルが路線を隠すので、路線を足したら閉じる
                if (ids.length > focusRailways.length && window.innerWidth < 768) setPanelOpen(false);
                setFocusRailways(ids);
              }}
            />
          </div>
        </section>
        {mode === 'route' && panelOpen && from && to && (
          <section className="panel pointer-events-auto max-h-[40vh] w-full overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur md:max-h-none md:w-80">
            <RouteResult route={route} from={from} to={to} />
          </section>
        )}
        {panelOpen && isLast && home && (
          <section className="panel pointer-events-auto max-h-[40vh] w-full overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur md:max-h-[calc(100vh-26rem)] md:w-80">
            {timetable.status === 'loading' && <p className="text-sm text-slate-500">時刻表を読み込んでいます…</p>}
            {timetable.status === 'error' && <p className="text-sm text-red-700">{timetable.message}</p>}
            {timetable.status === 'ready' &&
              (origin ? <LastTrainResult home={home} origin={origin} journey={journey} /> : <Legend />)}
          </section>
        )}
      </div>
      {isSim && simRange && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 md:bottom-4 md:left-[22rem] md:justify-start md:p-0">
          <PlaybackBar
            start={simRange[0]}
            end={simRange[1]}
            time={simTime}
            playing={playing}
            speed={speed}
            rows={simPositions.flatMap((p, i) => (p ? [{ index: i, status: p.status }] : []))}
            onTime={setSimTime}
            onPlay={setPlaying}
            onSpeed={setSpeed}
          />
        </div>
      )}
      <p className="pointer-events-none absolute right-2 bottom-1 text-[10px] text-slate-400">
        <span className="hidden md:inline">地下の路線は深さを強調して描いています（深さは目安）・</span>
        データ: Mini Tokyo 3D / 公共交通オープンデータセンター
      </p>
    </main>
  );
}
