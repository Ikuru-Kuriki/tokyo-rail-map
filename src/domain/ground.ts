/**
 * 乗換駅のまわりの地上（建物・道路）。座標は駅（Place）の位置からのメートル（東・北）を
 * [x0, y0, x1, y1, ...] と平らに並べる（ファイルを小さくするため）
 */
export interface Ground {
  /** [高さ m, 外周] */
  buildings: [number, number[]][];
  /** [幅 m, 中心線] */
  roads: [number, number[]][];
}

/**
 * 建物の高さ（m）の目安。地理院の地図には高さが無いので、建物の種類から決める。
 * 3101 普通建物・3102 堅ろう建物・3103 高層建物。それ以外（無壁舎など）は描かない
 */
export function buildingHeight(ftCode: number): number {
  if (ftCode === 3101) return 8;
  if (ftCode === 3102) return 20;
  if (ftCode === 3103) return 60;
  return 0;
}

/** 道路の幅（m）の目安。2701・2711 は道路の中心線（rnkWidth は幅の区分 0〜4）。道路の縁などは描かない */
export function roadWidth(ftCode: number, rnkWidth: number): number {
  if (ftCode !== 2701 && ftCode !== 2711) return 0;
  return [3, 4, 6, 10, 16][rnkWidth] ?? 4;
}

/** 多角形の面積（m²、向きで符号が変わる） */
export function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % ring.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** メートルの平らな並びを経度・緯度の点にする */
export function toLonLat(flat: number[], [lon0, lat0]: [number, number]): [number, number][] {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([lon0 + flat[i]! / kx, lat0 + flat[i + 1]! / 111320]);
  return out;
}

/** 点の並びを、条件を満たす点が続くところごとに分ける（半径の外に出た道路を切るため） */
export function splitRuns<T>(points: T[], keep: (p: T) => boolean): T[][] {
  const runs: T[][] = [];
  let run: T[] = [];
  for (const p of points) {
    if (keep(p)) run.push(p);
    else {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

/** 経路の乗換（前の区間の最後の駅 → 次の区間の最初の駅）。i 番目は legs[i] から legs[i + 1] への乗換 */
export function transfersOf(legs: { stations: string[] }[]): { from: string; to: string }[] {
  return legs.slice(1).map((l, i) => ({ from: legs[i]!.stations.at(-1)!, to: l.stations[0]! }));
}

/**
 * ホームの棒の両端（経度・緯度）。路線の前後の駅の向きに、駅を中心として length m の長さにする。
 * prev / next は前後の駅の位置（端の駅では片方が無い）
 */
export function platformEnds(
  at: [number, number],
  prev: [number, number] | undefined,
  next: [number, number] | undefined,
  length = 160,
): [[number, number], [number, number]] {
  const kx = Math.cos((at[1] * Math.PI) / 180);
  const a = prev ?? at;
  const b = next ?? at;
  let dx = (b[0] - a[0]) * kx;
  let dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  // 前後の駅が無い・同じ位置のときは東西に置く
  if (d === 0) [dx, dy] = [1, 0];
  else [dx, dy] = [dx / d, dy / d];
  const half = length / 2 / 111320;
  return [
    [at[0] - (dx * half) / kx, at[1] - dy * half],
    [at[0] + (dx * half) / kx, at[1] + dy * half],
  ];
}

/**
 * a から b への向きが画面の左から右になるカメラの向き（deck.gl の bearing、度）。
 * 乗換を真横に近い角度から見るときに使う（路線の強調の sideViewFor と同じ決め方）
 */
export function sideBearing(a: [number, number], b: [number, number]): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const heading = (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI;
  let bearing = heading - 90;
  if (bearing > 180) bearing -= 360;
  if (bearing <= -180) bearing += 360;
  return bearing;
}

/**
 * 乗換を横から見るときに左右に並べる 2 点。2 つの駅が離れていれば（徒歩連絡など）その 2 駅、
 * ほぼ同じ位置なら乗る前のホームの向き（前後の駅）
 */
export function transferAxis(
  from: [number, number],
  to: [number, number],
  fromPrev: [number, number] | undefined,
  fromNext: [number, number] | undefined,
  minMeters = 40,
): [[number, number], [number, number]] {
  const kx = 111320 * Math.cos((from[1] * Math.PI) / 180);
  const d = Math.hypot((to[0] - from[0]) * kx, (to[1] - from[1]) * 111320);
  if (d >= minMeters) return [from, to];
  return [fromPrev ?? from, fromNext ?? to];
}

/** 深さの札の文言（深さは目安なので「約」を付ける） */
export function depthText(railway: string, depth: number): string {
  return depth > 0 ? `${railway} 地下 約${Math.round(depth)}m` : `${railway} 地上`;
}

/** 中心 c・半辺 half m・向き bearing（度）の正方形の 4 隅（経度・緯度）。画面の左右・奥行きにそろえる */
export function squareAround(c: [number, number], half: number, bearing: number): [number, number][] {
  const kx = 111320 * Math.cos((c[1] * Math.PI) / 180);
  const t = (bearing * Math.PI) / 180;
  // 画面の右向き（東から bearing だけ時計回り）と奥向き
  const right: [number, number] = [Math.cos(t), -Math.sin(t)];
  const up: [number, number] = [Math.sin(t), Math.cos(t)];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const x = (i! * right[0] + j! * up[0]) * half;
    const y = (i! * right[1] + j! * up[1]) * half;
    return [c[0] + x / kx, c[1] + y / 111320] as [number, number];
  });
}

/** 点が多角形（凸）の中にあるか */
export function insideConvex(p: [number, number], poly: [number, number][]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}
