import { describe, expect, it } from 'vitest';
import type { Place } from './types';
import {
  buildingHeight,
  depthText,
  insideConvex,
  nearestTransferPlace,
  platformEnds,
  ringArea,
  roadWidth,
  sideBearing,
  splitRuns,
  squareAround,
  toLonLat,
  transferAxis,
  transfersOf,
} from './ground';

describe('ground', () => {
  it('建物の種類から高さを決め、描かない種類は 0', () => {
    expect(buildingHeight(3103)).toBeGreaterThan(buildingHeight(3102));
    expect(buildingHeight(3102)).toBeGreaterThan(buildingHeight(3101));
    expect(buildingHeight(3111)).toBe(0);
  });

  it('道路は中心線だけ描く', () => {
    expect(roadWidth(2701, 4)).toBeGreaterThan(roadWidth(2711, 0));
    expect(roadWidth(2201, 4)).toBe(0);
  });

  it('多角形の面積', () => {
    expect(
      Math.abs(
        ringArea([
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
        ]),
      ),
    ).toBe(50);
  });

  it('メートルの並びを経度・緯度に戻す', () => {
    const [p] = toLonLat([0, 111320], [139.7, 35.6]);
    expect(p![0]).toBeCloseTo(139.7);
    expect(p![1]).toBeCloseTo(36.6);
  });

  it('条件を満たす点が続くところで分ける', () => {
    expect(splitRuns([1, 2, 9, 3, 4, 5, 9, 6], (n) => n < 9)).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
  });

  it('経路の乗換は前の区間の最後と次の区間の最初', () => {
    expect(transfersOf([{ stations: ['a', 'b'] }, { stations: ['c', 'd'] }, { stations: ['e'] }])).toEqual([
      { from: 'b', to: 'c' },
      { from: 'd', to: 'e' },
    ]);
    expect(transfersOf([{ stations: ['a', 'b'] }])).toEqual([]);
  });

  it('ホームは前後の駅の向きに、駅を中心として置く', () => {
    const [a, b] = platformEnds([139.7, 35.6], [139.69, 35.6], [139.71, 35.6], 200);
    expect(a[1]).toBeCloseTo(35.6);
    expect(b[0] - 139.7).toBeCloseTo(139.7 - a[0]);
    const kx = 111320 * Math.cos((35.6 * Math.PI) / 180);
    expect((b[0] - a[0]) * kx).toBeCloseTo(200, 0);
  });
});

describe('乗換を横から見る', () => {
  it('西から東へ並ぶなら北が上のまま（bearing 0）', () => {
    expect(sideBearing([139.7, 35.6], [139.71, 35.6])).toBeCloseTo(0);
  });
  it('南から北へ並ぶなら左に 90 度回す', () => {
    expect(sideBearing([139.7, 35.6], [139.7, 35.61])).toBeCloseTo(-90);
  });
  it('2 駅が離れていればその 2 駅、近ければホームの向き', () => {
    const prev: [number, number] = [139.69, 35.6];
    const next: [number, number] = [139.71, 35.6];
    expect(transferAxis([139.7, 35.6], [139.705, 35.6], prev, next)).toEqual([
      [139.7, 35.6],
      [139.705, 35.6],
    ]);
    expect(transferAxis([139.7, 35.6], [139.7001, 35.6], prev, next)).toEqual([prev, next]);
  });
  it('深さの札', () => {
    expect(depthText('南北線', 28.4)).toBe('南北線 地下 約28m');
    expect(depthText('山手線', 0)).toBe('山手線 地上');
  });
  it('正方形の中と外', () => {
    const sq = squareAround([139.7, 35.6], 100, 30);
    expect(insideConvex([139.7, 35.6], sq)).toBe(true);
    expect(insideConvex([139.71, 35.6], sq)).toBe(false);
  });

  it('地図の中心に近い乗換駅（2 路線以上）を選び、遠ければ選ばない', () => {
    const place = (id: string, lines: number, coord: [number, number]) =>
      ({ id, ja: id, en: id, coord, stations: [], lines }) as Place;
    const places = [place('a', 1, [139.7, 35.6]), place('b', 2, [139.702, 35.6]), place('c', 3, [139.71, 35.6])];
    // a は乗換駅でないので、200m ほど離れた b
    expect(nearestTransferPlace(places, [139.7, 35.6])?.id).toBe('b');
    expect(nearestTransferPlace(places, [139.69, 35.6])).toBeNull();
  });
});
