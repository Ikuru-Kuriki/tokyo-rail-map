import { useId } from 'react';
import { formatMinutes } from '../domain/lastTrain';
import { SIM_COLORS } from '../map/trainIcon';
import { RouteBadge } from './SimulationPanel';

export const SPEEDS = [10, 30, 60, 120];

interface Props {
  start: number;
  end: number;
  time: number;
  playing: boolean;
  speed: number;
  rows: { index: number; status: string }[];
  onTime: (t: number) => void;
  onPlay: (playing: boolean) => void;
  onSpeed: (speed: number) => void;
}

/** 再生バー: 再生・一時停止、時計、時刻のスライダー、速度、各経路の今の状態 */
export function PlaybackBar({ start, end, time, playing, speed, rows, onTime, onPlay, onSpeed }: Props) {
  const sliderId = useId();
  return (
    <section
      aria-label="再生"
      className="panel pointer-events-auto w-full rounded-2xl bg-white/95 p-3 backdrop-blur md:w-[min(640px,calc(100vw-28rem))]"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
          aria-label={playing ? '一時停止' : '再生'}
          onClick={() => {
            // 最後まで再生したあとは最初から
            if (!playing && time >= end) onTime(start);
            onPlay(!playing);
          }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="2" y="1" width="3.5" height="12" fill="currentColor" />
              <rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 1 L13 7 L3 13 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="w-14 shrink-0 text-xl font-bold tabular-nums">{formatMinutes(time)}</span>
        <label htmlFor={sliderId} className="sr-only">
          時刻
        </label>
        <input
          id={sliderId}
          type="range"
          className="min-w-0 flex-1 accent-slate-900"
          min={start}
          max={end}
          step={0.25}
          value={Math.min(Math.max(time, start), end)}
          onChange={(e) => onTime(Number(e.target.value))}
        />
        <select
          aria-label="再生の速さ"
          className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm font-semibold"
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
        </select>
      </div>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.index} className="flex items-center gap-2" style={{ color: SIM_COLORS[r.index] }}>
              <RouteBadge index={r.index} />
              <span className="min-w-0 truncate text-slate-700">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
