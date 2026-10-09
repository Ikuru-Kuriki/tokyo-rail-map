import { describe, expect, it } from 'vitest';
import { greyOf } from './layers';

describe('greyOf', () => {
  it('同じ値の灰色にし、地面の色に寄せて薄くする', () => {
    const [r, g, b] = greyOf([0, 0, 0]);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(100);
  });

  it('明るい色ほど明るい灰色になる', () => {
    expect(greyOf([255, 220, 0])[0]).toBeGreaterThan(greyOf([0, 40, 120])[0]);
  });
});
