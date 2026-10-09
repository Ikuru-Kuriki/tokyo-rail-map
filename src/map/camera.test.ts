import { describe, expect, it } from 'vitest';
import { SIDE_PITCH, sideViewFor } from './camera';

describe('sideViewFor', () => {
  it('東西に走る路線は回さない（西→東が左→右）', () => {
    const v = sideViewFor(
      [
        [139.5, 35.68],
        [139.7, 35.68],
      ],
      1000,
    );
    expect(v.bearing).toBeCloseTo(0, 5);
    expect(v.pitch).toBe(SIDE_PITCH);
    expect(v.longitude).toBeCloseTo(139.6, 5);
  });

  it('南→北に走る路線は 90 度回して左右に向ける', () => {
    const v = sideViewFor(
      [
        [139.7, 35.5],
        [139.7, 35.8],
      ],
      1000,
    );
    expect(v.bearing).toBeCloseTo(-90, 5);
  });

  it('長い路線ほど引いたズームになる', () => {
    const short = sideViewFor(
      [
        [139.7, 35.68],
        [139.75, 35.68],
      ],
      1000,
    );
    const long = sideViewFor(
      [
        [139.4, 35.68],
        [140.0, 35.68],
      ],
      1000,
    );
    expect(long.zoom).toBeLessThan(short.zoom);
  });
});
