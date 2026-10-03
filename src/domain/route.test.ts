import { describe, expect, it } from 'vitest';
import { buildGraph, WALK_TRANSFER_MINUTES } from './graph';
import { findRoute } from './route';
import { fixture } from './fixtures';
import { searchPlaces } from './search';
import real from '../data/network.json';
import type { Network } from './types';

const graph = buildGraph(fixture);
const place = (id: string) => fixture.places.find((p) => p.id === id)!;
const route = (from: string, to: string) => findRoute(fixture, graph, place(from), place(to));

describe('findRoute', () => {
  it('同じ路線の中なら乗換なし', () => {
    const r = route('A.1', 'A.4')!;
    expect(r.transfers).toBe(0);
    expect(r.legs).toEqual([{ railway: 'A', stations: ['A.1', 'A.2', 'A.3', 'A.4'] }]);
  });

  it('同じ構内で 1 回乗り換える', () => {
    const r = route('A.1', 'B.3')!;
    expect(r.transfers).toBe(1);
    expect(r.legs).toEqual([
      { railway: 'A', stations: ['A.1', 'A.2', 'A.3'] },
      { railway: 'B', stations: ['B.2', 'B.3'] },
    ]);
  });

  it('乗換駅が出発地なら、その駅のどの路線からでも出発できる', () => {
    const r = route('A.3', 'B.1')!;
    expect(r.transfers).toBe(0);
    expect(r.legs).toEqual([{ railway: 'B', stations: ['B.2', 'B.1'] }]);
  });

  it('環状線は近い向きに回る', () => {
    const r = route('C.2', 'C.4')!;
    expect(r.legs[0]!.stations).toHaveLength(3);
    const r2 = route('C.1', 'C.4')!;
    expect(r2.legs[0]!.stations).toEqual(['C.1', 'C.4']);
  });

  it('つながっていなければ null、同じ駅同士も null', () => {
    expect(route('A.1', 'D.2')).toBeNull();
    expect(route('A.1', 'A.1')).toBeNull();
  });
});

describe('実データ', () => {
  const network = real as unknown as Network;
  const realGraph = buildGraph(network);
  const find = (name: string) => searchPlaces(network.places, name, 1)[0]!;

  it.each([
    ['横浜', '赤羽'],
    ['吉祥寺', '新木場'],
    ['拝島', '西船橋'],
  ])('%s → %s の経路が見つかる', (a, b) => {
    const from = find(a);
    const to = find(b);
    expect(from.ja).toBe(a);
    expect(to.ja).toBe(b);
    const r = findRoute(network, realGraph, from, to);
    expect(r).not.toBeNull();
    expect(r!.legs.length).toBeGreaterThan(0);
    expect(r!.transfers).toBeLessThanOrEqual(3);
  });

  it('徒歩連絡だけの駅同士は乗車区間なし', () => {
    const r = findRoute(network, realGraph, find('有楽町'), find('日比谷'))!;
    expect(r.legs).toEqual([]);
    expect(r.minutes).toBe(WALK_TRANSFER_MINUTES);
  });
});

describe('searchPlaces', () => {
  it('完全一致 > 前方一致 > 部分一致、ローマ字でも探せる', () => {
    expect(searchPlaces(fixture.places, '中央')[0]!.id).toBe('A.3');
    expect(searchPlaces(fixture.places, 'chu')[0]!.id).toBe('A.3');
    expect(searchPlaces(fixture.places, 'ー1').map((p) => p.id)).toContain('A.1');
    expect(searchPlaces(fixture.places, '')).toEqual([]);
  });
});
