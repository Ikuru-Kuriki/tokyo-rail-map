import { describe, expect, it } from 'vitest';
import { buildGraph, distanceKm } from './graph';
import { findRoute } from './route';
import { searchPlaces } from './search';
import raw from '../data/regions/kansai/network.json';
import type { Network } from './types';

const kansai = raw as unknown as Network;
const graph = buildGraph(kansai);
const place = (ja: string) => {
  const p = kansai.places.find((p) => p.ja === ja);
  if (!p) throw new Error(`no place ${ja}`);
  return p;
};
const stationById = new Map(kansai.stations.map((s) => [s.id, s]));

describe('関西のデータ', () => {
  it.each([
    ['梅田', '京都'],
    ['難波', '三宮'],
    ['天王寺', '京橋'],
    ['京都', '奈良'],
    ['大阪', '関西空港'],
    ['神戸三宮', '京都河原町'],
  ])('%s → %s の経路が見つかる', (from, to) => {
    const r = findRoute(kansai, graph, place(from), place(to));
    expect(r).not.toBeNull();
    expect(r!.legs.length).toBeLessThanOrEqual(4);
  });

  it('梅田と大阪は別の駅で、歩いて乗り換えられる', () => {
    const umeda = place('梅田');
    const osaka = place('大阪');
    expect(umeda.id).not.toBe(osaka.id);
    const group = kansai.transfers.find((t) => t.flat().includes(umeda.stations[0]!))!;
    expect(group.flat()).toContain(osaka.stations[0]);
    expect(group.length).toBeGreaterThan(1);
  });

  it('大阪環状線は先頭の駅が末尾にもある', () => {
    const loop = kansai.railways.find((r) => r.id === 'JR-West.OsakaLoop')!;
    expect(loop.stations[0]).toBe(loop.stations.at(-1));
    expect(loop.stations.length).toBe(20);
  });

  it('地下鉄の主要駅に駅ナンバリングが入っている', () => {
    const codeAt = (railway: string, ja: string) =>
      kansai.stations.find((s) => s.railway === railway && s.ja === ja)?.code;
    expect(codeAt('OsakaMetro.Midosuji', '梅田')).toBe('M16');
    expect(codeAt('OsakaMetro.Midosuji', '天王寺')).toBe('M23');
    expect(codeAt('OsakaMetro.Tanimachi', '東梅田')).toBe('T20');
    expect(codeAt('OsakaMetro.Chuo', '本町')).toBe('C16');
    expect(codeAt('JR-West.OsakaLoop', '大阪')).toBe('O11');
    expect(codeAt('KyotoSubway.Karasuma', '京都')).toBe('K11');
    expect(codeAt('KobeSubway.SeishinYamate', '三宮')).toBe('S03');
  });

  it('漢字の駅名で探せる', () => {
    expect(searchPlaces(kansai.places, '三宮')[0]?.ja).toBe('三宮');
    expect(searchPlaces(kansai.places, '梅田')[0]?.ja).toBe('梅田');
  });

  it('路線の隣の駅どうしが極端に離れていない（並び順の誤りを見つける）', () => {
    for (const r of kansai.railways)
      for (let i = 1; i < r.stations.length; i++) {
        const a = stationById.get(r.stations[i - 1]!)!;
        const b = stationById.get(r.stations[i]!)!;
        expect(distanceKm(a.coord, b.coord), `${r.ja} ${a.ja} - ${b.ja}`).toBeLessThan(8);
      }
  });
});
