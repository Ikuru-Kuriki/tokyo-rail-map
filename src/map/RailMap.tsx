import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import {
  FlyToInterpolator,
  MapView,
  WebMercatorViewport,
  type MapViewState,
} from '@deck.gl/core';
import { network, placeByStation, stationById } from '../data';
import type { Route } from '../domain/route';
import type { Place } from '../domain/types';
import { buildLayers } from './layers';
import { placeLabels, type LabelCandidate } from './labels';
import { sideViewFor } from './camera';
import { BACKGROUND, depthExaggeration } from './style';

const INITIAL_VIEW: MapViewState = {
  longitude: 139.7,
  latitude: 35.6,
  zoom: 9.7,
  pitch: 52,
  bearing: -8,
  minZoom: 7.5,
  maxZoom: 14,
  maxPitch: 85,
};

const VIEW = new MapView({ repeat: false });

interface Props {
  route: Route | null;
  /** 黒いラベル・点で示す駅（出発・到着、帰る駅など） */
  endpoints: Place[];
  /** 終電マップの駅の色 */
  stationColors?: Map<string, [number, number, number]> | null;
  /** ラベルに添える時刻（place ID → "0:12"） */
  placeTimes?: Map<string, string> | null;
  /** 強調する路線。ほかの路線はグレーになる */
  focusRailway?: string | null;
  onPick: (place: Place) => void;
  onPickRailway?: (railwayId: string) => void;
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
  focusRailway = null,
  onPick,
  onPickRailway,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);

  // 路線を強調したら、その路線を真横に近い角度から見る
  useEffect(() => {
    if (!focusRailway || !width) return;
    const railway = network.railways.find((r) => r.id === focusRailway);
    if (!railway) return;
    const coords = railway.stations.map((id) => stationById.get(id)!.coord);
    const view = sideViewFor(coords, width >= 768 ? width - 360 : width - 32);
    setViewState((v) => ({ ...v, ...view, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator() }));
  }, [focusRailway, width]);

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
            : { top: 250, bottom: Math.min(height * 0.35, 300), left: 30, right: 30 },
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
  const exaggeration = useMemo(() => depthExaggeration(zoomStep, viewportSize), [zoomStep, viewportSize]);
  const layers = useMemo(
    () => buildLayers({ route, endpoints, stationColors, focusRailway, onPick, onPickRailway, exaggeration }),
    [route, endpoints, stationColors, focusRailway, onPick, onPickRailway, exaggeration],
  );
  const endpointIds = useMemo(() => new Set(endpoints.map((p) => p.id)), [endpoints]);

  const labels = useMemo(() => {
    if (!width || !height) return [];
    const viewport = new WebMercatorViewport({ ...viewState, width, height });
    const routePlaces = new Set(
      route?.legs.flatMap((l) => [l.stations[0]!, l.stations[l.stations.length - 1]!]).map((id) => placeByStation.get(id)!.id),
    );
    // ズームが小さいうちは乗換の多い駅だけにする
    const minLines = viewState.zoom < 10.3 ? 3 : viewState.zoom < 11.3 ? 2 : 1;
    const candidates: LabelCandidate[] = [];
    for (const p of network.places) {
      // ラベルは地面の高さに置く（地下の駅とは立坑でつながる）
      const [x, y] = viewport.project([p.coord[0], p.coord[1], 0]);
      let priority = p.lines;
      const onFocus = focusRailway !== null && p.stations.some((id) => stationById.get(id)!.railway === focusRailway);
      if (onFocus) priority += 50;
      if (routePlaces.has(p.id)) priority += 100;
      const pinned = endpointIds.has(p.id);
      if (pinned) priority += 200;
      if (priority < minLines) continue;
      const time = placeTimes?.get(p.id);
      const dim = focusRailway !== null && !onFocus && !pinned;
      candidates.push({ id: p.id, ja: p.ja, en: p.en.toUpperCase(), time, x: x!, y: y!, priority, pinned, dim });
    }
    const max = Math.round((width * height) / 22000);
    return placeLabels(candidates, width, height, max);
  }, [viewState, width, height, route, endpointIds, placeTimes, focusRailway]);

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
            <div
              key={l.id}
              className={`station-label absolute flex flex-col items-center justify-center rounded-lg ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'} ${l.dim ? 'opacity-40' : ''}`}
              style={{ left: l.left, top: l.top, width: l.width, height: l.height }}
            >
              <span className="text-[15px] leading-tight font-bold">
                {l.ja}
                {l.time && (
                  <span className={`ml-1.5 tabular-nums ${active ? 'text-sky-300' : 'text-[#1c5cab]'}`}>{l.time}</span>
                )}
              </span>
              <span
                className={`text-[10px] leading-tight font-semibold tracking-[0.12em] ${active ? 'text-slate-300' : 'text-slate-400'}`}
              >
                {l.en}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
