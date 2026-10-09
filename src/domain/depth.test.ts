import { describe, expect, it } from 'vitest';
import { stationDepth } from './depth';

describe('stationDepth', () => {
  it('地上の駅は 0', () => {
    expect(stationDepth('JR-East.Yamanote', '新宿', false)).toBe(0);
  });

  it('地下の駅は路線の代表値', () => {
    expect(stationDepth('TokyoMetro.Ginza', '銀座', true)).toBe(10);
    expect(stationDepth('Toei.Oedo', '新宿', true)).toBe(30);
  });

  it('よく知られた深い駅は個別の値', () => {
    expect(stationDepth('Toei.Oedo', '六本木', true)).toBe(42);
  });

  it('全線地下扱いでも、地上・高架の駅は 0', () => {
    expect(stationDepth('TokyoMetro.Marunouchi', '後楽園', true)).toBe(0);
    expect(stationDepth('TokyoMetro.Tozai', '西船橋', true)).toBe(0);
  });

  it('表に無い路線は JR か私鉄かで決める', () => {
    expect(stationDepth('JR-East.Keiyo', '八丁堀', true)).toBe(25);
    expect(stationDepth('Keio.Keio', '調布', true)).toBe(15);
  });
});
