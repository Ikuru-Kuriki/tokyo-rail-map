import raw from './network.json';
import { buildGraph } from '../domain/graph';
import type { Network, Place, Railway, Station } from '../domain/types';
import { TOKYO, type Region } from './regions';

/*
 * 今の地域のデータ。地域は画面を開いたときに 1 つ決め（main.tsx の initRegion）、切り替えるときはページを読み直す。
 * ほかのモジュールは読み込まれたときにこれらを使うので、initRegion はアプリの読み込みより前に呼ぶ
 */
export let region: Region = TOKYO;
export let network = raw as unknown as Network;
export let graph: ReturnType<typeof buildGraph>;
export let railwayById = new Map<string, Railway>();
export let stationById = new Map<string, Station>();
export let placeById = new Map<string, Place>();
export let placeByStation = new Map<string, Place>();
let symbolOf = new Map<string, string | null>();

function index(n: Network) {
  network = n;
  graph = buildGraph(n);
  railwayById = new Map(n.railways.map((r) => [r.id, r]));
  stationById = new Map(n.stations.map((s) => [s.id, s]));
  placeById = new Map(n.places.map((p) => [p.id, p]));
  placeByStation = new Map(n.places.flatMap((p) => p.stations.map((id) => [id, p] as const)));
  symbolOf = symbolsOf(n);
}

/** 地域を選んでデータを読み込む */
export async function initRegion(r: Region): Promise<void> {
  if (r.load) index(await r.load());
  region = r;
}

/** 駅に乗り入れる路線（色の表示用） */
export function railwaysOf(place: Place): Railway[] {
  const ids = new Set(place.stations.map((id) => stationById.get(id)!.railway));
  return [...ids].map((id) => railwayById.get(id)!);
}

/** 路線記号（"JK" など）。駅の番号から多いものを取る。番号の無い路線は null */
function symbolsOf(n: Network) {
  return new Map<string, string | null>(
    n.railways.map((r) => {
      const count = new Map<string, number>();
      for (const id of r.stations) {
        const code = stationById.get(id)!.code;
        if (code) {
          const sym = code.replace(/\d+$/, '');
          count.set(sym, (count.get(sym) ?? 0) + 1);
        }
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      return [r.id, best ? best[0] : null];
    }),
  );
}

index(network);

export function railwaySymbol(railwayId: string): string | null {
  return symbolOf.get(railwayId) ?? null;
}

/** 駅の番号と路線の色（表示用）。番号の無い駅は null */
export function stationCode(stationId: string): { code: string; color: string } | null {
  const s = stationById.get(stationId);
  if (!s?.code) return null;
  return { code: s.code, color: railwayById.get(s.railway)!.color };
}
