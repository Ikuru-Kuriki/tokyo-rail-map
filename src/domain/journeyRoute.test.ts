import { describe, expect, it } from 'vitest';
import { journeyToRoute, stationsBetween } from './journeyRoute';
import { fixture } from './fixtures';

describe('stationsBetween', () => {
  it('通過駅を含めて順に返す（逆向きも）', () => {
    expect(stationsBetween(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(stationsBetween(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['d', 'c', 'b']);
  });

  it('環状線は近い向きを選ぶ', () => {
    const loop = ['a', 'b', 'c', 'd', 'e', 'a'];
    expect(stationsBetween(loop, 'e', 'b')).toEqual(['e', 'a', 'b']);
  });
});

describe('journeyToRoute', () => {
  it('通過駅を補い、乗換ごとに区間を分ける', () => {
    const route = journeyToRoute(
      {
        dep: 0,
        arr: 30,
        legs: [
          { kind: 'ride', stops: ['A.1', 'A.3'], dep: 0, arr: 10, destination: '' },
          { kind: 'walk', from: 'A.3', to: 'B.2', minutes: 2 },
          { kind: 'ride', stops: ['B.2', 'B.3'], dep: 20, arr: 30, destination: '' },
        ],
      },
      fixture,
    );
    expect(route.legs).toEqual([
      { railway: 'A', stations: ['A.1', 'A.2', 'A.3'] },
      { railway: 'B', stations: ['B.2', 'B.3'] },
    ]);
    expect(route.transfers).toBe(1);
    expect(route.minutes).toBe(30);
  });

  it('直通運転は路線ごとに区間を分ける', () => {
    const route = journeyToRoute(
      {
        dep: 0,
        arr: 10,
        legs: [{ kind: 'ride', stops: ['A.2', 'A.3', 'B.3'], dep: 0, arr: 10, destination: '' }],
      },
      fixture,
    );
    // 乗り入れ駅（A.3 と B.2 は同じ駅）から先の B 線の区間も描く
    expect(route.legs).toEqual([
      { railway: 'A', stations: ['A.2', 'A.3'] },
      { railway: 'B', stations: ['B.2', 'B.3'] },
    ]);
    expect(route.transfers).toBe(0);
  });

  it('2 回乗り入れる列車でも、すべての区間がつながる', () => {
    // A 線 → B 線 → C 線（A.3 = B.2、B.3 = C.1 が同じ駅）
    const net = {
      ...fixture,
      places: fixture.places.map((p) => (p.id === 'C.1' ? { ...p, stations: ['C.1', 'B.3'] } : p)),
    };
    const route = journeyToRoute(
      {
        dep: 0,
        arr: 10,
        legs: [{ kind: 'ride', stops: ['A.1', 'A.3', 'B.3', 'C.2'], dep: 0, arr: 10, destination: '' }],
      },
      net,
    );
    expect(route.legs).toEqual([
      { railway: 'A', stations: ['A.1', 'A.2', 'A.3'] },
      { railway: 'B', stations: ['B.2', 'B.3'] },
      { railway: 'C', stations: ['C.1', 'C.2'] },
    ]);
  });
});
