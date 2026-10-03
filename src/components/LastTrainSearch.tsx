import type { DayType } from '../domain/timetableTypes';
import type { Place } from '../domain/types';
import { StationPicker } from './StationPicker';

export type LastSlot = 'home' | 'origin';

interface Props {
  home: Place | null;
  origin: Place | null;
  day: DayType;
  slot: LastSlot;
  onSlot: (slot: LastSlot) => void;
  onHome: (p: Place | null) => void;
  onOrigin: (p: Place | null) => void;
  onDay: (day: DayType) => void;
  onClear: () => void;
}

const DAYS: [DayType, string][] = [
  ['weekday', '平日'],
  ['holiday', '土休日'],
];

export function LastTrainSearch(props: Props) {
  const { home, origin, day, slot } = props;
  return (
    <>
      <div className="space-y-2">
        <StationPicker
          label="帰る駅（最寄り駅）"
          value={home}
          onChange={props.onHome}
          active={slot === 'home'}
          onFocus={() => props.onSlot('home')}
        />
        <StationPicker
          label="今いる駅（任意）"
          value={origin}
          onChange={props.onOrigin}
          active={slot === 'origin'}
          onFocus={() => props.onSlot('origin')}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <div role="radiogroup" aria-label="ダイヤ" className="flex rounded-lg border border-slate-200 p-0.5">
          {DAYS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={day === value}
              className={`rounded-md px-3 py-1 font-semibold ${day === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => props.onDay(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={props.onClear}>
          クリア
        </button>
      </div>
      {!home && (
        <p className="mt-3 text-xs text-slate-500">
          帰る駅を選ぶと、各駅から何時までに出れば帰れるかを地図に表示します。地図上の駅をクリックしても選べます。
        </p>
      )}
    </>
  );
}
