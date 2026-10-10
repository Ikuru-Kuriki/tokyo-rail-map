import { LineLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { network, placeByStation, railwayById, stationById } from '../data';
import type { Route } from '../domain/route';
import type { Place, Railway, Station } from '../domain/types';
import { gridFrame, gridLines } from './grid';
import { interchangeLinks } from './interchange';
import { BACKGROUND, DOT_LIFT_PX, elevationOf, hexToRgb, type DepthScale } from './style';

type Position3 = [number, number, number];

interface PathDatum {
  id: string;
  path: Position3[];
  color: [number, number, number];
}

/** 地下の駅から地面までの縦線（立坑）。深さが一目で分かるように */
const shafts = network.stations.filter((s) => s.depth > 0);
/** 同じ駅で路線ごとに位置がずれている駅を、地面の上でつなぐ線（place ごと） */
const INTERCHANGES: { place: string; path: [number, number][] }[] = network.places.flatMap((p) =>
  interchangeLinks(p.stations.map((id) => stationById.get(id)!.coord)).map(([a, b]) => ({
    place: p.id,
    path: [a, b],
  })),
);
const GRID = gridLines();
const FRAME = gridFrame();
const GROUND = [FRAME.map(([lon, lat]) => [lon, lat, 0] as Position3)];
const [bgR, bgG, bgB] = hexToRgb(BACKGROUND);

const MUTED: [number, number, number] = [214, 211, 205];

/** 路線の色をグレースケールにして、地面の色に寄せる（強調していない路線用） */
export function greyOf([r, g, b]: [number, number, number]): [number, number, number] {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const v = Math.round(l * 0.45 + 228 * 0.55);
  return [v, v, v];
}
const UNREACHABLE: [number, number, number] = [201, 197, 189];

export interface TrainMarker {
  id: string;
  coord: [number, number];
  depth: number;
  icon: string;
}

export interface LayerState {
  route: Route | null;
  /** 出発・到着など、黒い点で示す駅 */
  endpoints: Place[];
  /** 駅ごとの色（終電マップ）。指定がない駅は「帰れない」色 */
  stationColors: Map<string, [number, number, number]> | null;
  /** 強調する路線（複数可）。ほかの路線はグレースケールになる */
  focusRailways: string[];
  onPick: (place: Place) => void;
  /** 線をクリックしたとき（x, y は画面上の位置） */
  onPickRailway?: (railwayId: string, x: number, y: number) => void;
  /** 深さの強調倍率など（ズームで変わる。style.ts の depthScale） */
  scale: DepthScale;
}

/*
 * 描く順番と深度テスト:
 *   1. 路線・立坑・駅（深度テストあり）
 *   2. 地面（半透明・深度を書かない）… 地面より下にあるものだけが地面越しに薄く見える
 *   3. 方眼の線
 *   4. 経路と、その駅（常に手前）
 */
export function buildLayers({
  route,
  endpoints: ends,
  stationColors,
  focusRailways,
  onPick,
  onPickRailway,
  scale,
}: LayerState): Layer[] {
  const z = (s: Station) => elevationOf(s.depth, scale);
  const position = (id: string): Position3 => {
    const s = stationById.get(id)!;
    return [s.coord[0], s.coord[1], z(s)];
  };
  const groundZ = elevationOf(0, scale);
  const dotPosition = (s: Station): Position3 => [s.coord[0], s.coord[1], z(s) + DOT_LIFT_PX * scale.metersPerPixel];
  const railwayPaths: PathDatum[] = network.railways.map((r: Railway) => ({
    id: r.id,
    path: r.stations.map(position),
    color: hexToRgb(r.color),
  }));

  const routeStations = new Set(route?.legs.flatMap((l) => l.stations));
  const highlighting = route !== null || stationColors !== null;
  const endpoints = new Set(ends.flatMap((p) => p.stations));
  const coloring = stationColors !== null && route === null;
  const focus = network.stations.filter((s) => endpoints.has(s.id) || routeStations.has(s.id));
  /** 強調中の路線以外の駅は薄くする */
  const focusSet = new Set(focusRailways);
  const focusing = focusSet.size > 0;
  const dimmed = (s: Station) => focusing && !focusSet.has(s.railway);

  const routePaths: PathDatum[] = (route?.legs ?? []).map((l, i) => ({
    id: `${l.railway}#${i}`,
    path: l.stations.map(position),
    color: hexToRgb(network.railways.find((r) => r.id === l.railway)!.color),
  }));

  const onClick = (info: PickingInfo<Station>) => {
    const place = info.object ? placeByStation.get(info.object.id) : undefined;
    if (place) onPick(place);
    return true;
  };

  const radius = (s: Station) => {
    if (endpoints.has(s.id)) return 8;
    if (routeStations.has(s.id)) return 5.5;
    if (coloring) return stationColors.has(s.id) ? 5 : 2.6;
    // 路線を強調中は、ほかの路線の駅の点は出さない
    if (dimmed(s)) return 0;
    return highlighting ? 2.6 : 4;
  };
  const fill = (s: Station): [number, number, number, number] => {
    if (endpoints.has(s.id)) return [30, 30, 30, 255];
    if (coloring) return [...(stationColors.get(s.id) ?? UNREACHABLE), 255];
    if (dimmed(s) && !routeStations.has(s.id)) return [255, 255, 255, 70];
    return [255, 255, 255, highlighting && !routeStations.has(s.id) ? 150 : 255];
  };
  // 色付きの点は地面色の細い縁で隣と分ける
  const stroke = (s: Station): [number, number, number, number] => {
    if (endpoints.has(s.id)) return [30, 30, 30, 230];
    if (coloring) return [255, 255, 255, 230];
    if (dimmed(s) && !routeStations.has(s.id)) return [30, 30, 30, 0];
    return [30, 30, 30, highlighting && !routeStations.has(s.id) ? 70 : 230];
  };
  const triggers = [route, ends, stationColors, focusRailways];

  return [
    new PathLayer<PathDatum>({
      id: 'railways',
      data: railwayPaths,
      getPath: (d) => d.path,
      // 路線を強調中はその路線だけ色を残し、ほかはグレースケールにする。
      // 経路を表示中は全路線を薄くし、経路の区間だけを上に重ねて色を付ける
      getColor: (d) => {
        if (focusSet.has(d.id)) return [...d.color, 255];
        // 参考の見た目に合わせ、ほかの路線は薄く透けるグレーにする
        if (focusing) return [...greyOf(d.color), 80];
        return highlighting ? [...MUTED, 255] : [...d.color, 255];
      },
      getWidth: (d) => (focusSet.has(d.id) ? 8 : focusing ? 2.5 : 5),
      widthUnits: 'pixels',
      widthMinPixels: 2,
      jointRounded: true,
      capRounded: true,
      billboard: true,
      pickable: onPickRailway !== undefined,
      onClick: (info: PickingInfo<PathDatum>) => {
        if (info.object) onPickRailway?.(info.object.id, info.x, info.y);
        return true;
      },
      updateTriggers: { getColor: [highlighting, focusRailways], getWidth: focusRailways },
    }),
    new LineLayer<Station>({
      id: 'shafts',
      // 路線を強調中は、その路線の立坑だけを出す
      data: focusing ? shafts.filter((s) => focusSet.has(s.railway)) : shafts,
      getSourcePosition: (s) => [s.coord[0], s.coord[1], z(s)],
      getTargetPosition: (s) => [s.coord[0], s.coord[1], 0],
      getColor: [120, 112, 100, highlighting ? 60 : 130],
      getWidth: 1,
      updateTriggers: { getColor: [highlighting], getSourcePosition: scale, getTargetPosition: scale },
    }),
    new ScatterplotLayer<Station>({
      id: 'stations',
      data: network.stations,
      pickable: true,
      getPosition: dotPosition,
      getRadius: radius,
      radiusUnits: 'pixels',
      billboard: true,
      stroked: true,
      getFillColor: fill,
      getLineColor: stroke,
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
      updateTriggers: {
        getPosition: scale,
        getRadius: triggers,
        getFillColor: triggers,
        getLineColor: triggers,
      },
      onClick,
    }),
    new SolidPolygonLayer({
      id: 'ground',
      data: GROUND,
      getPolygon: (d) => d,
      getFillColor: [bgR, bgG, bgB, 95],
      parameters: { depthWriteEnabled: false },
    }),
    new LineLayer({
      id: 'grid',
      data: GRID,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getColor: (d) => (d.major ? [205, 200, 192, 255] : [226, 222, 214, 255]),
      getWidth: (d) => (d.major ? 1.2 : 0.8),
      parameters: { depthWriteEnabled: false },
    }),
    new PathLayer({
      id: 'frame',
      data: [FRAME],
      getPath: (d) => d,
      getColor: [232, 150, 130, 160],
      getWidth: 1.5,
      widthUnits: 'pixels',
      parameters: { depthWriteEnabled: false },
    }),
    // 乗換駅のつながり（白い帯に濃い縁）。地面の高さに描き、地下のホームとは立坑でつながる
    new PathLayer<{ place: string; path: [number, number][] }>({
      id: 'interchange-outline',
      data: INTERCHANGES,
      getPath: (d) => d.path.map(([lon, lat]) => [lon, lat, groundZ] as Position3),
      getColor: [70, 64, 56, highlighting || focusing ? 90 : 200],
      getWidth: 9,
      widthUnits: 'pixels',
      capRounded: true,
      billboard: true,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getPath: scale, getColor: [highlighting, focusing] },
    }),
    new PathLayer<{ place: string; path: [number, number][] }>({
      id: 'interchange',
      data: INTERCHANGES,
      getPath: (d) => d.path.map(([lon, lat]) => [lon, lat, groundZ] as Position3),
      getColor: [255, 255, 255, highlighting || focusing ? 150 : 255],
      getWidth: 6,
      widthUnits: 'pixels',
      capRounded: true,
      billboard: true,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getPath: scale, getColor: [highlighting, focusing] },
    }),
    // 強調中の路線の立坑は路線の色で、地面より手前に描く（地下の路線と地上の駅名のつながりが分かるように）
    new LineLayer<Station>({
      id: 'focus-shafts',
      data: focusing ? shafts.filter((s) => focusSet.has(s.railway)) : [],
      getSourcePosition: (s) => [s.coord[0], s.coord[1], z(s)],
      getTargetPosition: (s) => [s.coord[0], s.coord[1], 0],
      getColor: (s) => [...hexToRgb(railwayById.get(s.railway)!.color), 170],
      getWidth: 1.5,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getSourcePosition: scale, getTargetPosition: scale },
    }),
    new PathLayer<PathDatum>({
      id: 'route',
      data: routePaths,
      getPath: (d) => d.path,
      getColor: (d) => [...d.color, 255],
      getWidth: 9,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      billboard: true,
      parameters: { depthCompare: 'always' },
    }),
    new ScatterplotLayer<Station>({
      id: 'focus-stations',
      data: focus,
      pickable: true,
      getPosition: dotPosition,
      getRadius: radius,
      radiusUnits: 'pixels',
      billboard: true,
      stroked: true,
      getFillColor: fill,
      getLineColor: stroke,
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
      parameters: { depthCompare: 'always' },
      updateTriggers: {
        getPosition: scale,
        getRadius: triggers,
        getFillColor: triggers,
        getLineColor: triggers,
      },
      onClick,
    }),
  ];
}

