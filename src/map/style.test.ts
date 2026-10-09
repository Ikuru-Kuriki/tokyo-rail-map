import { describe, expect, it } from 'vitest';
import { depthScale, elevationOf } from './style';

describe('depthScale', () => {
  it('引いた表示では、深さ 1m がほぼ一定のピクセル数になる', () => {
    for (const zoom of [9, 10, 11]) {
      const s = depthScale(zoom);
      expect(s.exaggeration / s.metersPerPixel).toBeCloseTo(6, 5);
    }
  });

  it('拡大するほど深さの強調を弱める（駅から離れすぎないように）', () => {
    const near = depthScale(16);
    expect(near.exaggeration / near.metersPerPixel).toBeLessThan(6);
  });

  it('地上の路線はほんの少しだけ浮かせ、地下は深さに比例して下げる', () => {
    const s = depthScale(14);
    expect(elevationOf(0, s)).toBeGreaterThan(0);
    expect(elevationOf(0, s)).toBeLessThan(s.metersPerPixel * 2);
    expect(elevationOf(30, s)).toBeCloseTo(-30 * s.exaggeration, 5);
  });

  it('真上から見るときは深さを付けない（地下の路線も地面の高さ）', () => {
    expect(depthScale(11, 900, 0).exaggeration).toBe(0);
    expect(depthScale(11, 900, 20).exaggeration).toBeLessThan(depthScale(11, 900, 52).exaggeration);
  });
});
