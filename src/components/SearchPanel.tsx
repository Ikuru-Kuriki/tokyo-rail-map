import type { Place } from '../domain/types';
import { StationPicker } from './StationPicker';

export type Slot = 'from' | 'to';

interface Props {
  from: Place | null;
  to: Place | null;
  slot: Slot;
  onSlot: (slot: Slot) => void;
  onFrom: (p: Place | null) => void;
  onTo: (p: Place | null) => void;
  onSwap: () => void;
  onClear: () => void;
}

export function SearchPanel(props: Props) {
  const { from, to, slot } = props;
  return (
    <section className="panel pointer-events-auto w-full rounded-2xl bg-white/95 p-3 backdrop-blur md:w-80 md:p-4">
      <h1 className="mb-2 flex items-baseline gap-2 md:mb-3">
        <span className="text-lg font-bold">首都圏 路線図</span>
        <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-400">TOKYO RAIL MAP</span>
      </h1>
      <div className="space-y-2">
        <StationPicker
          label="出発"
          value={from}
          onChange={props.onFrom}
          active={slot === 'from'}
          onFocus={() => props.onSlot('from')}
        />
        <StationPicker
          label="到着"
          value={to}
          onChange={props.onTo}
          active={slot === 'to'}
          onFocus={() => props.onSlot('to')}
        />
      </div>
      <div className="mt-2 flex gap-2 text-sm">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50"
          onClick={props.onSwap}
        >
          ⇅ 入れ替え
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50"
          onClick={props.onClear}
        >
          クリア
        </button>
      </div>
      {(!from || !to) && (
        <p className="mt-3 text-xs text-slate-500">
          地図上の駅をクリックしても選べます。ドラッグで移動、右ドラッグ（スマホは 2 本指）で回転・傾き。
        </p>
      )}
    </section>
  );
}
