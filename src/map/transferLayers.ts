import { LineLayer, PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { placeByStation, railwayById, stationById } from '../data';
import {
  depthText,
  insideConvex,
  platformEnds,
  sideBearing,
  splitRuns,
  squareAround,
  toLonLat,
  transferAxis,
  type Ground,
} from '../domain/ground';
import type { Place, Station } from '../domain/types';
import { elevationOf, hexToRgb, type DepthScale } from './style';

type Position3 = [number, number, number];

/**
 * 駅のまわりの立体に描くもの。
 *   乗換を見る: 乗り換える 2 つの駅を太く描き、間を歩く線で結ぶ。2 つのホームが左右に並ぶ向きに箱を置く
 *   地図を寄せたとき: いちばん近い乗換駅のすべての路線のホーム。箱は北を上にする
 */
export interface GroundScene {
  /** 描くホーム（路線ごとの駅） */
  stations: string[];
  /** 太く描いて深さの札を付けるホーム */
  main: string[];
  /** 歩く線（乗り換える前・後の駅） */
  walk: [string, string] | null;
  center: [number, number];
  bearing: number;
}

export interface TransferViewState extends GroundScene {
  /** 読み込んだ地上のデータ（place ID ごと） */
  grounds: { center: [number, number]; ground: Ground }[];
}

/** 乗換の前後の駅と、同じ駅（Place）にあるほかの路線の駅 */
function stationsAround(from: string, to: string): string[] {
  const ids = new Set([from, to]);
  for (const id of [from, to]) for (const s of placeByStation.get(id)?.stations ?? []) ids.add(s);
  return [...ids];
}

/** 路線の前後の駅の位置 */
function neighbors(s: Station): [[number, number] | undefined, [number, number] | undefined] {
  const list = railwayById.get(s.railway)!.stations;
  const i = list.indexOf(s.id);
  const at = (j: number) => (j >= 0 && j < list.length ? stationById.get(list[j]!)!.coord : undefined);
  return [at(i - 1), at(i + 1)];
}

/** 断面の箱の半辺（m）。地上のデータ（半径 260m）より内側にする */
const BOX_HALF = 190;

/** 乗換を見るカメラの中心と向き。乗り換える 2 つのホームが左右に並んで見える向きにする */
export function transferCamera(from: string, to: string): { center: [number, number]; bearing: number } {
  const a = stationById.get(from)!;
  const b = stationById.get(to)!;
  const [l, r] = transferAxis(a.coord, b.coord, ...neighbors(a));
  return { center: [(a.coord[0] + b.coord[0]) / 2, (a.coord[1] + b.coord[1]) / 2], bearing: sideBearing(l, r) };
}

/** 乗換を見るときに描くもの */
export function transferScene(from: string, to: string): GroundScene {
  return {
    stations: stationsAround(from, to),
    main: [...new Set([from, to])],
    walk: [from, to],
    ...transferCamera(from, to),
  };
}

/** 地図を寄せたときに、その乗換駅（Place）のまわりに描くもの */
export function placeScene(place: Place): GroundScene {
  return { stations: place.stations, main: place.stations, walk: null, center: place.coord, bearing: 0 };
}

/** ホームの深さの札（位置は地図の座標。RailMap が画面に投影して HTML で出す）。地上の路線が 3 つ以上なら 1 枚にまとめる */
export function transferTags(
  scene: GroundScene,
  scale: DepthScale,
): { id: string; position: Position3; text: string; color: string }[] {
  const stations = scene.main.map((id) => stationById.get(id)!);
  const above = stations.filter((s) => s.depth === 0);
  const merge = above.length >= 3;
  const tags = (merge ? stations.filter((s) => s.depth > 0) : stations).map((s) => {
    const r = railwayById.get(s.railway)!;
    return {
      id: s.id,
      position: [s.coord[0], s.coord[1], elevationOf(s.depth, scale)] as Position3,
      text: depthText(r.ja, s.depth),
      color: r.color,
    };
  });
  if (merge) {
    const lon = above.reduce((a, s) => a + s.coord[0], 0) / above.length;
    const lat = above.reduce((a, s) => a + s.coord[1], 0) / above.length;
    tags.unshift({
      id: 'above',
      position: [lon, lat, elevationOf(0, scale)],
      text: `地上 ${above.length}路線`,
      color: '#64748b',
    });
  }
  return tags;
}

/** 点線（a から b まで、step m ごとに線と隙間を交互に） */
function dashes(path: Position3[], step = 6): [Position3, Position3][] {
  const out: [Position3, Position3][] = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
    const len = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 111320, b[2] - a[2]);
    const n = Math.max(1, Math.round(len / step));
    const lerp = (t: number): Position3 => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    for (let i = 0; i < n; i += 2) out.push([lerp(i / n), lerp(Math.min(1, (i + 1) / n))]);
  }
  return out;
}

/**
 * 乗換駅に寄ったときの地上と地下の立体。
 *   地上: 建物（高さの目安で立ち上げ、半透明で地下が透けて見える）と道路
 *   地下: 路線ごとのホーム（その深さに路線の色の棒）。乗り換える 2 つのホームは太く、間を点線で結ぶ
 *   断面: 駅のまわりを四角く切り取り、地面の下を土色の箱で描く（ジオラマのように、ホームが土の中にあると分かる）
 */
