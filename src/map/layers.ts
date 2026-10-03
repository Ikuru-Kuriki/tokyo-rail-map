import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { network, placeByStation, stationById } from '../data';
import type { Route } from '../domain/route';
import type { Place, Railway } from '../domain/types';
import { gridFrame, gridLines } from './grid';
import { hexToRgb, LINE_ELEVATION, SHADOW_OFFSET } from './style';

type Position3 = [number, number, number];

interface PathDatum {
  id: string;
  path: Position3[];
  color: [number, number, number];
}

const lift = (id: string): Position3 => {
  const [lon, lat] = stationById.get(id)!.coord;
  return [lon, lat, LINE_ELEVATION];
};
const ground = (id: string): Position3 => {
  const [lon, lat] = stationById.get(id)!.coord;
  return [lon + SHADOW_OFFSET[0], lat + SHADOW_OFFSET[1], 0];
};

const railwayPaths: PathDatum[] = network.railways.map((r: Railway) => ({
  id: r.id,
  path: r.stations.map(lift),
  color: hexToRgb(r.color),
}));
const shadowPaths: PathDatum[] = network.railways.map((r) => ({
  id: r.id,
  path: r.stations.map(ground),
  color: [0, 0, 0],
}));
const GRID = gridLines();
const FRAME = gridFrame();

const MUTED: [number, number, number] = [214, 211, 205];

export interface LayerState {
  route: Route | null;
  /** 出発・到着など、黒い点で示す駅 */
  endpoints: Place[];
  /** 駅ごとの色（終電マップ）。指定がない駅は「帰れない」色 */
  stationColors: Map<string, [number, number, number]> | null;
  onPick: (place: Place) => void;
}

const UNREACHABLE: [number, number, number] = [201, 197, 189];

export function buildLayers({ route, endpoints: ends, stationColors, onPick }: LayerState): Layer[] {
  const routeStations = new Set(route?.legs.flatMap((l) => l.stations));
  const highlighting = route !== null || stationColors !== null;
  const endpoints = new Set(ends.flatMap((p) => p.stations));
  const coloring = stationColors !== null && route === null;

  const routePaths: PathDatum[] = (route?.legs ?? []).map((l, i) => ({
    id: `${l.railway}#${i}`,
    path: l.stations.map(lift),
    color: hexToRgb(network.railways.find((r) => r.id === l.railway)!.color),
  }));

  return [
    new LineLayer({
      id: 'grid',
      data: GRID,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getColor: (d) => (d.major ? [205, 200, 192, 255] : [226, 222, 214, 255]),
      getWidth: (d) => (d.major ? 1.2 : 0.8),
    }),
    new PathLayer({
      id: 'frame',
      data: [FRAME],
      getPath: (d) => d,
      getColor: [232, 150, 130, 160],
      getWidth: 1.5,
      widthUnits: 'pixels',
    }),
    new PathLayer<PathDatum>({
      id: 'shadows',
      data: shadowPaths,
      getPath: (d) => d.path,
      getColor: [60, 50, 40, highlighting ? 18 : 34],
      getWidth: 6,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      updateTriggers: { getColor: highlighting },
    }),
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
      parameters: { depthCompare: 'always' },
      updateTriggers: { getColor: [highlighting] },
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
    new ScatterplotLayer({
      id: 'stations',
      data: network.stations,
      pickable: true,
      getPosition: (s) => [s.coord[0], s.coord[1], LINE_ELEVATION],
      getRadius: (s) => {
        if (endpoints.has(s.id)) return 6;
        if (routeStations.has(s.id)) return 4;
        if (coloring) return stationColors.has(s.id) ? 3.6 : 1.8;
        return highlighting ? 1.6 : 2.6;
      },
      radiusUnits: 'pixels',
      stroked: true,
      getFillColor: (s) => {
        if (endpoints.has(s.id)) return [30, 30, 30, 255];
        if (coloring) return [...(stationColors.get(s.id) ?? UNREACHABLE), 255];
        return [255, 255, 255, highlighting && !routeStations.has(s.id) ? 160 : 255];
      },
      // 色付きの点は地面色の細い縁で隣と分ける
      getLineColor: (s) => {
        if (endpoints.has(s.id)) return [30, 30, 30, 230];
        if (coloring) return [255, 255, 255, 230];
        return [30, 30, 30, highlighting && !routeStations.has(s.id) ? 70 : 230];
      },
      getLineWidth: 1.2,
      lineWidthUnits: 'pixels',
      parameters: { depthCompare: 'always' },
      updateTriggers: {
        getRadius: [route, ends, stationColors],
        getFillColor: [route, ends, stationColors],
        getLineColor: [route, ends, stationColors],
      },
      onClick: (info) => {
        const place = info.object ? placeByStation.get(info.object.id) : undefined;
        if (place) onPick(place);
        return true;
      },
    }),
  ];
}
