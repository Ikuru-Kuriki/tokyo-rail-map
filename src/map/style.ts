/** 地図の見た目の定数（方眼紙の地面＋地下に沈む地下鉄） */
export const BACKGROUND = '#f3f1ec';
/** 地下の深さ 1m を画面上で何ピクセルくらいに見せるか（引いた表示のとき） */
export const DEPTH_PIXELS_PER_METER = 6;
/** 地上の路線を地面から浮かせる高さ（ピクセル）。方眼の線と重なってちらつかないように */
export const GROUND_LIFT_PX = 0.5;
/** 駅の点を線より少し上に置く（ピクセル）。線に埋もれないように */
export const DOT_LIFT_PX = 0.5;
/** グリッドを描く範囲（経度・緯度） */
export const GRID_BOUNDS = { west: 138.95, east: 140.4, south: 35.1, north: 36.2 };
export const GRID_STEP = 0.025;

/** 描画の高さの尺度。exaggeration は深さの強調倍率、metersPerPixel は今のズームでの 1 ピクセルの長さ */
export interface DepthScale {
  exaggeration: number;
  metersPerPixel: number;
}

/**
 * 今のズームでの尺度。1 ピクセルあたりのメートル数 ≒ 地球の円周 × cos(緯度) / (512 × 2^zoom)（deck.gl の MapView）。
 * 深さはズームによらずほぼ同じピクセル数に見せるが、拡大したとき（ズーム 12 より先）は駅から離れすぎないように弱める。
 * また傾きが小さい（真上から見る）ほど弱める
 */
export function depthScale(zoom: number, viewportSize = 900, pitch = 52, latitude = 35.68): DepthScale {
  const metersPerPixel = (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
  // 小さい画面（スマホ）では同じ深さでも画面に対して大きくなりすぎるので、画面の短い辺に合わせて弱める
  const screenFactor = Math.min(1, viewportSize / 900);
  const zoomFactor = Math.min(1, Math.max(0.3, 1 - (zoom - 12) * 0.15));
  // 深さは傾けたときにだけ見える。真上に近いほど弱め、真上（0 度）では地下の路線も地面の高さに描く
  const pitchFactor = Math.min(1, Math.max(0, pitch / 45));
  return {
    exaggeration: metersPerPixel * DEPTH_PIXELS_PER_METER * screenFactor * zoomFactor * pitchFactor,
    metersPerPixel,
  };
}

/** 駅の深さ（m）から描画の高さ（m）へ。地上の路線はほんの少しだけ浮かせる */
export function elevationOf(depth: number, scale: DepthScale): number {
  return depth > 0 ? -depth * scale.exaggeration : GROUND_LIFT_PX * scale.metersPerPixel;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
