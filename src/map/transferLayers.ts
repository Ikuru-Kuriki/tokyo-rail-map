import { LineLayer, PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { placeByStation, railwayById, stationById } from '../data';
import { platformEnds, toLonLat, type Ground } from '../domain/ground';
import type { Station } from '../domain/types';
import { elevationOf, hexToRgb, type DepthScale } from './style';

type Position3 = [number, number, number];

export interface TransferViewState {
  /** 乗り換える前・後の駅（路線ごとの駅） */
  from: string;
  to: string;
  /** 読み込んだ地上のデータ（place ID ごと） */
  grounds: { center: [number, number]; ground: Ground }[];
}

/** 乗換の前後の駅と、同じ駅（Place）にあるほかの路線の駅 */
function stationsAround(from: string, to: string): Station[] {
  const ids = new Set([from, to]);
  for (const id of [from, to]) for (const s of placeByStation.get(id)?.stations ?? []) ids.add(s);
  return [...ids].map((id) => stationById.get(id)!);
}

/** 路線の前後の駅の位置 */
function neighbors(s: Station): [[number, number] | undefined, [number, number] | undefined] {
  const list = railwayById.get(s.railway)!.stations;
  const i = list.indexOf(s.id);
  const at = (j: number) => (j >= 0 && j < list.length ? stationById.get(list[j]!)!.coord : undefined);
  return [at(i - 1), at(i + 1)];
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
 */
export function buildTransferLayers(view: TransferViewState, scale: DepthScale): Layer[] {
  const groundZ = elevationOf(0, scale);
  const buildings = view.grounds.flatMap(({ center, ground }) =>
    ground.buildings.map(([h, ring]) => ({ h, polygon: toLonLat(ring, center) })),
  );
  const roads = view.grounds.flatMap(({ center, ground }) =>
    ground.roads.map(([w, line]) => ({
      w,
      path: toLonLat(line, center).map(([x, y]) => [x, y, groundZ] as Position3),
    })),
  );
  const z = (s: Station) => elevationOf(s.depth, scale);
  const platforms = stationsAround(view.from, view.to).map((s) => {
    const [a, b] = platformEnds(s.coord, ...neighbors(s));
    return {
      id: s.id,
      main: s.id === view.from || s.id === view.to,
      color: hexToRgb(railwayById.get(s.railway)!.color),
      path: [
        [a[0], a[1], z(s)],
        [b[0], b[1], z(s)],
      ] as Position3[],
    };
  });
  const from = stationById.get(view.from)!;
  const to = stationById.get(view.to)!;
  // ホームから地上へ上がり、地上を歩いて、次のホームへ下りる（通路の形のデータは無いので直線で）
  const walk: Position3[] =
    from.depth === 0 && to.depth === 0
      ? [
          [from.coord[0], from.coord[1], groundZ],
          [to.coord[0], to.coord[1], groundZ],
        ]
      : [
          [from.coord[0], from.coord[1], z(from)],
          [from.coord[0], from.coord[1], groundZ],
          [to.coord[0], to.coord[1], groundZ],
          [to.coord[0], to.coord[1], z(to)],
        ];

  return [
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
      data: dashes(walk),
      getSourcePosition: (d) => d[0],
      getTargetPosition: (d) => d[1],
      getColor: [30, 30, 30, 230],
      getWidth: 3,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getSourcePosition: scale, getTargetPosition: scale },
    }),
  ];
}
