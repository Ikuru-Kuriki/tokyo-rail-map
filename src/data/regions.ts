import type { Network } from '../domain/types';

/** 地域ごとの設定。データ以外の、地域で変わる値はここに置く */
export interface Region {
  /** URL のハッシュ（#kansai）や保存のキーに使う */
  id: string;
  /** 切り替えの表示名 */
  name: string;
  /** 画面のタイトル */
  title: string;
  /** タイトルの横の英字 */
  en: string;
  /** 最初に見る場所 */
  view: { longitude: number; latitude: number; zoom: number; bearing: number };
  /** 方眼の地面を描く範囲（経度・緯度） */
  grid: { west: number; east: number; south: number; north: number };
  /** 時刻表がある（終電・シミュレーションを出す） */
  timetable: boolean;
  /** 出典の表示 */
  credit: string;
  /** 路線・駅のデータ。首都圏は最初から読み込んであるので無し */
  load?: () => Promise<Network>;
}

export const TOKYO: Region = {
  id: 'tokyo',
  name: '首都圏',
  title: '首都圏 路線図',
  en: 'TOKYO RAIL MAP',
  view: { longitude: 139.7, latitude: 35.6, zoom: 9.7, bearing: -8 },
  grid: { west: 138.95, east: 140.4, south: 35.1, north: 36.2 },
  timetable: true,
  credit: 'データ: Mini Tokyo 3D / 公共交通オープンデータセンター',
};

export const REGIONS: Region[] = [TOKYO];

/** URL のハッシュ（"#kansai"）から地域を選ぶ。無い・知らない地域なら首都圏 */
export function regionFromHash(hash: string): Region {
  const id = hash.replace(/^#/, '');
  return REGIONS.find((r) => r.id === id) ?? TOKYO;
}
