/** 地図の見た目の定数（方眼紙の地面＋地下に沈む地下鉄） */
export const BACKGROUND = '#f3f1ec';
/** 地下の深さ 1m を画面上で何ピクセルくらいに見せるか（ズームによらずほぼ一定にする） */
export const DEPTH_PIXELS_PER_METER = 2.5;
/** 地上の路線を地面から少しだけ浮かせる高さ（m）。方眼の線と重なってちらつかないように */
export const GROUND_LIFT = 30;
/** 駅の点を線より少し上に置く（線に埋もれないように） */
export const DOT_LIFT = 15;
/** グリッドを描く範囲（経度・緯度） */
export const GRID_BOUNDS = { west: 138.95, east: 140.4, south: 35.1, north: 36.2 };
export const GRID_STEP = 0.025;

/**
 * 深さを何倍に強調して描くか。ズームが小さいほど 1 ピクセルあたりの距離が長いので倍率を上げる。
 * 1 ピクセルあたりのメートル数 ≒ 地球の円周 × cos(緯度) / (512 × 2^zoom)（deck.gl の MapView）
 */
export function depthExaggeration(zoom: number, latitude = 35.68): number {
  const metersPerPixel = (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
  return Math.max(5, metersPerPixel * DEPTH_PIXELS_PER_METER);
}

/** 駅の深さ（m）から描画の高さ（m）へ */
export function elevationOf(depth: number, exaggeration: number): number {
  return depth > 0 ? -depth * exaggeration : GROUND_LIFT;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
