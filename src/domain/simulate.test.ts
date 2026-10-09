import { describe, expect, it } from 'vitest';
import { earliestJourney, positionAt, type Connections, type Geometry } from './simulate';
import type { Footpaths } from './lastTrain';

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

interface C {
  from: string;
  to: string;
  dep: string;
  arr: string;
  trip: number;
}

function conns(list: C[], dest: string[] = []): Connections {
  const sorted = [...list].sort((a, b) => t(a.dep) - t(b.dep));
  const stations = [...new Set(sorted.flatMap((c) => [c.from, c.to]))];
  return {
    stations,
    tripDestination: (k) => dest[k] ?? `行き先${k}`,
    from: sorted.map((c) => stations.indexOf(c.from)),
    to: sorted.map((c) => stations.indexOf(c.to)),
    dep: sorted.map((c) => t(c.dep)),
    arr: sorted.map((c) => t(c.arr)),
    trip: sorted.map((c) => c.trip),
  };
}

const noFoot: Footpaths = new Map();

describe('earliestJourney', () => {
  it('出発時刻以降で最初に乗れる列車を使う（乗換なし）', () => {
    const c = conns([
      { from: 'A1', to: 'A2', dep: '8:00', arr: '8:05', trip: 0 },
      { from: 'A2', to: 'A3', dep: '8:06', arr: '8:10', trip: 0 },
      { from: 'A1', to: 'A2', dep: '8:10', arr: '8:15', trip: 1 },
      { from: 'A2', to: 'A3', dep: '8:16', arr: '8:20', trip: 1 },
    ]);
    const j = earliestJourney(c, noFoot, ['A1'], ['A3'], t('8:03'))!;
    expect(j.dep).toBe(t('8:10'));
    expect(j.arr).toBe(t('8:20'));
    expect(j.legs).toHaveLength(1);
    expect(j.legs[0]!.kind === 'ride' && j.legs[0]!.hops.map((h) => h.to)).toEqual(['A2', 'A3']);
  });

  it('乗換時間が足りなければ次の列車にする', () => {
    const c = conns([
      { from: 'A1', to: 'X', dep: '8:00', arr: '8:10', trip: 0 },
      { from: 'X', to: 'B2', dep: '8:11', arr: '8:20', trip: 1 }, // 1 分では乗り換えられない
      { from: 'X', to: 'B2', dep: '8:15', arr: '8:24', trip: 2 },
    ]);
    const j = earliestJourney(c, noFoot, ['A1'], ['B2'], t('7:55'))!;
    expect(j.arr).toBe(t('8:24'));
    expect(j.legs.map((l) => l.kind)).toEqual(['ride', 'ride']);
  });

  it('同じ構内の別の駅へは歩いて乗り換える', () => {
    const foot: Footpaths = new Map([
      ['A2', [['B2', 2]]],
      ['B2', [['A2', 2]]],
    ]);
    const c = conns([
      { from: 'A1', to: 'A2', dep: '8:00', arr: '8:05', trip: 0 },
      { from: 'B2', to: 'B3', dep: '8:10', arr: '8:15', trip: 1 },
    ]);
    const j = earliestJourney(c, foot, ['A1'], ['B3'], t('7:58'))!;
    expect(j.legs.map((l) => l.kind)).toEqual(['ride', 'walk', 'ride']);
  });

  it('着けなければ null', () => {
    const c = conns([{ from: 'A1', to: 'A2', dep: '8:00', arr: '8:05', trip: 0 }]);
    expect(earliestJourney(c, noFoot, ['A1'], ['Z'], t('7:00'))).toBeNull();
    expect(earliestJourney(c, noFoot, ['A1'], ['A2'], t('8:01'))).toBeNull();
  });
});

describe('positionAt', () => {
  const coords: Record<string, [number, number]> = { A1: [139.0, 35.0], A2: [139.1, 35.0], A3: [139.2, 35.0] };
  const g: Geometry = {
    coord: (id) => coords[id]!,
    depth: () => 0,
    name: (id) => id,
    railwayName: () => 'A線',
    path: (a, b) => [a, b],
  };
  const c = conns(
    [
      { from: 'A1', to: 'A2', dep: '8:00', arr: '8:10', trip: 0 },
      { from: 'A2', to: 'A3', dep: '8:12', arr: '8:20', trip: 0 },
    ],
    ['A3'],
  );
  const j = earliestJourney(c, noFoot, ['A1'], ['A3'], t('7:50'))!;

  it('出発前は出発駅で待つ', () => {
    const p = positionAt(j, t('7:55'), g);
    expect(p.phase).toBe('waiting');
    expect(p.coord).toEqual(coords.A1);
  });

  it('走行中は駅と駅の間を時刻で補間する', () => {
    const p = positionAt(j, t('8:05'), g);
    expect(p.phase).toBe('riding');
    expect(p.coord[0]).toBeCloseTo(139.05, 5);
    expect(p.status).toContain('A3行');
  });

  it('途中駅では停車中、着いたら到着', () => {
    expect(positionAt(j, t('8:11'), g).phase).toBe('stopped');
    const end = positionAt(j, t('8:30'), g);
    expect(end.phase).toBe('arrived');
    expect(end.coord).toEqual(coords.A3);
  });

  it('行き先が無い列車（環状線など）は「行」を付けない', () => {
    const loop = conns([{ from: 'A1', to: 'A2', dep: '8:00', arr: '8:10', trip: 0 }], ['']);
    const lj = earliestJourney(loop, noFoot, ['A1'], ['A2'], t('7:50'))!;
    expect(positionAt(lj, t('8:05'), g).status).not.toContain('行');
  });
});
