import { useId, useState } from 'react';
import { network, railwaysOf } from '../data';
import { clearStationHistory, useStationHistory } from '../data/history';
import { searchPlaces } from '../domain/search';
import type { Place } from '../domain/types';
import { LineDots } from './LineDots';

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  active: boolean;
  onFocus: () => void;
}

export function StationPicker({ label, value, onChange, active, onFocus }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const history = useStationHistory();
  // 何も入力していないときは最近使った駅を出す
  const showingHistory = editing && query.trim() === '';
  const results = !editing ? [] : showingHistory ? history : searchPlaces(network.places, query);

  const choose = (p: Place) => {
    onChange(p);
    setEditing(false);
    setQuery('');
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-slate-400 ${active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}`}
        placeholder="駅名を入力（例: 新宿 / shinjuku）"
        autoComplete="off"
        value={editing ? query : (value?.ja ?? '')}
        onFocus={() => {
          onFocus();
          setEditing(true);
          setQuery('');
          setHighlight(0);
        }}
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHighlight((h) => Math.min(h + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setHighlight((h) => Math.max(h - 1, 0));
          else if (e.key === 'Enter' && results[highlight]) {
            choose(results[highlight]);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      {results.length > 0 && (
        <ul
          role="listbox"
          aria-label={showingHistory ? '最近使った駅' : '駅の候補'}
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {showingHistory && (
            <li role="presentation" className="flex items-center justify-between px-3 pt-1 pb-1.5 text-xs text-slate-500">
              <span className="font-semibold">最近使った駅</span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clearStationHistory();
                }}
              >
                履歴を消す
              </button>
            </li>
          )}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlight}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === highlight ? 'bg-slate-100' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="font-semibold">{p.ja}</span>
              <span className="truncate text-xs tracking-wide text-slate-400 uppercase">{p.en}</span>
              <span className="ml-auto">
                <LineDots railways={railwaysOf(p)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
