import { describe, expect, it } from 'vitest';
import { formatMinutes, journeyFrom, scanLastTrains, type Footpaths } from './lastTrain';
import type { Timetable } from './timetableTypes';
import { bucketOf } from './lastTrainColors';

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

interface C {
  key: string;
  from: string;
  to: string;
  dep: string;
  arr: string;
  dest?: string;
  next?: string;
}

/** 区間のリストから Timetable を作る（next は key で指定） */
function makeTimetable(conns: C[]): Timetable {
  const sorted = [...conns].sort((a, b) => t(a.dep) - t(b.dep));
  const stations = [...new Set(sorted.flatMap((c) => [c.from, c.to]))];
  const destinations = [...new Set(sorted.map((c) => c.dest ?? ''))];
  const pos = new Map(sorted.map((c, i) => [c.key, i]));
  return {
    stations,
    destinations,
    from: sorted.map((c) => stations.indexOf(c.from)),
    to: sorted.map((c) => stations.indexOf(c.to)),
    dep: sorted.map((c) => t(c.dep)),
    arr: sorted.map((c) => t(c.arr)),
    train: sorted.map((c) => destinations.indexOf(c.dest ?? '')),
    next: sorted.map((c) => (c.next ? pos.get(c.next)! : -1)),
    next2: sorted.map(() => -1),
  };
}

const noFoot: Footpaths = new Map();

describe('scanLastTrains', () => {
  it('同じ路線なら最後の列車の発車時刻', () => {
    const tt = makeTimetable([
      { key: '1a', from: 'A1', to: 'A2', dep: '23:00', arr: '23:05', next: '1b' },
      { key: '1b', from: 'A2', to: 'A3', dep: '23:06', arr: '23:10' },
      { key: '2a', from: 'A1', to: 'A2', dep: '23:30', arr: '23:35', dest: 'A3', next: '2b' },
      { key: '2b', from: 'A2', to: 'A3', dep: '23:36', arr: '23:40', dest: 'A3' },
    ]);
    const r = scanLastTrains(tt, noFoot, ['A3']);
    expect(r.latest.get('A1')).toBe(t('23:30'));
    expect(r.latest.get('A2')).toBe(t('23:36'));
    expect(r.latest.get('A3')).toBe(Infinity);
    const j = journeyFrom(r, 'A1')!;
    expect(j.dep).toBe(t('23:30'));
    expect(j.arr).toBe(t('23:40'));
    expect(j.legs).toEqual([
      { kind: 'ride', stops: ['A1', 'A2', 'A3'], dep: t('23:30'), arr: t('23:40'), destination: 'A3' },
    ]);
  });

  it('乗換時間が足りなければ、その前の列車にする', () => {
    // A2 と B2 は同じ構内（移動 2 分）。乗換には 2 + 2 = 4 分かかる
    const foot: Footpaths = new Map([
      ['A2', [['B2', 2]]],
      ['B2', [['A2', 2]]],
    ]);
    const tt = makeTimetable([
      { key: 'a1', from: 'A1', to: 'A2', dep: '23:00', arr: '23:10' },
      { key: 'a2', from: 'A1', to: 'A2', dep: '23:15', arr: '23:25' },
      { key: 'b1', from: 'B2', to: 'B3', dep: '23:15', arr: '23:20' },
      { key: 'b2', from: 'B2', to: 'B3', dep: '23:28', arr: '23:33' },
    ]);
    const r = scanLastTrains(tt, foot, ['B3']);
    // 23:25 着では 23:28 発に間に合わない（23:29 以降が必要）ので、23:00 発 → 23:15 発
    expect(r.latest.get('A1')).toBe(t('23:00'));
    expect(r.latest.get('A2')).toBe(t('23:26'));
    const j = journeyFrom(r, 'A1')!;
    expect(j.legs.map((l) => l.kind)).toEqual(['ride', 'walk', 'ride']);
    // 乗り換えた先は間に合う中で最も遅い列車（23:28 発）
    expect(j.arr).toBe(t('23:33'));
  });

  it('直通運転なら乗換時間なしで別の路線に続く', () => {
    const tt = makeTimetable([
      { key: 'x', from: 'A2', to: 'A3', dep: '23:30', arr: '23:35', next: 'y' },
      { key: 'y', from: 'C3', to: 'C4', dep: '23:36', arr: '23:40' },
    ]);
    const r = scanLastTrains(tt, noFoot, ['C4']);
    expect(r.latest.get('A2')).toBe(t('23:30'));
    const j = journeyFrom(r, 'A2')!;
    expect(j.legs).toHaveLength(1);
    expect((j.legs[0] as { stops: string[] }).stops).toEqual(['A2', 'A3', 'C4']);
  });

  it('日付をまたぐ時刻も比べられる', () => {
    const tt = makeTimetable([
      { key: 'a', from: 'A1', to: 'A2', dep: '23:50', arr: '24:05' },
      { key: 'b', from: 'A1', to: 'A2', dep: '24:20', arr: '24:35' },
    ]);
    const r = scanLastTrains(tt, noFoot, ['A2']);
    expect(formatMinutes(r.latest.get('A1')!)).toBe('0:20');
  });

  it('たどり着けない駅は結果に入らない', () => {
    const tt = makeTimetable([
      { key: 'a', from: 'A1', to: 'A2', dep: '23:00', arr: '23:05' },
      { key: 'd', from: 'D1', to: 'D2', dep: '23:00', arr: '23:05' },
    ]);
    const r = scanLastTrains(tt, noFoot, ['A2']);
    expect(r.latest.has('D1')).toBe(false);
    expect(journeyFrom(r, 'D1')).toBeNull();
  });

  it('目的地へ歩いて行ける駅は時刻なし（Infinity）', () => {
    const foot: Footpaths = new Map([
      ['A2', [['B2', 6]]],
      ['B2', [['A2', 6]]],
    ]);
    const tt = makeTimetable([
      { key: 'a', from: 'A1', to: 'A2', dep: '23:00', arr: '23:05' },
      { key: 'b', from: 'B1', to: 'B2', dep: '23:00', arr: '23:05' },
    ]);
    const r = scanLastTrains(tt, foot, ['A2']);
    expect(r.latest.get('B2')).toBe(Infinity);
    // B1 からは B2 で降りて歩けばよい
    expect(r.latest.get('B1')).toBe(t('23:00'));
    const j = journeyFrom(r, 'B1')!;
    expect(j.legs.map((l) => l.kind)).toEqual(['ride', 'walk']);
  });
});

describe('formatMinutes', () => {
  it('24 時以降は 0 時から', () => {
    expect(formatMinutes(t('23:05'))).toBe('23:05');
    expect(formatMinutes(t('24:12'))).toBe('0:12');
  });
});

describe('bucketOf', () => {
  it('時刻の帯を返す', () => {
    expect(bucketOf(t('22:10')).label).toBe('〜22:59');
    expect(bucketOf(t('23:30')).label).toBe('23:30〜');
    expect(bucketOf(t('24:59')).label).toBe('0:30〜');
    expect(bucketOf(t('25:20')).label).toBe('1:00〜');
  });
});
