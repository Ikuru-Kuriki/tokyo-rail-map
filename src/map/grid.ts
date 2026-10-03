import { GRID_BOUNDS, GRID_STEP } from './style';

export interface GridLine {
  from: [number, number];
  to: [number, number];
  major: boolean;
}

/** 方眼紙の線。5 本ごとに少し濃い線にする */
export function gridLines(): GridLine[] {
  const { west, east, south, north } = GRID_BOUNDS;
  const lines: GridLine[] = [];
  const cols = Math.round((east - west) / GRID_STEP);
  const rows = Math.round((north - south) / GRID_STEP);
  for (let i = 0; i <= cols; i++) {
    const x = west + i * GRID_STEP;
    lines.push({ from: [x, south], to: [x, north], major: i % 5 === 0 });
  }
  for (let j = 0; j <= rows; j++) {
    const y = south + j * GRID_STEP;
    lines.push({ from: [west, y], to: [east, y], major: j % 5 === 0 });
  }
  return lines;
}

export function gridFrame(): [number, number][] {
  const { west, east, south, north } = GRID_BOUNDS;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}
