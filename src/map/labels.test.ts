import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelCandidate } from './labels';

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
});
