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

export function RouteSearch(props: Props) {
  const { from, to, slot } = props;
  return (
    <>
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
        <button type="button" className="btn" onClick={props.onSwap}>
          ⇅ 入れ替え
        </button>
        <button type="button" className="btn" onClick={props.onClear}>
          クリア
        </button>
      </div>
      {(!from || !to) && (
        <p className="mt-3 text-xs text-slate-500">
          地図上の駅をクリックしても選べます。ドラッグで移動、右ドラッグ（スマホは 2 本指）で回転・傾き。
        </p>
      )}
    </>
  );
}
