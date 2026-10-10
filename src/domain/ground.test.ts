import { describe, expect, it } from 'vitest';
import { buildingHeight, platformEnds, ringArea, roadWidth, splitRuns, toLonLat, transfersOf } from './ground';

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
