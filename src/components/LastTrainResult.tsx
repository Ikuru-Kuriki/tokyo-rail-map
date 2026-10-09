import { railwayById, stationById } from '../data';
import { formatMinutes, type LastTrainJourney } from '../domain/lastTrain';
import { BUCKETS, UNREACHABLE_COLOR } from '../domain/lastTrainColors';
import type { Place } from '../domain/types';
import { StationName } from './StationName';

export function Legend() {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">この時刻までに出れば帰れる</p>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs text-slate-700">
        {BUCKETS.map((b) => (
          <li key={b.label} className="flex items-center gap-1.5 tabular-nums">
            <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: b.color }} />
            {b.label}
          </li>
        ))}
        <li className="col-span-3 flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: UNREACHABLE_COLOR }} />
          21 時以降の電車では帰れない
        </li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">駅をクリックすると、その駅からの終電ルートを表示します。</p>
    </div>
  );
}

interface Props {
  home: Place;
  origin: Place;
  journey: LastTrainJourney | null;
}

const nameOf = (id: string) => stationById.get(id)!.ja;

export function LastTrainResult({ home, origin, journey }: Props) {
  if (origin.id === home.id) {
    return <p className="text-sm text-slate-600">帰る駅と同じ駅です。</p>;
  }
  if (!journey) {
    return (
      <p className="text-sm text-slate-600">
        {origin.ja} から {home.ja} へは、21 時以降の電車では帰れません。
      </p>
    );
  }
  if (!Number.isFinite(journey.dep)) {
    return (
      <p className="text-sm text-slate-600">
        {origin.ja} から {home.ja} へは歩いて行けます。
      </p>
    );
  }
  // 同じ名前の駅への移動は普通の乗換なので表示しない（徒歩連絡だけ出す）
  const legs = journey.legs.filter((l) => l.kind === 'ride' || nameOf(l.from) !== nameOf(l.to));
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        終電 <span className="text-lg font-bold text-slate-900 tabular-nums">{formatMinutes(journey.dep)}</span> 発 →{' '}
        <span className="font-bold text-slate-900 tabular-nums">{formatMinutes(journey.arr)}</span> 着
      </p>
      <ol>
        {legs.map((leg, i) => {
          if (leg.kind === 'walk') {
            return (
              <li key={i} className="relative pb-2 pl-6 text-sm text-slate-500">
                <span className="absolute top-0 bottom-0 left-[9px] border-l-2 border-dotted border-slate-400" />
                徒歩連絡 {nameOf(leg.from)} → {nameOf(leg.to)}
                {leg.minutes > 0 && `（約 ${leg.minutes} 分）`}
              </li>
            );
          }
          const railway = railwayById.get(stationById.get(leg.stops[0]!)!.railway)!;
          const last = i === legs.length - 1;
          return (
            <li key={i} className="relative pl-6">
              <span
                className="absolute top-2 bottom-2 left-[7px] w-1.5 rounded-full"
                style={{ background: railway.color }}
              />
              <span className="absolute top-1 left-0.5 h-4 w-4 rounded-full border-2 border-slate-900 bg-white" />
              <div className="flex justify-between pb-1 font-semibold">
                <StationName id={leg.stops[0]!} />
                <span className="tabular-nums">{formatMinutes(leg.dep)} 発</span>
              </div>
              <div className="pb-2 text-sm text-slate-500">
                <span className="font-semibold" style={{ color: railway.color }}>
                  {railway.ja}
                </span>
                {leg.destination && ` ${leg.destination}行`}・{leg.stops.length - 1} 駅
              </div>
              <div className="relative flex justify-between pb-2 font-semibold">
                {last && (
                  <span className="absolute top-1 -left-[22px] h-4 w-4 rounded-full border-2 border-slate-900 bg-slate-900" />
                )}
                <StationName id={leg.stops[leg.stops.length - 1]!} />
                <span className="tabular-nums">{formatMinutes(leg.arr)} 着</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
