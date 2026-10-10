import { useId } from 'react';
import { network, railwaySymbol } from '../data';
import { StationCode } from './StationCode';

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
  // 関西
  ['JR-West', 'JR西日本'],
  ['OsakaMetro', 'Osaka Metro'],
  ['Kitakyu', '北大阪急行'],
  ['KyotoSubway', '京都市営地下鉄'],
  ['KobeSubway', '神戸市営地下鉄'],
  ['KobeNewTransit', '神戸新交通'],
  ['Hankyu', '阪急'],
  ['Hanshin', '阪神'],
  ['Keihan', '京阪'],
  ['Kintetsu', '近鉄'],
  ['Nankai', '南海'],
  ['Sanyo', '山陽電車'],
  ['Shintetsu', '神戸電鉄'],
  ['Nose', '能勢電鉄'],
  ['OsakaMonorail', '大阪モノレール'],
  ['Eiden', '叡山電鉄'],
  ['Randen', '嵐電'],
  ['Mizuma', '水間鉄道'],
  ['Wakayama', '和歌山電鐵'],
];

const known = new Set(OPERATORS.map(([prefix]) => prefix));

const groups = OPERATORS.map(([prefix, name]) => ({
  name,
  railways: network.railways.filter((r) => r.id.split('.')[0] === prefix),
}))
  // 表に無い会社の路線は「その他」に入れる（選べなくならないように）
  .concat({ name: 'その他', railways: network.railways.filter((r) => !known.has(r.id.split('.')[0]!)) })
  .filter((g) => g.railways.length > 0);

const label = (id: string) => {
  const r = network.railways.find((x) => x.id === id)!;
  const sym = railwaySymbol(id);
  return sym ? `${sym} ${r.ja}` : r.ja;
};

interface Props {
  value: string[];
  onChange: (railwayIds: string[]) => void;
}

/** 強調する路線を選ぶ。選ぶたびに追加され、複数の路線を色付きで見比べられる */
export function LineSelect({ value, onChange }: Props) {
  const id = useId();
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-500">
        路線を強調（いくつでも追加できます。地図の線をクリックしても選べます）
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="強調中の路線">
          {value.map((rid) => {
            const r = network.railways.find((x) => x.id === rid)!;
            const sym = railwaySymbol(rid);
            return (
              <li key={rid}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pr-2 pl-1 text-xs font-semibold hover:bg-slate-50"
                  onClick={() => onChange(value.filter((x) => x !== rid))}
                  aria-label={`${r.ja}の強調を外す`}
                >
                  {sym ? (
                    <StationCode code={sym} color={r.color} size="sm" />
                  ) : (
                    <span className="ml-1 h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                  )}
                  {r.ja}
                  <span className="text-slate-400" aria-hidden="true">
                    ×
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <select
          id={id}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold"
          value=""
          onChange={(e) => {
            const rid = e.target.value;
            if (rid && !value.includes(rid)) onChange([...value, rid]);
          }}
        >
          <option value="">{value.length > 0 ? '路線を追加…' : '路線を選ぶ…'}</option>
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.railways.map((r) => (
                <option key={r.id} value={r.id} disabled={value.includes(r.id)}>
                  {label(r.id)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {value.length > 0 && (
          <button type="button" className="btn shrink-0 !px-2 !py-1 text-xs" onClick={() => onChange([])}>
            すべて解除
          </button>
        )}
      </div>
    </div>
  );
}
