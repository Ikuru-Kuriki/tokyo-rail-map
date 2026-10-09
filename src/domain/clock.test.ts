import { describe, expect, it } from 'vitest';
import { formatClock, nowClock, parseClock } from './clock';

describe('clock', () => {
  it('3 時前は翌日扱い', () => {
    expect(parseClock('08:05')).toBe(485);
    expect(parseClock('0:30')).toBe(24 * 60 + 30);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('表示は 24 時以降も 0 時から', () => {
    expect(formatClock(485)).toBe('08:05');
    expect(formatClock(24 * 60 + 30)).toBe('00:30');
  });

  it('今の時刻は 5 分単位に切り上げ', () => {
    expect(nowClock(new Date(2026, 9, 9, 8, 3))).toBe('08:05');
    expect(nowClock(new Date(2026, 9, 9, 23, 58))).toBe('00:00');
  });
});
