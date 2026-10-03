import { railwayById, stationById } from '../data';
import type { Route } from '../domain/route';
import type { Place } from '../domain/types';

interface Props {
  route: Route | null;
  from: Place;
  to: Place;
}

export function RouteResult({ route, from, to }: Props) {
  if (!route) {
    return <p className="text-sm text-slate-500">経路が見つかりませんでした。</p>;
  }
  if (route.legs.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        {from.ja} と {to.ja} は徒歩で乗り換えられます（約 {route.minutes} 分）。
      </p>
    );
  }
  const stops = route.legs.reduce((n, l) => n + l.stations.length - 1, 0);
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        約 <span className="text-lg font-bold text-slate-900">{route.minutes}</span> 分 ・ 乗換{' '}
        <span className="font-bold text-slate-900">{route.transfers}</span> 回 ・ {stops} 駅
      </p>
      <ol className="space-y-0">
        {route.legs.map((leg, i) => {
          const railway = railwayById.get(leg.railway)!;
          const first = stationById.get(leg.stations[0]!)!;
          const last = stationById.get(leg.stations[leg.stations.length - 1]!)!;
          return (
            <li key={i} className="relative pl-6">
              <span
                className="absolute top-2 bottom-2 left-[7px] w-1.5 rounded-full"
                style={{ background: railway.color }}
              />
              <span className="absolute top-1 left-0.5 h-4 w-4 rounded-full border-2 border-slate-900 bg-white" />
              <div className="pb-1 font-semibold">{first.ja}</div>
              <div className="pb-2 text-sm text-slate-500">
                <span className="font-semibold" style={{ color: railway.color }}>
                  {railway.ja}
                </span>{' '}
                {leg.stations.length - 1} 駅
              </div>
              {i === route.legs.length - 1 && (
                <>
                  <span className="absolute bottom-0 left-0.5 h-4 w-4 rounded-full border-2 border-slate-900 bg-slate-900" />
                  <div className="font-semibold">{last.ja}</div>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
