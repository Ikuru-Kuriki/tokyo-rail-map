import { describe, expect, it } from 'vitest';
import { COMPACT_LABEL_HEIGHT, labelWidth, minLabelPriority, placeLabels, type LabelCandidate } from './labels';

const c = (id: string, x: number, y: number, priority: number): LabelCandidate => ({
  id,
  ja: '新宿',
  en: 'SHINJUKU',
  x,
  y,
  priority,
});

describe('placeLabels', () => {
  it('重なるときは優先度の高いほうを残す', () => {
    const r = placeLabels([c('low', 200, 200, 1), c('high', 210, 205, 5)], 800, 600);
    expect(r.map((l) => l.id)).toEqual(['high']);
  });

  it('離れていれば両方置く', () => {
    const r = placeLabels([c('a', 100, 200, 1), c('b', 400, 200, 1)], 800, 600);
    expect(r).toHaveLength(2);
  });

  it('画面からはみ出すものは置かない', () => {
    expect(placeLabels([c('edge', 5, 200, 1), c('top', 300, 10, 1)], 800, 600)).toEqual([]);
  });

  it('固定のラベルは画面内に寄せて置く', () => {
    const r = placeLabels([{ ...c('pin', 5, 200, 1), pinned: true }], 800, 600);
    expect(r).toHaveLength(1);
    expect(r[0]!.left).toBe(4);
  });

  it('上限の数までしか置かない', () => {
    const many = Array.from({ length: 10 }, (_, i) => c(String(i), 60 + i * 100, 300, i));
    expect(placeLabels(many, 2000, 600, 3).map((l) => l.id)).toEqual(['9', '8', '7']);
  });

  it('小さいラベルは英字の分だけ狭く、低い', () => {
    const r = placeLabels([c('a', 300, 300, 1)], 800, 600, 60, true);
    expect(r[0]!.height).toBe(COMPACT_LABEL_HEIGHT);
    expect(r[0]!.width).toBe(labelWidth('新宿', 'SHINJUKU', '', 0, true));
    expect(r[0]!.width).toBeLessThan(labelWidth('新宿', 'SHINJUKU'));
  });

  it('小さいラベルは近くに並べても重ならなければ置ける', () => {
    // 標準の高さ（42）だと重なるが、小さいラベル（30）なら重ならない間隔
    const pair = [c('a', 300, 300, 2), c('b', 300, 336, 1)];
    expect(placeLabels(pair, 800, 600)).toHaveLength(1);
    expect(placeLabels(pair, 800, 600, 60, true)).toHaveLength(2);
  });
});

describe('placeLabels の blocked', () => {
  const button = { left: 250, top: 250, width: 100, height: 100 };
  it('ボタンに重なるラベルは置かない', () => {
    expect(placeLabels([c('a', 300, 330, 1)], 800, 600, 60, false, [button])).toEqual([]);
  });
  it('出発・到着などの固定のラベルはボタンに重なっても置く', () => {
    expect(placeLabels([{ ...c('a', 300, 330, 1), pinned: true }], 800, 600, 60, false, [button])).toHaveLength(1);
  });
});

describe('minLabelPriority', () => {
  it('主要駅のみは標準より多くの路線が集まる駅に絞る', () => {
    for (const zoom of [9, 10.5, 11.5, 13]) {
      expect(minLabelPriority(zoom, 'major')).toBeGreaterThan(minLabelPriority(zoom, 'normal'));
    }
  });

  it('なしでも経路の乗換駅（+100）と出発・到着（+200）は出す', () => {
    const min = minLabelPriority(12, 'none');
    expect(1 + 100).toBeGreaterThanOrEqual(min);
    expect(30 + 50).toBeLessThan(min);
  });
});
