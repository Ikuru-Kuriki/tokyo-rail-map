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