/** カーソルを乗せている駅・路線 */
export interface HoverTarget {
  stationId?: string;
  railwayId?: string;
}

/**
 * カーソルを乗せている路線・駅を少し目立たせるレイヤー（ほかのレイヤーの上に重ねる）。
 * 路線: 白い縁取りをつけて少し太く。駅: 路線色の輪で少し大きく
 */
export function buildHoverLayers(target: HoverTarget | null, scale: DepthScale): Layer[] {
  if (!target) return [];
  const z = (s: Station) => elevationOf(s.depth, scale);
  if (target.railwayId) {
    const r = network.railways.find((x) => x.id === target.railwayId);
    if (!r) return [];
    const path = r.stations.map((id) => {
      const s = stationById.get(id)!;
      return [s.coord[0], s.coord[1], z(s)] as Position3;
    });
    const color = hexToRgb(r.color);
    const common = {
      data: [path],
      getPath: (d: Position3[]) => d,
      widthUnits: 'pixels' as const,
      jointRounded: true,
      capRounded: true,
      billboard: true,
      parameters: { depthCompare: 'always' as const },
    };
    return [
      new PathLayer<Position3[]>({ ...common, id: 'hover-casing', getColor: [255, 255, 255, 235], getWidth: 9.5 }),
      new PathLayer<Position3[]>({ ...common, id: 'hover-railway', getColor: [...color, 255], getWidth: 6.5 }),
    ];
  }
  if (target.stationId) {
    const s = stationById.get(target.stationId);
    if (!s) return [];
    const color = hexToRgb(network.railways.find((x) => x.id === s.railway)!.color);
    return [
      new ScatterplotLayer<Station>({
        id: 'hover-station',
        data: [s],
        getPosition: (d) => [d.coord[0], d.coord[1], z(d) + 2 * DOT_LIFT_PX * scale.metersPerPixel],
        getRadius: 8,
        radiusUnits: 'pixels',
        billboard: true,
        stroked: true,
        getFillColor: [255, 255, 255, 255],
        getLineColor: [...color, 255],
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        parameters: { depthCompare: 'always' },
      }),
    ];
  }
  return [];
}
