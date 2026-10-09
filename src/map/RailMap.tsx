import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator, MapView, WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { network, placeById, placeByStation, railwayById, railwaySymbol, stationById } from '../data';
import { StationCode } from '../components/StationCode';
import type { Route } from '../domain/route';
import type { Place } from '../domain/types';
import { buildLayers, type TrainMarker } from './layers';
import { placeLabels, type LabelCandidate } from './labels';
import { sideViewFor } from './camera';
import { BACKGROUND, depthScale, elevationOf } from './style';

const INITIAL_VIEW: MapViewState = {
  longitude: 139.7,
  latitude: 35.6,
  zoom: 9.7,
  pitch: 52,
  bearing: -8,
  minZoom: 7.5,
  maxZoom: 17,
  maxPitch: 85,
};

const VIEW = new MapView({ repeat: false });
const NO_RAILWAYS: string[] = [];
const NO_TRAINS: TrainMarker[] = [];

interface Props {
  route: Route | null;
  /** 黒いラベル・点で示す駅（出発・到着、帰る駅など） */
  endpoints: Place[];
  /** 終電マップの駅の色 */
  stationColors?: Map<string, [number, number, number]> | null;
  /** ラベルに添える時刻（place ID → "0:12"） */
  placeTimes?: Map<string, string> | null;
  /** 強調する路線（複数可）。ほかの路線はグレーになる */
  focusRailways?: string[];
  onPick: (place: Place) => void;
  onPickRailway?: (railwayId: string) => void;
  /** シミュレーションの電車 */
  trains?: TrainMarker[];
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function RailMap({
  route,
  endpoints,
  stationColors = null,
  placeTimes = null,
  focusRailways = NO_RAILWAYS,
  onPick,
  onPickRailway,
  trains = NO_TRAINS,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);

  // 路線を強調したら、その路線を真横に近い角度から見る
  useEffect(() => {
    if (focusRailways.length === 0 || !width) return;
    const coords = network.railways
      .filter((r) => focusRailways.includes(r.id))
      .flatMap((r) => r.stations.map((id) => stationById.get(id)!.coord));
    if (coords.length === 0) return;
    const view = sideViewFor(coords, width >= 768 ? width - 360 : width - 32, width >= 768 ? 170 : 0);
    setViewState((v) => ({ ...v, ...view, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator() }));
  }, [focusRailways, width]);

  // 経路が決まったら、経路全体が見えるようにカメラを寄せる
  useEffect(() => {
    if (!route || route.legs.length === 0 || !width || !height) return;
    const coords = route.legs.flatMap((l) => l.stations.map((id) => stationById.get(id)!.coord));
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const fitted = new WebMercatorViewport({ width, height }).fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        // 左上の検索パネルを避ける（スマホでは上側）
        padding:
          width >= 768
            ? { top: 80, bottom: 80, left: 400, right: 100 }
            : { top: Math.min(height * 0.48, 400), bottom: Math.min(height * 0.3, 260), left: 40, right: 40 },
        maxZoom: 13,
      },
    );
    setViewState((v) => ({
      ...v,
      longitude: fitted.longitude,
      // 傾けると手前が広がるので、少し奥に寄せる
      latitude: fitted.latitude - 0.004 * 2 ** (11 - fitted.zoom),
      zoom: fitted.zoom - 0.5,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, [route, width, height]);

  // 深さの強調倍率はズーム 0.25 刻みで変える（毎フレーム作り直さないように）
  const zoomStep = Math.round(viewState.zoom * 4) / 4;
  const viewportSize = Math.min(width, height) || 900;
  const pitchStep = Math.round(viewState.pitch ?? 0);
  const scale = useMemo(() => depthScale(zoomStep, viewportSize, pitchStep), [zoomStep, viewportSize, pitchStep]);
  const layers = useMemo(
    () => buildLayers({ route, endpoints, stationColors, focusRailways, onPick, onPickRailway, scale }),
    [route, endpoints, stationColors, focusRailways, onPick, onPickRailway, scale],
  );
  // シミュレーションの電車は駅名ラベルより手前に出すため、HTML で重ねる（位置は線路の高さで投影）
  const trainMarkers = useMemo(() => {
    if (!width || !height || trains.length === 0) return [];
    const viewport = new WebMercatorViewport({ ...viewState, width, height });
    return trains.map((t) => {
      const [x, y] = viewport.project([t.coord[0], t.coord[1], elevationOf(t.depth, scale)]);
      return { ...t, x: x!, y: y! };
    });
  }, [trains, viewState, width, height, scale]);
  const endpointIds = useMemo(() => new Set(endpoints.map((p) => p.id)), [endpoints]);

  const labels = useMemo(() => {
    if (!width || !height) return [];
    const viewport = new WebMercatorViewport({ ...viewState, width, height });
    // 番号を出す路線: 強調中の路線と、経路で通る路線
    const codeRailways = new Set([...focusRailways, ...(route?.legs.map((l) => l.railway) ?? [])]);
    const routePlaces = new Set(
      route?.legs
        .flatMap((l) => [l.stations[0]!, l.stations[l.stations.length - 1]!])
        .map((id) => placeByStation.get(id)!.id),
    );
    // ズームが小さいうちは乗換の多い駅だけにする
    const minLines = viewState.zoom < 10.3 ? 3 : viewState.zoom < 11.3 ? 2 : 1;
    const candidates: LabelCandidate[] = [];
    for (const p of network.places) {
      // ラベルは地面の高さに置く（地下の駅とは立坑でつながる）
      const [x, y] = viewport.project([p.coord[0], p.coord[1], 0]);
      let priority = p.lines;
      const onFocus =
        focusRailways.length > 0 && p.stations.some((id) => focusRailways.includes(stationById.get(id)!.railway));
      if (onFocus) priority += 50;
      if (routePlaces.has(p.id)) priority += 100;
      const pinned = endpointIds.has(p.id);
      if (pinned) priority += 200;
      if (priority < minLines) continue;
      const time = placeTimes?.get(p.id);
      const dim = focusRailways.length > 0 && !onFocus && !pinned;
      const codes = p.stations
        .map((id) => stationById.get(id)!)
        .filter((s) => s.code && codeRailways.has(s.railway))
        .map((s) => ({ code: s.code!, color: railwayById.get(s.railway)!.color }))
        .filter((c, i, all) => all.findIndex((d) => d.code === c.code) === i)
        .slice(0, 3);
      candidates.push({ id: p.id, ja: p.ja, en: p.en.toUpperCase(), time, codes, x: x!, y: y!, priority, pinned, dim });
    }
    const max = Math.round((width * height) / 22000);
    return placeLabels(candidates, width, height, max);
  }, [viewState, width, height, route, endpointIds, placeTimes, focusRailways]);

  // 強調中の路線の端に路線記号（"JK" など）を出す。画面で右にある方の端に置く
  const lineBadges = useMemo(() => {
    if (!width || !height || focusRailways.length === 0) return [];
    const viewport = new WebMercatorViewport({ ...viewState, width, height });
    return focusRailways.flatMap((rid) => {
      const r = railwayById.get(rid);
      const sym = railwaySymbol(rid);
      if (!r || !sym) return [];
      const ends = [r.stations[0]!, r.stations[r.stations.length - 1]!].map((id) => {
        const c = stationById.get(id)!.coord;
        const [x, y] = viewport.project([c[0], c[1], 0]);
        return { x: x!, y: y! };
      });
      const end = ends[0]!.x > ends[1]!.x ? ends[0]! : ends[1]!;
      if (end.x < 0 || end.y < 0 || end.x > width || end.y > height) return [];
      return [{ id: rid, sym, color: r.color, x: end.x, y: end.y }];
    });
  }, [viewState, width, height, focusRailways]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ background: BACKGROUND }}>
      <DeckGL
        views={VIEW}
        viewState={viewState}
        onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
        controller={{ dragRotate: true, touchRotate: true, inertia: 300 }}
        layers={layers}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      <div className="pointer-events-none absolute inset-0">
        {labels.map((l) => {
          const active = endpointIds.has(l.id);
          return (
            // 駅名ラベルをクリックしても、駅の点と同じように駅を選べる
            <button
              type="button"
              key={l.id}
              aria-label={`${l.ja}駅を選ぶ`}
              className={`station-label pointer-events-auto absolute flex cursor-pointer items-center justify-center gap-1 rounded-lg px-1.5 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-50'} ${l.dim ? 'opacity-40 hover:opacity-80' : ''}`}
              style={{ left: l.left, top: l.top, width: l.width, height: l.height }}
              onClick={() => {
                const place = placeById.get(l.id);
                if (place) onPick(place);
              }}
            >
              {l.codes?.map((c) => (
                <StationCode key={c.code} code={c.code} color={c.color} />
              ))}
              <span className="flex min-w-0 flex-1 flex-col items-center">
                <span className="text-[15px] leading-tight font-bold">
                  {l.ja}
                  {l.time && (
                    <span className={`ml-1.5 tabular-nums ${active ? 'text-sky-300' : 'text-[#1c5cab]'}`}>
                      {l.time}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] leading-tight font-semibold tracking-[0.12em] ${active ? 'text-slate-300' : 'text-slate-400'}`}
                >
                  {l.en}
                </span>
              </span>
            </button>
          );
        })}
        {lineBadges.map((b) => (
          <div
            key={b.id}
            className="station-label absolute flex h-9 w-9 items-center justify-center rounded-lg bg-white"
            style={{ left: b.x + 12, top: b.y - 18 }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md border-[3px] bg-white text-[11px] font-black text-slate-900"
              style={{ borderColor: b.color }}
            >
              {b.sym}
            </span>
          </div>
        ))}
        {trainMarkers.map((t) => (
          <img
            key={t.id}
            src={t.icon}
            alt=""
            width={44}
            height={44}
            className="absolute drop-shadow-md"
            style={{ left: t.x - 22, top: t.y - 24 }}
          />
        ))}
      </div>
    </div>
  );
}
