import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { graph, network, railwayById, region, stationById } from './data';
import { REGIONS } from './data/regions';
import { useSimulation } from './data/useSimulation';
import { todayDayType, useTimetable } from './data/timetable';
import { rememberStation } from './data/history';
import { journeyToRoute } from './domain/journeyRoute';
import { buildFootpaths, formatMinutes, journeyFrom, scanLastTrains } from './domain/lastTrain';
import { bucketOf } from './domain/lastTrainColors';
import { findRoute } from './domain/route';
import { transfersOf } from './domain/ground';
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
import { positionAt, toStopsJourney, type Geometry, type SimJourney } from './domain/simulate';
import type { SimRouteInput, TimeKind } from './domain/simRoutes';
import type { Route } from './domain/route';
import type { TrainMarker } from './map/layers';
import { SIM_COLORS, trainIconUrl } from './map/trainIcon';
import { BottomSheet, sheetHeight, useViewportHeight, type SheetSnap } from './components/BottomSheet';
import { DESKTOP_QUERY, useMediaQuery } from './hooks/useMediaQuery';

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
  /** 検索パネルを開いているか（PC） */
  const [panelOpen, setPanelOpen] = useState(true);
  /** スマホでは検索・結果を下から出るシートに入れる */
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const viewportHeight = useViewportHeight();
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  /** 強調する路線（複数可。ほかの路線はグレーになる） */
  const [focusRailways, setFocusRailways] = useState<string[]>([]);

  // 経路
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [slot, setSlot] = useState<Slot>('from');
  const route = useMemo(() => (from && to ? findRoute(network, graph, from, to) : null), [from, to]);
  // 経路が出たら、スマホではシートを小さくして地図を見せる。
  // 地図が経路に寄せるときにシートの高さを使うので、effect ではなく描画中に切り替える
  const [shownRoute, setShownRoute] = useState(route);
  /** 地図で寄って見ている乗換（経路の legs[i - 1] → legs[i] の i）。経路が変わったらやめる */
  const [transferIndex, setTransferIndex] = useState<number | null>(null);
  if (route !== shownRoute) {
    setShownRoute(route);
    setTransferIndex(null);
    if (route && !desktop) setSheetSnap('peek');
  }

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
  const [simTimeKind, setSimTimeKind] = useState<TimeKind>('depart');
  const sim = useSimulation(day, simRoutes, simBaseTime, simTimeKind);
  const [simTime, setSimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  /** 経路ごとに選んだ行き方（候補の番号）。結果が変わったら最速（0）に戻す */
  const [simChoice, setSimChoice] = useState<number[]>([]);
  useEffect(() => setSimChoice([]), [sim]);
  /** 区間ごとに列車を選び直した行き方（経路ごと）。候補を選び直すか結果が変わったら消す */
  const [simCustom, setSimCustom] = useState<(SimJourney | null)[]>([]);
  useEffect(() => setSimCustom([]), [sim, simChoice]);
  const simJourneys = useMemo(
    () =>
      sim.status === 'ready'
        ? sim.candidates.map((list, i) => simCustom[i] ?? list[simChoice[i] ?? 0]?.journey ?? null)
        : [],
    [sim, simChoice, simCustom],
  );
  /** 再生する時刻の範囲（最初の出発〜最後の到着の少し後） */
  const simRange = useMemo((): [number, number] | null => {
    const js = simJourneys.filter((j) => j !== null);
    if (js.length === 0) return null;
    // 最初の電車の少し前から（到着指定では start = 実際の出発時刻）
    return [Math.min(...js.map((j) => Math.min(j.start, j.dep - 2))), Math.max(...js.map((j) => j.arr)) + 2];
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
  // スペースキーで再生・一時停止（入力欄で文字を打っているときは除く）
  useEffect(() => {
    if (mode !== 'sim' || !simRange) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code !== 'Space' || target?.closest('input, select, textarea, button')) return;
      e.preventDefault();
      setPlaying((p) => {
        if (!p && simTime >= simRange[1]) setSimTime(simRange[0]);
        return !p;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, simRange, simTime]);
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

  const searchBody = (
    <>
      {/* 時刻表の無い地域は経路だけ */}
      <div
        role="tablist"
        hidden={!region.timetable}
        className="mb-3 flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold"
      >
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
          choice={simChoice}
          journeys={simJourneys}
          customized={simRoutes.map((_, i) => Boolean(simCustom[i]))}
          onResetCustom={(route) =>
            setSimCustom((cur) => {
              const next = [...cur];
              next[route] = null;
              return next;
            })
          }
          onCustomize={(route, journey) =>
            setSimCustom((cur) => {
              const next = [...cur];
              next[route] = journey;
              return next;
            })
          }
          onChoose={(route, index) =>
            setSimChoice((cur) => {
              const next = [...cur];
              next[route] = index;
              return next;
            })
          }
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
          timeKind={simTimeKind}
          onTimeKind={setSimTimeKind}
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
    </>
  );
  const lineSelect = (
    <LineSelect
      value={focusRailways}
      onChange={(ids) => {
        // スマホではシートが路線を隠すので、路線を足したらシートを小さくする
        if (ids.length > focusRailways.length && !desktop) setSheetSnap('peek');
        setFocusRailways(ids);
      }}
    />
  );
  const routeResult =
    mode === 'route' && from && to ? (
      <RouteResult
        route={route}
        from={from}
        to={to}
        shownTransfer={transferIndex}
        onShowTransfer={(i) => {
          setTransferIndex(i);
          // スマホではシートが地図を隠すので小さくする
          if (!desktop) setSheetSnap('peek');
        }}
      />
    ) : null;
  // 地図は乗換が変わったときだけ寄せ直すので、同じ乗換なら同じものを渡す
  const transfer = useMemo(
    () =>
      mode === 'route' && route && transferIndex !== null ? (transfersOf(route.legs)[transferIndex - 1] ?? null) : null,
    [mode, route, transferIndex],
  );
  const lastResult =
    isLast && home ? (
      <>
        {timetable.status === 'loading' && <p className="text-sm text-slate-500">時刻表を読み込んでいます…</p>}
        {timetable.status === 'error' && <p className="text-sm text-red-700">{timetable.message}</p>}
        {timetable.status === 'ready' &&
          (origin ? <LastTrainResult home={home} origin={origin} journey={journey} /> : <Legend />)}
      </>
    ) : null;
  const playback = isSim && simRange && (
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
  );
  const credit = region.credit;
  /** シートを小さくしたときに見出しの下に出す 1 行 */
  const summary = isSim
    ? `経路 ${simRoutes.filter((r) => r.from && r.to).length} 本・${simBaseTime} ${simTimeKind === 'depart' ? '出発' : '到着'}`
    : isLast
      ? home
        ? `帰る駅: ${home.ja}${origin ? `・今いる駅: ${origin.ja}` : ''}`
        : '帰る駅を選んでください（地図の駅をタップしても選べます）'
      : from && to
        ? route
          ? `${from.ja} → ${to.ja}・約 ${route.minutes} 分・乗換 ${route.transfers} 回`
          : `${from.ja} → ${to.ja}`
        : from
          ? `${from.ja} → 到着駅を選んでください`
          : '出発駅を選んでください（地図の駅をタップしても選べます）';
  const sheetPx = sheetHeight(sheetSnap, viewportHeight);

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
        transfer={transfer}
        onCloseTransfer={() => setTransferIndex(null)}
        // 大きく広げているときは地図を見ていないので、中の高さで寄せる
        bottomInset={desktop ? 0 : sheetHeight(sheetSnap === 'full' ? 'half' : sheetSnap, viewportHeight)}
      />
      {desktop ? (
        <>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-start gap-3 p-4">
            <section
              className={`panel pointer-events-auto rounded-2xl bg-white/95 p-4 backdrop-blur ${isSim ? 'w-96 max-h-[calc(100vh-2rem)] overflow-y-auto' : 'w-80'}`}
            >
              <div className={`flex items-center gap-2 ${panelOpen ? 'mb-3' : ''}`}>
                <h1 className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="text-lg font-bold whitespace-nowrap">{region.title}</span>
                  <span className="truncate text-[10px] font-semibold tracking-[0.15em] text-slate-400">
                    {region.en}
                  </span>
                  <RegionSelect />
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
                {searchBody}
                {lineSelect}
              </div>
            </section>
            {panelOpen && routeResult && (
              <section className="panel pointer-events-auto w-80 overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur">
                {routeResult}
              </section>
            )}
            {panelOpen && lastResult && (
              <section className="panel pointer-events-auto max-h-[calc(100vh-26rem)] w-80 overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur">
                {lastResult}
              </section>
            )}
          </div>
          {playback && (
            <div className="pointer-events-none absolute right-0 bottom-4 left-[26rem] flex justify-start">
              {playback}
            </div>
          )}
          <p className="pointer-events-none absolute right-2 bottom-1 text-[10px] text-slate-400">
            地下の路線は深さを強調して描いています（深さは目安）・{credit}
          </p>
        </>
      ) : (
        <>
          {playback && sheetSnap !== 'full' && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 pr-[4.25rem]"
              style={{ bottom: sheetPx + 8 }}
            >
              {playback}
            </div>
          )}
          <BottomSheet
            snap={sheetSnap}
            onSnap={setSheetSnap}
            viewportHeight={viewportHeight}
            header={
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-base leading-tight font-bold">
                  {region.title}
                  <RegionSelect />
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-500">{summary}</p>
              </div>
            }
          >
            {/* 駅名の入力欄を選んだら、キーボードと候補が収まるようにシートを広げる */}
            <div
              className="pt-1"
              onFocusCapture={(e) => {
                const t = e.target;
                if (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search')) setSheetSnap('full');
              }}
            >
              {searchBody}
            </div>
            {(routeResult || lastResult) && (
              <div className="mt-3 border-t border-slate-100 pt-3">{routeResult ?? lastResult}</div>
            )}
            {lineSelect}
            <p className="mt-4 text-[10px] text-slate-400">
              地下の路線は深さを強調して描いています（深さは目安）。{credit}
            </p>
          </BottomSheet>
        </>
      )}
    </main>
  );
}

/** 地域の切り替え（地域が 1 つだけなら出さない）。選ぶとページを読み直す（main.tsx の hashchange） */
function RegionSelect() {
  if (REGIONS.length < 2) return null;
  return (
    <select
      aria-label="地域"
      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700"
      value={region.id}
      onChange={(e) => {
        location.hash = e.target.value;
      }}
    >
      {REGIONS.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