export function buildTransferLayers(view: TransferViewState, scale: DepthScale): Layer[] {
  const groundZ = elevationOf(0, scale);
  const { center, bearing } = view;
  const square = squareAround(center, BOX_HALF, bearing);
  const inBox = (p: [number, number]) => insideConvex(p, square);
  // 地上は箱の上だけ（はみ出す建物は描かない、道路は箱の中の区間だけ）
  const buildings = view.grounds.flatMap(({ center: c, ground }) =>
    ground.buildings.flatMap(([h, ring]) => {
      const polygon = toLonLat(ring, c);
      return polygon.every(inBox) ? [{ h, polygon }] : [];
    }),
  );
  const roads = view.grounds.flatMap(({ center: c, ground }) =>
    ground.roads.flatMap(([w, line]) =>
      splitRuns(toLonLat(line, c), inBox).map((run) => ({
        w,
        path: run.map(([x, y]) => [x, y, groundZ] as Position3),
      })),
    ),
  );
  const z = (s: Station) => elevationOf(s.depth, scale);
  const around = view.stations.map((id) => stationById.get(id)!);
  // 箱の底は、いちばん深いホームより少し下
  const bottomZ = elevationOf(Math.max(15, ...around.map((s) => s.depth + 12)), scale);
  const corners = (zz: number) => square.map(([x, y]) => [x, y, zz] as Position3);
  const top = corners(groundZ);
  const bottom = corners(bottomZ);
  const edges: [Position3, Position3][] = [
    ...top.map((p, i) => [p, top[(i + 1) % 4]!] as [Position3, Position3]),
    ...bottom.map((p, i) => [p, bottom[(i + 1) % 4]!] as [Position3, Position3]),
    ...top.map((p, i) => [p, bottom[i]!] as [Position3, Position3]),
  ];
  const platforms = around.map((s) => {
    const [a, b] = platformEnds(s.coord, ...neighbors(s));
    return {
      id: s.id,
      main: view.main.includes(s.id),
      color: hexToRgb(railwayById.get(s.railway)!.color),
      path: [
        [a[0], a[1], z(s)],
        [b[0], b[1], z(s)],
      ] as Position3[],
    };
  });
  // ホームから地上へ上がり、地上を歩いて、次のホームへ下りる（通路の形のデータは無いので直線で）
  const walk: Position3[] = [];
  if (view.walk) {
    const from = stationById.get(view.walk[0])!;
    const to = stationById.get(view.walk[1])!;
    if (from.depth > 0 || to.depth > 0) walk.push([from.coord[0], from.coord[1], z(from)]);
    walk.push([from.coord[0], from.coord[1], groundZ], [to.coord[0], to.coord[1], groundZ]);
    if (from.depth > 0 || to.depth > 0) walk.push([to.coord[0], to.coord[1], z(to)]);
  }

  return [
    // 地面の下の土（半透明）。底の面を置いて、地面の高さまで立ち上げる
    new SolidPolygonLayer<Position3[]>({
      id: 'transfer-soil',
      data: [bottom],
      getPolygon: (d) => d,
      extruded: true,
      getElevation: groundZ - bottomZ,
      getFillColor: [196, 168, 128, 70],
      material: false,
      parameters: { depthWriteEnabled: false },
      updateTriggers: { getPolygon: scale, getElevation: scale },
    }),
    new LineLayer<[Position3, Position3]>({
      id: 'transfer-box',
      data: edges,
      getSourcePosition: (d) => d[0],
      getTargetPosition: (d) => d[1],
      getColor: [140, 112, 78, 200],
      getWidth: 1.5,
      parameters: { depthWriteEnabled: false },
      updateTriggers: { getSourcePosition: scale, getTargetPosition: scale },
    }),
    new PathLayer<{ w: number; path: Position3[] }>({
      id: 'transfer-roads',
      data: roads,
      getPath: (d) => d.path,
      getColor: [222, 216, 205, 255],
      getWidth: (d) => d.w,
      widthUnits: 'meters',
      widthMinPixels: 1,
      jointRounded: true,
      parameters: { depthWriteEnabled: false },
      updateTriggers: { getPath: scale },
    }),
    new SolidPolygonLayer<{ h: number; polygon: [number, number][] }>({
      id: 'transfer-buildings',
      data: buildings,
      getPolygon: (d) => d.polygon,
      extruded: true,
      getElevation: (d) => d.h,
      getFillColor: [255, 253, 249, 150],
      material: { ambient: 0.6, diffuse: 0.5, shininess: 8, specularColor: [255, 255, 255] },
      // 建物が地下のホームを隠さないよう、深度は書かない
      parameters: { depthWriteEnabled: false },
    }),
    new PathLayer<(typeof platforms)[number]>({
      id: 'transfer-platforms',
      data: platforms,
      getPath: (d) => d.path,
      getColor: (d) => [...d.color, d.main ? 255 : 150],
      getWidth: (d) => (d.main ? 14 : 8),
      widthUnits: 'pixels',
      capRounded: true,
      billboard: true,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getPath: scale },
    }),
    new LineLayer<[Position3, Position3]>({
      id: 'transfer-walk',
      data: walk.length ? dashes(walk) : [],
      getSourcePosition: (d) => d[0],
      getTargetPosition: (d) => d[1],
      getColor: [30, 30, 30, 230],
      getWidth: 3,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getSourcePosition: scale, getTargetPosition: scale },
    }),
  ];
}
