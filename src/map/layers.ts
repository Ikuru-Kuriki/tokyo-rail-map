import { LineLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { network, placeByStation, stationById } from '../data';
import type { Route } from '../domain/route';
import type { Place, Railway, Station } from '../domain/types';
import { gridFrame, gridLines } from './grid';
import { BACKGROUND, DOT_LIFT, elevationOf, hexToRgb } from './style';

type Position3 = [number, number, number];

interface PathDatum {
  id: string;
  path: Position3[];
  color: [number, number, number];
}

/** 地下の駅から地面までの縦線（立坑）。深さが一目で分かるように */
const shafts = network.stations.filter((s) => s.depth > 0);
const GRID = gridLines();
const FRAME = gridFrame();
const GROUND = [FRAME.map(([lon, lat]) => [lon, lat, 0] as Position3)];
const [bgR, bgG, bgB] = hexToRgb(BACKGROUND);

const MUTED: [number, number, number] = [214, 211, 205];
const UNREACHABLE: [number, number, number] = [201, 197, 189];

export interface LayerState {
  route: Route | null;
  /** 出発・到着など、黒い点で示す駅 */
  endpoints: Place[];
  /** 駅ごとの色（終電マップ）。指定がない駅は「帰れない」色 */
  stationColors: Map<string, [number, number, number]> | null;
  onPick: (place: Place) => void;
  /** 深さの強調倍率（ズームで変わる。style.ts の depthExaggeration） */
  exaggeration: number;
}

/*
 * 描く順番と深度テスト:
 *   1. 路線・立坑・駅（深度テストあり）
 *   2. 地面（半透明・深度を書かない）… 地面より下にあるものだけが地面越しに薄く見える
 *   3. 方眼の線
 *   4. 経路と、その駅（常に手前）
 */
export function buildLayers({ route, endpoints: ends, stationColors, onPick, exaggeration }: LayerState): Layer[] {
  const z = (s: Station) => elevationOf(s.depth, exaggeration);
  const position = (id: string): Position3 => {
    const s = stationById.get(id)!;
    return [s.coord[0], s.coord[1], z(s)];
  };
  const dotPosition = (s: Station): Position3 => [s.coord[0], s.coord[1], z(s) + DOT_LIFT];
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
    if (endpoints.has(s.id)) return 6;
    if (routeStations.has(s.id)) return 4;
    if (coloring) return stationColors.has(s.id) ? 3.6 : 1.8;
    return highlighting ? 1.6 : 2.6;
  };
  const fill = (s: Station): [number, number, number, number] => {
    if (endpoints.has(s.id)) return [30, 30, 30, 255];
    if (coloring) return [...(stationColors.get(s.id) ?? UNREACHABLE), 255];
    return [255, 255, 255, highlighting && !routeStations.has(s.id) ? 160 : 255];
  };
  // 色付きの点は地面色の細い縁で隣と分ける
  const stroke = (s: Station): [number, number, number, number] => {
    if (endpoints.has(s.id)) return [30, 30, 30, 230];
    if (coloring) return [255, 255, 255, 230];
    return [30, 30, 30, highlighting && !routeStations.has(s.id) ? 70 : 230];
  };
  const triggers = [route, ends, stationColors];

  return [
    new PathLayer<PathDatum>({
      id: 'railways',
      data: railwayPaths,
      getPath: (d) => d.path,
      // 経路を表示中は全路線を薄くし、経路の区間だけを上に重ねて色を付ける
      getColor: (d) => (highlighting ? [...MUTED, 255] : [...d.color, 255]),
      getWidth: 5,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      jointRounded: true,
      capRounded: true,
      updateTriggers: { getColor: [highlighting] },
    }),
    new LineLayer<Station>({
      id: 'shafts',
      data: shafts,
      getSourcePosition: (s) => [s.coord[0], s.coord[1], z(s)],
      getTargetPosition: (s) => [s.coord[0], s.coord[1], 0],
      getColor: [120, 112, 100, highlighting ? 60 : 130],
      getWidth: 1,
      updateTriggers: { getColor: [highlighting], getSourcePosition: exaggeration },
    }),
    new ScatterplotLayer<Station>({
      id: 'stations',
      data: network.stations,
      pickable: true,
      getPosition: dotPosition,
      getRadius: radius,
      radiusUnits: 'pixels',
      stroked: true,
      getFillColor: fill,
      getLineColor: stroke,
      getLineWidth: 1.2,
      lineWidthUnits: 'pixels',
      updateTriggers: {
        getPosition: exaggeration,
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
    new PathLayer<PathDatum>({
      id: 'route',
      data: routePaths,
      getPath: (d) => d.path,
      getColor: (d) => [...d.color, 255],
      getWidth: 9,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      parameters: { depthCompare: 'always' },
    }),
    new ScatterplotLayer<Station>({
      id: 'focus-stations',
      data: focus,
      pickable: true,
      getPosition: dotPosition,
      getRadius: radius,
      radiusUnits: 'pixels',
      stroked: true,
      getFillColor: fill,
      getLineColor: stroke,
      getLineWidth: 1.2,
      lineWidthUnits: 'pixels',
      parameters: { depthCompare: 'always' },
      updateTriggers: {
        getPosition: exaggeration,
        getRadius: triggers,
        getFillColor: triggers,
        getLineColor: triggers,
      },
      onClick,
    }),
  ];
}
