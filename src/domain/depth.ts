/**
 * 地下区間の深さ（m）の目安。実測の公開データは使っていないので、路線ごとの代表値と、
 * よく知られた駅だけの上書きで持つ。地上・高架は 0。
 */

/** 全線または一部が地下の路線の、地下区間の代表的な深さ */
const LINE_DEPTH: Record<string, number> = {
  'TokyoMetro.Ginza': 10,
  'TokyoMetro.Marunouchi': 15,
  'TokyoMetro.MarunouchiBranch': 12,
  'TokyoMetro.Hibiya': 15,
  'TokyoMetro.Tozai': 18,
  'TokyoMetro.Chiyoda': 20,
  'TokyoMetro.Yurakucho': 22,
  'TokyoMetro.Hanzomon': 25,
  'TokyoMetro.Namboku': 28,
  'TokyoMetro.Fukutoshin': 25,
  'Toei.Asakusa': 15,
  'Toei.Mita': 20,
  'Toei.Shinjuku': 20,
  'Toei.Oedo': 30,
  'TWR.Rinkai': 20,
  'YokohamaMunicipal.Blue': 20,
  'YokohamaMunicipal.Green': 18,
  'Keio.KeioNew': 15,
  'Minatomirai.Minatomirai': 25,
  'SaitamaRailway.SaitamaRailway': 18,
  'MIR.TsukubaExpress': 22,
  'Tokyu.DenEnToshi': 20,
  'Tokyu.Toyoko': 20,
  'Tokyu.TokyuShinYokohama': 25,
  'Sotetsu.SotetsuShinYokohama': 25,
};

/** JR の地下区間（総武快速・横須賀線・京葉線など） */
const JR_DEPTH = 25;
/** その他の私鉄の地下区間 */
const DEFAULT_DEPTH = 15;

/** よく知られた深い駅（路線 ID と駅名） */
const STATION_DEPTH: Record<string, number> = {
  'Toei.Oedo:六本木': 42,
  'TokyoMetro.Chiyoda:国会議事堂前': 38,
  'TokyoMetro.Namboku:後楽園': 37,
  'TokyoMetro.Hanzomon:永田町': 36,
  'JR-East.Keiyo:東京': 27,
  'JR-East.SobuRapid:東京': 27,
  'JR-East.Yokosuka:東京': 27,
  'TokyoMetro.Fukutoshin:渋谷': 30,
};

/** 全線地下扱いの路線のうち、地上・高架にある駅 */
const ABOVE_GROUND: Record<string, string[]> = {
  'TokyoMetro.Ginza': ['渋谷'],
  'TokyoMetro.Marunouchi': ['御茶ノ水', '後楽園', '茗荷谷', '四ツ谷'],
  'TokyoMetro.Tozai': ['西葛西', '葛西', '浦安', '南行徳', '行徳', '妙典', '原木中山', '西船橋'],
  'TokyoMetro.Hibiya': ['南千住', '北千住'],
  'TokyoMetro.Chiyoda': ['綾瀬', '北綾瀬'],
  'Toei.Mita': ['志村三丁目', '蓮根', '西台', '高島平', '新高島平', '西高島平'],
  'Toei.Shinjuku': ['東大島', '船堀'],
};

/**
 * 駅の深さ（m）。underground は元データの「地下」フラグ（駅または路線のどちらかが地下なら true）
 */
export function stationDepth(railway: string, name: string, underground: boolean): number {
  if (!underground) return 0;
  if (ABOVE_GROUND[railway]?.includes(name)) return 0;
  const exact = STATION_DEPTH[`${railway}:${name}`];
  if (exact !== undefined) return exact;
  return LINE_DEPTH[railway] ?? (railway.startsWith('JR-') ? JR_DEPTH : DEFAULT_DEPTH);
}
