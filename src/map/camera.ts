import type { LonLat } from '../domain/types';

export interface SideView {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/** 路線を真横に近い角度から見るときの傾き */
export const SIDE_PITCH = 75;

/**
 * 路線全体を横から見るカメラ。駅が最も広がっている向きが画面の左右になるように回し、
 * その長さが画面の幅（usableWidth）に収まるズームにする。複数の路線の駅をまとめて渡してもよい。
 */
/**
 * shiftPx: 路線を画面の右へずらすピクセル数（左にある検索パネルを避ける）
 */
export function sideViewFor(coords: LonLat[], usableWidth: number, shiftPx = 0): SideView {
  const lat0 = coords.reduce((a, c) => a + c[1], 0) / coords.length;
  const lon0 = coords.reduce((a, c) => a + c[0], 0) / coords.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  // 駅の広がりがいちばん大きい向き（主成分）を左右にする。複数の路線や環状線でも決まる
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const c of coords) {
    const x = (c[0] - lon0) * kx;
    const y = (c[1] - lat0) * ky;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  // 向きをそろえる（西→東、南北なら南→北が左→右）
  if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  const heading = (Math.atan2(dx, dy) * 180) / Math.PI;
  let bearing = heading - 90;
  if (bearing > 180) bearing -= 360;
  if (bearing < -180) bearing += 360;

  // 向きに沿った長さ
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const proj = coords.map((c) => (c[0] - lon0) * kx * ux + (c[1] - lat0) * ky * uy);
  const extent = Math.max(2000, Math.max(...proj) - Math.min(...proj));
  // 傾けると奥が縮み手前が広がるので、幅には余裕を持たせる
  const metersPerPixel = extent / (Math.max(usableWidth, 200) * 0.72);
  const zoom = Math.log2((40075016.686 * Math.cos((lat0 * Math.PI) / 180)) / (512 * metersPerPixel));
  const z = Math.min(13.5, Math.max(7.5, zoom));
  // 画面の右向き = (dx, dy)。路線を右へずらすには、カメラの中心を左へずらす
  const shiftM = shiftPx * ((40075016.686 * Math.cos((lat0 * Math.PI) / 180)) / (512 * 2 ** z));
  return {
    longitude: lon0 - (dx * shiftM) / kx,
    latitude: lat0 - (dy * shiftM) / ky,
    zoom: z,
    bearing,
    pitch: SIDE_PITCH,
  };
}
