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
 * 路線全体を横から見るカメラ。路線の始点→終点の向きが画面の左右になるように回し、
 * その長さが画面の幅（usableWidth）に収まるズームにする。
 */
export function sideViewFor(coords: LonLat[], usableWidth: number): SideView {
  const lat0 = coords.reduce((a, c) => a + c[1], 0) / coords.length;
  const lon0 = coords.reduce((a, c) => a + c[0], 0) / coords.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  let dx = (last[0] - first[0]) * kx;
  let dy = (last[1] - first[1]) * ky;
  // 環状線などで始点と終点が近いときは、いちばん遠い駅の向きを使う
  if (Math.hypot(dx, dy) < 1000) {
    let far = first;
    for (const c of coords)
      if (
        Math.hypot((c[0] - first[0]) * kx, (c[1] - first[1]) * ky) >
        Math.hypot((far[0] - first[0]) * kx, (far[1] - first[1]) * ky)
      )
        far = c;
    dx = (far[0] - first[0]) * kx;
    dy = (far[1] - first[1]) * ky;
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
  return {
    longitude: lon0,
    latitude: lat0,
    zoom: Math.min(13.5, Math.max(7.5, zoom)),
    bearing,
    pitch: SIDE_PITCH,
  };
}
