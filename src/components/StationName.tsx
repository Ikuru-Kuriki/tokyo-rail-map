import { stationById, stationCode } from '../data';
import { StationCode } from './StationCode';

/** 駅名と、その路線での駅番号（あれば） */
export function StationName({ id }: { id: string }) {
  const s = stationById.get(id)!;
  const code = stationCode(id);
  return (
    <span className="inline-flex items-center gap-1.5">
      {code && <StationCode code={code.code} color={code.color} size="sm" />}
      {s.ja}
    </span>
  );
}
