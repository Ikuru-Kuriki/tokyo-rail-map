import { describe, expect, it } from 'vitest';
import { startMinutes, type SimRouteInput } from './simRoutes';

const r = (mode: SimRouteInput['mode'], offset = 0, time = ''): SimRouteInput => ({
  id: 0,
  from: null,
  to: null,
  mode,
  offset,
  time,
});

describe('startMinutes', () => {
  it('経路 1 は共通の時刻、2 以降は同じ / 何分後 / 時刻指定', () => {
    expect(startMinutes([r('time', 0, '09:00'), r('same'), r('offset', 15), r('time', 0, '10:30')], '08:00')).toEqual([
      480, 480, 495, 630,
    ]);
  });

  it('時刻が不正なら null', () => {
    expect(startMinutes([r('same'), r('offset', 15)], '')).toEqual([null, null]);
  });
});
