/** 地図の見た目の定数（方眼紙＋浮いた路線） */
export const BACKGROUND = '#f3f1ec';
/** 路線を地面から浮かせる高さ（メートル）。影との視差で立体感を出す */
export const LINE_ELEVATION = 700;
/** 影のずれ（経度・緯度） */
export const SHADOW_OFFSET: [number, number] = [0.004, -0.003];
/** グリッドを描く範囲（経度・緯度） */
export const GRID_BOUNDS = { west: 138.95, east: 140.4, south: 35.1, north: 36.2 };
export const GRID_STEP = 0.025;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
