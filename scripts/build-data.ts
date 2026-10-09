/**
 * Mini Tokyo 3D（MIT License, 元データは公共交通オープンデータセンター）の路線・駅データを取得し、
 * 首都圏の主要路線に絞った src/data/network.json を生成する。
 *
 *   NODE_USE_ENV_PROXY=1 npm run data
 */
import { writeFileSync } from 'node:fs';
import type { Network, Place, Railway, Station } from '../src/domain/types.ts';
import { stationDepth } from '../src/domain/depth.ts';

const BASE = 'https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/';

const OPERATORS = new Set([
  'JR-East', 'TWR', 'TokyoMetro', 'Toei', 'YokohamaMunicipal', 'Keio', 'Keikyu', 'Keisei',
  'Hokuso', 'Tobu', 'Seibu', 'Odakyu', 'Tokyu', 'Minatomirai', 'Sotetsu', 'SaitamaRailway',
  'MIR', 'ToyoRapid', 'Yurikamome', 'TokyoMonorail', 'TamaMonorail',
]);

/** 首都圏から離れた路線や、旅客案内上は独立していない短い区間 */
const EXCLUDED = new Set([
  'JR-East.Joetsu', 'JR-East.Agatsuma', 'JR-East.Ryomo', 'JR-East.Mito', 'JR-East.Suigun',
  'JR-East.SuigunBranch', 'JR-East.Nikko', 'JR-East.Karasuyama', 'JR-East.Shinetsu',
  'JR-East.Kashima', 'JR-East.Kururi', 'JR-East.Ito', 'JR-East.Togane', 'JR-East.Hachiko',
  'JR-East.YamanoteFreight', 'JR-East.TokaidoFreight', 'JR-East.OsakiBranch',
  'Tobu.Sano', 'Tobu.Koizumi', 'Tobu.KoizumiBranch', 'Tobu.Kiryu', 'Tobu.Nikko',
  'Tobu.JRTobuConnection', 'Tobu.Utsunomiya', 'Tobu.Kinugawa', 'Seibu.SeibuChichibu',
  'Seibu.SeibuChichibuBranch', 'Odakyu.JROdakyuConnection', 'Toei.Arakawa',
  // 他の路線と同じ線路を走る直通運転の区間（経路の路線名が紛らわしくなる）
  'JR-East.KeiyoKoyaBranch', 'JR-East.KeiyoFutamataBranch', 'JR-East.MusashinoKunitachiBranch',
  'JR-East.MusashinoOmiyaBranch', 'JR-East.MusashinoNishiUrawaBranch',
  'Seibu.S-Fukutoshin', 'Seibu.S-Yurakucho',
]);

/** 表示範囲（経度・緯度）。はみ出した部分は路線ごとに切り落とす */
const BOUNDS = { west: 139.1, east: 140.25, south: 35.25, north: 36.05 };

interface SrcTitle { ja: string; en: string }
interface SrcRailway { id: string; title: SrcTitle; stations: string[]; color: string; altitude?: number }
interface SrcStation { id: string; railway?: string; coord?: [number, number]; title: SrcTitle; altitude?: number }
type SrcGroups = string[][][];

async function get<T>(name: string): Promise<T> {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
const inBounds = ([lon, lat]: [number, number]) =>
  lon >= BOUNDS.west && lon <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north;

const [srcRailways, srcStations, srcGroups] = await Promise.all([
  get<SrcRailway[]>('railways.json'),
  get<SrcStation[]>('stations.json'),
  get<SrcGroups>('station-groups.json'),
]);

const stationById = new Map(srcStations.map((s) => [s.id, s]));
const railways: Railway[] = [];
const stations: Station[] = [];

for (const r of srcRailways) {
  const operator = r.id.split('.')[0]!;
  if (!OPERATORS.has(operator) || EXCLUDED.has(r.id)) continue;
  // 範囲内で連続する駅のうち、いちばん長い区間だけを残す
  let best: SrcStation[] = [];
  let run: SrcStation[] = [];
  for (const id of r.stations) {
    const s = stationById.get(id);
    if (s?.coord && inBounds(s.coord)) {
      run.push(s);
      if (run.length > best.length) best = run;
    } else {
      run = [];
    }
  }
  if (best.length < 2) continue;
  railways.push({
    id: r.id,
    ja: r.title.ja,
    en: r.title.en,
    color: r.color,
    stations: best.map((s) => s.id),
  });
  for (const s of best) {
    stations.push({
      id: s.id,
      railway: r.id,
      ja: s.title.ja,
      en: s.title.en,
      coord: [round(s.coord![0]), round(s.coord![1])],
      // 元データの altitude は「地下なら -1」だけなので、深さは目安の表から付ける
      depth: stationDepth(r.id, s.title.ja, s.altitude === -1 || r.altitude === -1),
    });
  }
}

// 乗換のまとまり。station-groups に無い駅は 1 駅だけのまとまりにする
const included = new Map(stations.map((s) => [s.id, s]));
const transfers: string[][][] = [];
const grouped = new Set<string>();
for (const g of srcGroups) {
  const filtered = g
    .map((sub) => sub.filter((id) => included.has(id) && !grouped.has(id)))
    .filter((sub) => sub.length);
  if (filtered.length === 0) continue;
  filtered.flat().forEach((id) => grouped.add(id));
  transfers.push(filtered);
}
for (const s of stations) if (!grouped.has(s.id)) transfers.push([[s.id]]);

// 検索・表示の単位（place）は、乗換のまとまりを駅名ごとに分けたもの。
// 「押上〈スカイツリー前〉」のような副名は外して同じ駅として扱う
const baseName = (name: string) => name.replace(/\s*[〈（(].*$/, '').trim();
const places: Place[] = [];
for (const t of transfers) {
  const byName = new Map<string, Station[]>();
  for (const id of t.flat()) {
    const s = included.get(id)!;
    const key = baseName(s.ja);
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }
  for (const members of byName.values()) {
    const first = members[0]!;
    const lon = members.reduce((a, s) => a + s.coord[0], 0) / members.length;
    const lat = members.reduce((a, s) => a + s.coord[1], 0) / members.length;
    places.push({
      id: first.id,
      ja: baseName(first.ja),
      en: baseName(first.en),
      coord: [round(lon), round(lat)],
      stations: members.map((s) => s.id),
      lines: new Set(t.flat().map((id) => included.get(id)!.railway)).size,
    });
  }
}

const network: Network = { railways, stations, places, transfers };
writeFileSync(new URL('../src/data/network.json', import.meta.url), JSON.stringify(network));
console.log(`railways: ${railways.length}, stations: ${stations.length}, places: ${places.length}`);
