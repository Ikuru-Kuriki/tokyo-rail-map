import { describe, expect, it } from 'vitest';
import { interchangeLinks } from './interchange';

describe('interchangeLinks', () => {
  it('同じ位置の駅しかなければ線は引かない', () => {
    expect(
      interchangeLinks([
        [139.7, 35.69],
        [139.70001, 35.69001],
      ]),
    ).toEqual([]);
  });

  it('ずれている駅どうしを最短でつなぐ（n 点なら n-1 本）', () => {
    const a: [number, number] = [139.7, 35.69];
    const b: [number, number] = [139.702, 35.69];
    const c: [number, number] = [139.704, 35.69];
    const links = interchangeLinks([a, c, b]);
    expect(links).toHaveLength(2);
    // a–c を直接つながず、間の b を経由する
    expect(links).not.toContainEqual([a, c]);
  });
});
