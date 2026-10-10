import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import { FlyToInterpolator, MapView, WebMercatorViewport, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { network, placeById, placeByStation, railwayById, railwaySymbol, stationById } from '../data';
import { StationCode } from '../components/StationCode';
import type { Route } from '../domain/route';
import type { Place, Station } from '../domain/types';
import { buildHoverLayers, buildLayers, type HoverTarget, type TrainMarker } from './layers';
import { minLabelPriority, placeLabels, type LabelCandidate, type LabelDensity } from './labels';
import { MapControls, TILTED_PITCH } from './MapControls';
import { COARSE_QUERY, DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { sideViewFor } from './camera';
import { BACKGROUND, depthScale, elevationOf } from './style';

const INITIAL_VIEW: MapViewState = {
  longitude: 139.7,
  latitude: 35.6,
  zoom: 9.7,
  pitch: TILTED_PITCH,
  bearing: -8,
  minZoom: 7.5,
  maxZoom: 17,
  maxPitch: 85,
};

const VIEW = new MapView({ repeat: false });
const NO_RAILWAYS: string[] = [];
const NO_TRAINS: TrainMarker[] = [];
/** マウスで操作しているとき（スマホでは出さない） */
const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

const DENSITY_KEY = 'tokyo-rail-map:label-density';

function loadDensity(compact: boolean): LabelDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === 'normal' || v === 'major' || v === 'none') return v;
  } catch {
    // 保存できない環境では既定のまま
  }
  // スマホは画面が狭いので、主要駅だけにする
  return compact ? 'major' : 'normal';
}

interface Hover {
  x: number;
  y: number;
  text: string;
  /** 路線のときの色 */
  color?: string;
  /** 地図上で目立たせる駅・路線 */
  target: HoverTarget;
}

