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

// ---------------------------------------------------------------- 関西

/** 関西の地下区間の代表的な深さ（路線 ID → m） */
const KANSAI_LINE_DEPTH: Record<string, number> = {
  'OsakaMetro.Midosuji': 12,
  'OsakaMetro.Tanimachi': 18,
  'OsakaMetro.Yotsubashi': 14,
  'OsakaMetro.Chuo': 16,
  'OsakaMetro.Sennichimae': 18,
  'OsakaMetro.Sakaisuji': 15,
  'OsakaMetro.Nagahori': 28,
  'OsakaMetro.Imazatosuji': 24,
  'Kitakyu.NambokuLine': 15,
  'KyotoSubway.Karasuma': 15,
  'KyotoSubway.Tozai': 20,
  'KobeSubway.SeishinYamate': 20,
  'KobeSubway.Kaigan': 18,
  'JR-West.Tozai': 25,
  'Keihan.Nakanoshima': 25,
};

/** 全線地下の路線のうち、地上・高架にある駅 */
const KANSAI_ABOVE_GROUND: Record<string, string[]> = {
  'OsakaMetro.Midosuji': ['江坂', '東三国', '新大阪', '西中島南方'],
  'OsakaMetro.Chuo': ['大阪港', '朝潮橋', '弁天町', '九条'],
  'OsakaMetro.Tanimachi': ['八尾南'],
  'Kitakyu.NambokuLine': ['桃山台', '緑地公園', '箕面萱野'],
  'KyotoSubway.Karasuma': ['竹田'],
  'KobeSubway.SeishinYamate': ['谷上', '総合運動公園', '学園都市', '伊川谷', '西神南', '西神中央'],
  'JR-West.Tozai': ['京橋', '尼崎'],
};

/** 一部だけ地下の路線の、地下の駅（路線 ID → 駅名 → 深さ m） */
const KANSAI_UNDERGROUND: Record<string, Record<string, number>> = {
  'Keihan.Main': {
    淀屋橋: 15,
    北浜: 15,
    天満橋: 15,
    七条: 10,
    清水五条: 10,
    祇園四条: 10,
    三条: 10,
    神宮丸太町: 12,
    出町柳: 12,
  },
  'Hankyu.Kyoto': { 大宮: 10, 烏丸: 12, 京都河原町: 12 },
  'Hankyu.KobeKosoku': { 花隈: 12, 高速神戸: 15, 新開地: 15 },
  'Hanshin.Main': { 大阪梅田: 10, 神戸三宮: 12, 元町: 12 },
  'Hanshin.KobeKosoku': { 元町: 12, 西元町: 15, 高速神戸: 15, 新開地: 15, 大開: 12, 高速長田: 12, 西代: 12 },
  'Hanshin.Namba': { 九条: 18, ドーム前: 18, 桜川: 18, 大阪難波: 15 },
  'Shintetsu.KobeKosoku': { 湊川: 12, 新開地: 15 },
  'Kintetsu.Nara': { 大阪難波: 15, 近鉄日本橋: 15, 大阪上本町: 10, 近鉄奈良: 10 },
  'Kintetsu.Keihanna': { 長田: 15 },
  'Keihan.Keishin': { 御陵: 15 },
};

/** 関西の駅の深さ（m）。N02 には地下の区別が無いので、表だけで決める */
export function kansaiStationDepth(railway: string, name: string): number {
  const partial = KANSAI_UNDERGROUND[railway];
  if (partial) return partial[name] ?? 0;
  const line = KANSAI_LINE_DEPTH[railway];
  if (line === undefined) return 0;
  if (KANSAI_ABOVE_GROUND[railway]?.includes(name)) return 0;
  return line;
}
