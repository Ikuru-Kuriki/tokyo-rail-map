import { useId } from 'react';
import { network } from '../data';
import type { Railway } from '../domain/types';

/** 会社名（路線 ID の先頭） */
const OPERATORS: [string, string][] = [
  ['JR-East', 'JR東日本'],
  ['TokyoMetro', '東京メトロ'],
  ['Toei', '都営地下鉄'],
  ['Tokyu', '東急'],
  ['Keio', '京王'],
  ['Odakyu', '小田急'],
  ['Seibu', '西武'],
  ['Tobu', '東武'],
  ['Keikyu', '京急'],
  ['Keisei', '京成'],
  ['Sotetsu', '相鉄'],
  ['YokohamaMunicipal', '横浜市営地下鉄'],
  ['Minatomirai', 'みなとみらい線'],
  ['TWR', 'りんかい線'],
  ['MIR', 'つくばエクスプレス'],
  ['SaitamaRailway', '埼玉高速鉄道'],
  ['ToyoRapid', '東葉高速鉄道'],
  ['Hokuso', '北総鉄道'],
  ['Yurikamome', 'ゆりかもめ'],
  ['TokyoMonorail', '東京モノレール'],
  ['TamaMonorail', '多摩モノレール'],
];

const groups = OPERATORS.map(([prefix, name]) => ({
  name,
  railways: network.railways.filter((r) => r.id.split('.')[0] === prefix),
})).filter((g) => g.railways.length > 0);

interface Props {
  value: string | null;
  onChange: (railwayId: string | null) => void;
}

export function LineSelect({ value, onChange }: Props) {
  const id = useId();
  const selected: Railway | undefined = network.railways.find((r) => r.id === value);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-500">
        路線を強調（地図の線をクリックしても選べます）
      </label>
      <div className="flex items-center gap-2">
        {selected && (
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: selected.color }} aria-hidden="true" />
        )}
        <select
          id={id}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">すべての路線</option>
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.railways.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ja}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selected && (
          <button type="button" className="btn shrink-0 !px-2 !py-1 text-xs" onClick={() => onChange(null)}>
            解除
          </button>
        )}
      </div>
    </div>
  );
}