/** カーソルの下にあるものから、表示する文を作る。駅でも路線でもなければ null */
function hoverOf(info: PickingInfo): Hover | null {
  if (!canHover || !info.object || !info.layer) return null;
  if (info.layer.id === 'stations' || info.layer.id === 'focus-stations') {
    const s = info.object as Station;
    const code = s.code ? `${s.code} ` : '';
    return {
      x: info.x,
      y: info.y,
      text: `${code}${s.ja}（${railwayById.get(s.railway)!.ja}）`,
      target: { stationId: s.id },
    };
  }
  if (info.layer.id === 'railways') {
    const r = railwayById.get((info.object as { id: string }).id);
    return r
      ? { x: info.x, y: info.y, text: `${r.ja}（クリックで強調）`, color: r.color, target: { railwayId: r.id } }
      : null;
  }
  return null;
}

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
  /** 画面の下を覆っているものの高さ（スマホのシート）。経路に寄せるときと、操作ボタンの位置に使う */
  bottomInset?: number;
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
  bottomInset = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const deck = useRef<DeckGLRef>(null);
  const { width, height } = useSize(ref);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const [hover, setHover] = useState<Hover | null>(null);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const coarse = useMediaQuery(COARSE_QUERY);
  /** スマホでは駅名ラベルを小さくする（英字を出さない） */
  const compact = !desktop;
  const [density, setDensity] = useState<LabelDensity>(() => loadDensity(compact));
  const changeDensity = (d: LabelDensity) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      // 保存できなくても表示は切り替える
    }
  };
  /** 指で線をタップしたときに出す路線のカード（すぐには強調しない） */
  const [railCard, setRailCard] = useState<string | null>(null);
  useEffect(() => {
    if (!railCard) return;
    const t = setTimeout(() => setRailCard(null), 4000);
    return () => clearTimeout(t);
  }, [railCard]);

  const fly = (patch: Partial<MapViewState>) =>
    setViewState((v) => ({ ...v, ...patch, transitionDuration: 400, transitionInterpolator: new FlyToInterpolator() }));

  // 線をクリック・タップしたとき。指では近くの駅を優先し、駅が無ければ路線のカードを出す
  const pickRailway = useCallback(
    (id: string, x: number, y: number) => {
      if (!coarse) {
        onPickRailway?.(id);
        return;
      }
      const near = deck.current?.pickObject({ x, y, radius: 12, layerIds: ['focus-stations', 'stations'] });
      const station = near?.object as Station | undefined;
      const place = station ? placeByStation.get(station.id) : undefined;
      if (place) {
        onPick(place);
        return;
      }
      setRailCard(id);
    },
    [coarse, onPick, onPickRailway],
  );

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
            ? { top: 80, bottom: 200, left: 440, right: 100 }
            : { top: 70, bottom: Math.min(bottomInset, height * 0.6) + 40, left: 40, right: 64 },
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
    // シートの高さが変わるたびには寄せ直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, width, height]);

  // 深さの強調倍率はズーム 0.25 刻みで変える（毎フレーム作り直さないように）
  const zoomStep = Math.round(viewState.zoom * 4) / 4;
  const viewportSize = Math.min(width, height) || 900;
  const pitchStep = Math.round(viewState.pitch ?? 0);
  const scale = useMemo(() => depthScale(zoomStep, viewportSize, pitchStep), [zoomStep, viewportSize, pitchStep]);
  const layers = useMemo(
    () =>
      buildLayers({
        route,
        endpoints,
        stationColors,
        focusRailways,
        onPick,
        onPickRailway: onPickRailway ? pickRailway : undefined,
        scale,
      }),
    [route, endpoints, stationColors, focusRailways, onPick, onPickRailway, pickRailway, scale],
  );
  // カーソルを乗せた駅・路線の強調。同じものの上で動かしている間は作り直さない
  const hoverKey = hover ? `${hover.target.stationId ?? ''}|${hover.target.railwayId ?? ''}` : '';
  const hoverLayers = useMemo(
    () => (hover ? buildHoverLayers(hover.target, scale) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverKey, scale],
  );
  const allLayers = useMemo(() => [...layers, ...hoverLayers], [layers, hoverLayers]);
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
    // ズームが小さいうちは乗換の多い駅だけにする。駅名の出し方（標準・主要駅・なし）でも絞る
    const minLines = minLabelPriority(viewState.zoom, density);
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
        .slice(0, compact ? 2 : 3);
      candidates.push({ id: p.id, ja: p.ja, en: p.en.toUpperCase(), time, codes, x: x!, y: y!, priority, pinned, dim });
    }
    const max = Math.round((width * height) / (compact ? 30000 : 22000));
    // 右上の駅名ボタン・右下の操作ボタン・下のシートの上には置かない
    const blocked = [
      { left: width - 160, top: 0, width: 160, height: 64 },
      { left: width - 68, top: height - bottomInset - 220, width: 68, height: 220 },
      { left: 0, top: height - bottomInset, width, height: bottomInset },
    ];
    return placeLabels(candidates, width, height, max, compact, blocked);
  }, [viewState, width, height, route, endpointIds, placeTimes, focusRailways, density, compact, bottomInset]);

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
        ref={deck}
        views={VIEW}
        viewState={viewState}
        onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
        // 指では 2 本指の回転を切る（ピンチで拡大しようとすると回ってしまうため）。回転・傾きは右下のボタンで
        controller={{ dragRotate: true, touchRotate: !coarse, inertia: 300 }}
        layers={allLayers}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        // 駅の点・線の近くでもクリックできるように（指では広めに）
        pickingRadius={coarse ? 16 : 6}
        // 名前の出ていない駅でも、カーソルを乗せると駅名と路線が分かる（表示は下の HTML で自前で出す）
        onHover={(info) => setHover(hoverOf(info))}
        onDragStart={() => {
          setHover(null);
          setRailCard(null);
        }}
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
              onMouseEnter={() => setHover(null)}
              onClick={() => {
                const place = placeById.get(l.id);
                if (place) onPick(place);
              }}
            >
              {l.codes?.map((c) => (
                <StationCode key={c.code} code={c.code} color={c.color} />
              ))}
              <span className="flex min-w-0 flex-1 flex-col items-center">
                <span className={`${compact ? 'text-[13px]' : 'text-[15px]'} leading-tight font-bold`}>
                  {l.ja}
                  {l.time && (
                    <span className={`ml-1.5 tabular-nums ${active ? 'text-sky-300' : 'text-[#1c5cab]'}`}>
                      {l.time}
                    </span>
                  )}
                </span>
                {!compact && (
                  <span
                    className={`text-[10px] leading-tight font-semibold tracking-[0.12em] ${active ? 'text-slate-300' : 'text-slate-400'}`}
                  >
                    {l.en}
                  </span>
                )}
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
        {hover && (
          <div
            role="tooltip"
            className="absolute z-10 flex items-center gap-1.5 rounded-md bg-slate-900/95 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg"
            // カーソルの右下に出し、画面の右端・下端でははみ出さないよう左上に回す
            style={{
              left: hover.x + 14,
              top: hover.y + 16,
              transform: `translate(${hover.x > width - 240 ? 'calc(-100% - 28px)' : '0'}, ${hover.y > height - 60 ? 'calc(-100% - 32px)' : '0'})`,
            }}
          >
            {hover.color && (
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                style={{ background: hover.color }}
                aria-hidden="true"
              />
            )}
            {hover.text}
          </div>
        )}
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
      <MapControls
        pitch={viewState.pitch ?? 0}
        bearing={viewState.bearing ?? 0}
        // PC では右下の出典の文字の上に置く
        bottom={bottomInset || 16}
        density={density}
        onDensity={changeDensity}
        onZoom={(d) =>
          fly({
            zoom: Math.min(INITIAL_VIEW.maxZoom!, Math.max(INITIAL_VIEW.minZoom!, viewState.zoom + d)),
          })
        }
        onPitch={(pitch) => fly({ pitch })}
        onResetBearing={() => fly({ bearing: 0 })}
      />
      {railCard && (
        <RailwayCard
          id={railCard}
          bottom={bottomInset}
          focused={focusRailways.includes(railCard)}
          onToggle={() => {
            onPickRailway?.(railCard);
            setRailCard(null);
          }}
          onClose={() => setRailCard(null)}
        />
      )}
    </div>
  );
}

/** 指で線をタップしたときのカード: 路線名と「強調する」ボタン */
function RailwayCard({
  id,
  bottom,
  focused,
  onToggle,
  onClose,
}: {
  id: string;
  bottom: number;
  focused: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const r = railwayById.get(id);
  if (!r) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-16"
      style={{ bottom: bottom + 12 }}
    >
      <div className="panel pointer-events-auto flex items-center gap-2 rounded-xl bg-white/95 py-1.5 pr-1.5 pl-3 text-sm font-semibold backdrop-blur">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
        <span className="truncate">{r.ja}</span>
        <button type="button" className="btn shrink-0 !py-2 text-xs" onClick={onToggle}>
          {focused ? '強調を外す' : '強調する'}
        </button>
        <button type="button" className="h-9 w-9 shrink-0 text-slate-400" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}
