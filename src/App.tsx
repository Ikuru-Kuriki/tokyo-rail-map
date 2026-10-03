import { useCallback, useMemo, useState } from 'react';
import { graph, network } from './data';
import { findRoute } from './domain/route';
import type { Place } from './domain/types';
import { RailMap } from './map/RailMap';
import { SearchPanel, type Slot } from './components/SearchPanel';
import { RouteResult } from './components/RouteResult';

export default function App() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [slot, setSlot] = useState<Slot>('from');

  const route = useMemo(
    () => (from && to ? findRoute(network, graph, from, to) : null),
    [from, to],
  );

  const chooseFrom = (p: Place | null) => {
    setFrom(p);
    if (p) setSlot('to');
  };
  const chooseTo = (p: Place | null) => {
    setTo(p);
    if (p) setSlot('from');
  };

  // 地図上の駅クリック: 選択中の欄に入れる
  const onPick = useCallback(
    (p: Place) => {
      if (slot === 'from') {
        setFrom(p);
        setSlot('to');
      } else {
        setTo(p);
        setSlot('from');
      }
    },
    [slot],
  );

  return (
    <main className="fixed inset-0">
      <RailMap route={route} from={from} to={to} onPick={onPick} />
      {/* スマホでは検索を上、経路を下に。PC では左上に縦に並べる */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 md:justify-start md:p-4">
        <SearchPanel
          from={from}
          to={to}
          slot={slot}
          onSlot={setSlot}
          onFrom={chooseFrom}
          onTo={chooseTo}
          onSwap={() => {
            setFrom(to);
            setTo(from);
          }}
          onClear={() => {
            setFrom(null);
            setTo(null);
            setSlot('from');
          }}
        />
        {from && to && (
          <section className="panel pointer-events-auto max-h-[40vh] w-full overflow-auto rounded-2xl bg-white/95 p-4 backdrop-blur md:max-h-none md:w-80">
            <RouteResult route={route} from={from} to={to} />
          </section>
        )}
      </div>
      <p className="pointer-events-none absolute right-2 bottom-1 text-[10px] text-slate-400">
        データ: Mini Tokyo 3D / 公共交通オープンデータセンター
      </p>
    </main>
  );
}
