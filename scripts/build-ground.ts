/**
 * 乗換駅のまわりの地上（建物・道路）を、国土地理院のベクトルタイルから切り出して public/ground/{place}.json に書く。
 * 「乗換を見る」でその駅に寄ったときに読み込む。
 *
 *   NODE_USE_ENV_PROXY=1 npm run ground
 *
 * タイルは .cache/gsi/ に保存する（2 回目からはダウンロードしない）。出典は「国土地理院ベクトルタイル」。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import type { Network } from '../src/domain/types.ts';
import { buildingHeight, ringArea, roadWidth, splitRuns, type Ground } from '../src/domain/ground.ts';

const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf';
const Z = 16;
/** 切り出す半径（m） */
const RADIUS = 260;
/** これより小さい建物（m²）は省く（ファイルを小さくするため。物置などの小屋が多い） */
const MIN_AREA = 40;
const CACHE = new URL('../.cache/gsi/', import.meta.url);
const OUT = new URL('../public/ground/', import.meta.url);

const network = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as Network;
/** 乗換駅（2 路線以上） */
const places = network.places.filter((p) => p.lines >= 2);

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
const tileOf = (lon: number, lat: number) => {
  const n = 2 ** Z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y] as const;
};

async function tile(x: number, y: number): Promise<VectorTile | null> {
  const file = new URL(`${Z}-${x}-${y}.pbf`, CACHE);
  if (!existsSync(file)) {
    const res = await fetch(TILE_URL.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)));
    // 海の上などタイルが無いところは 404
    if (res.status === 404) {
      writeFileSync(file, Buffer.alloc(0));
      return null;
    }
    if (!res.ok) throw new Error(`tile ${x}/${y}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = readFileSync(file);
  return buf.length ? new VectorTile(new Protobuf(buf)) : null;
}

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let total = 0;
for (const place of places) {
  const [lon0, lat0] = place.coord;
  const kx = mPerDegLon(lat0);
  // 中心からのメートル（東・北）。1m 単位に丸める
  const toXY = ([lon, lat]: number[]): [number, number] => [
    Math.round((lon! - lon0) * kx),
    Math.round((lat! - lat0) * M_PER_DEG_LAT),
  ];
  const near = ([x, y]: [number, number], r = RADIUS) => x * x + y * y <= r * r;

  const [x0, y0] = tileOf(lon0 - RADIUS / kx, lat0 + RADIUS / M_PER_DEG_LAT);
  const [x1, y1] = tileOf(lon0 + RADIUS / kx, lat0 - RADIUS / M_PER_DEG_LAT);
  const ground: Ground = { buildings: [], roads: [] };
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const t = await tile(x, y);
      if (!t) continue;
      const b = t.layers.building;
      for (let i = 0; b && i < b.length; i++) {
        const f = b.feature(i);
        const h = buildingHeight(Number(f.properties.ftCode));
        if (!h) continue;
        const g = f.toGeoJSON(x, y, Z).geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const poly of polys) {
          const ring = poly[0]!.map(toXY);
          // 外周の点がひとつでも半径の中にある、小さすぎない建物だけ
          if (ring.some((p) => near(p)) && Math.abs(ringArea(ring)) >= MIN_AREA)
            ground.buildings.push([h, ring.flat()]);
        }
      }
      const r = t.layers.road;
      for (let i = 0; r && i < r.length; i++) {
        const f = r.feature(i);
        const w = roadWidth(Number(f.properties.ftCode), Number(f.properties.rnkWidth));
        if (!w) continue;
        const g = f.toGeoJSON(x, y, Z).geometry;
        const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const line of lines) {
          // 半径の少し外までの区間だけ残す
          for (const run of splitRuns(line.map(toXY), (p) => near(p, RADIUS + 60))) ground.roads.push([w, run.flat()]);
        }
      }
    }
  const json = JSON.stringify(ground);
  total += json.length;
  writeFileSync(new URL(`${encodeURIComponent(place.id)}.json`, OUT), json);
}
console.log(`places: ${places.length}, total: ${(total / 1e6).toFixed(1)} MB`);
