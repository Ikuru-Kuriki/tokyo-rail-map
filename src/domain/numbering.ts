/**
 * 駅ナンバリング（JY01 など）。
 * 元データは piuccio/open-data-jp-railway-stations の short_code（ODPT 由来）。その後に開業した駅や
 * 番号の振り直し、元データに番号の無い路線は、下の表で補う。
 */

/** 表記をそろえる: "E-01" → "E01"、"U1" → "U01" */
export function normalizeCode(code: string): string {
  const m = code.replace(/[-\s]/g, '').match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return code;
  return `${m[1]!.toUpperCase()}${m[2]!.padStart(2, '0')}`;
}

/**
 * 番号が順番に振られている路線。from の駅を start 番とし、路線の駅の並び（toward の駅がある向き）に 1 ずつ増やす。
 * skip の駅（他の路線の番号を使う乗換駅など）は番号を付けず、数え飛ばしもしない。
 */
export interface SequentialRule {
  railway: string;
  prefix: string;
  from: string;
  toward: string;
  start: number;
  skip?: string[];
}

export const SEQUENTIAL: SequentialRule[] = [
  { railway: 'Tokyu.Toyoko', prefix: 'TY', from: '渋谷', toward: '代官山', start: 1 },
  { railway: 'Tokyu.DenEnToshi', prefix: 'DT', from: '渋谷', toward: '池尻大橋', start: 1 },
  { railway: 'Tokyu.Meguro', prefix: 'MG', from: '目黒', toward: '不動前', start: 1 },
  { railway: 'Tokyu.Ikegami', prefix: 'IK', from: '五反田', toward: '大崎広小路', start: 1 },
  { railway: 'Tokyu.TokyuTamagawa', prefix: 'TM', from: '多摩川', toward: '沼部', start: 1 },
  { railway: 'Tokyu.Setagaya', prefix: 'SG', from: '三軒茶屋', toward: '西太子堂', start: 1 },
  { railway: 'Tokyu.Kodomonokuni', prefix: 'KD', from: '長津田', toward: '恩田', start: 1 },
  { railway: 'Tokyu.TokyuShinYokohama', prefix: 'SH', from: '新横浜', toward: '新綱島', start: 1, skip: ['日吉'] },
  { railway: 'Sotetsu.Main', prefix: 'SO', from: '横浜', toward: '平沼橋', start: 1 },
  { railway: 'Sotetsu.Izumino', prefix: 'SO', from: '南万騎が原', toward: '緑園都市', start: 31, skip: ['二俣川'] },
  { railway: 'Sotetsu.SotetsuShinYokohama', prefix: 'SO', from: '羽沢横浜国大', toward: '新横浜', start: 51, skip: ['西谷'] },
  { railway: 'YokohamaMunicipal.Blue', prefix: 'B', from: '湘南台', toward: '下飯田', start: 1 },
  { railway: 'YokohamaMunicipal.Green', prefix: 'G', from: '中山', toward: '川和町', start: 1 },
  { railway: 'MIR.TsukubaExpress', prefix: 'TX', from: '秋葉原', toward: '新御徒町', start: 1 },
  { railway: 'TokyoMonorail.HanedaAirport', prefix: 'MO', from: 'モノレール浜松町', toward: '天王洲アイル', start: 1 },
  { railway: 'TamaMonorail.TamaMonorail', prefix: 'TT', from: '多摩センター', toward: '松が谷', start: 1 },
  { railway: 'JR-East.Tokaido', prefix: 'JT', from: '東京', toward: '新橋', start: 1 },
  { railway: 'Minatomirai.Minatomirai', prefix: 'MM', from: '横浜', toward: '新高島', start: 1 },
  { railway: 'ToyoRapid.ToyoRapid', prefix: 'TR', from: '西船橋', toward: '東海神', start: 1 },
  { railway: 'Hokuso.Hokuso', prefix: 'HS', from: '新柴又', toward: '矢切', start: 1, skip: ['京成高砂'] },
];

/** 元データより後に開業・改称・振り直しがあった駅（路線 ID と駅名 → 番号） */
export const OVERRIDES: Record<string, string> = {
  'JR-East.Yamanote:高輪ゲートウェイ': 'JY26',
  'JR-East.KeihinTohokuNegishi:高輪ゲートウェイ': 'JK21',
  'Yurikamome.Yurikamome:東京国際クルーズターミナル': 'U08',
  'Yurikamome.Yurikamome:東京ビッグサイト': 'U11',
  'Keikyu.Main:花月総持寺': 'KK30',
  'Keikyu.Main:京急東神奈川': 'KK35',
  'Toei.Oedo:都庁前': 'E28',
  // 2020 年の虎ノ門ヒルズ駅の開業で、霞ケ関から北千住まで番号が 1 つずつ繰り下がった
  'TokyoMetro.Hibiya:虎ノ門ヒルズ': 'H06',
  'TokyoMetro.Hibiya:霞ケ関': 'H07',
  'TokyoMetro.Hibiya:日比谷': 'H08',
  'TokyoMetro.Hibiya:銀座': 'H09',
  'TokyoMetro.Hibiya:東銀座': 'H10',
  'TokyoMetro.Hibiya:築地': 'H11',
  'TokyoMetro.Hibiya:八丁堀': 'H12',
  'TokyoMetro.Hibiya:茅場町': 'H13',
  'TokyoMetro.Hibiya:人形町': 'H14',
  'TokyoMetro.Hibiya:小伝馬町': 'H15',
  'TokyoMetro.Hibiya:秋葉原': 'H16',
  'TokyoMetro.Hibiya:仲御徒町': 'H17',
  'TokyoMetro.Hibiya:上野': 'H18',
  'TokyoMetro.Hibiya:入谷': 'H19',
  'TokyoMetro.Hibiya:三ノ輪': 'H20',
  'TokyoMetro.Hibiya:南千住': 'H21',
  'TokyoMetro.Hibiya:北千住': 'H22',
};

/**
 * 関西の番号。N02 にも元データ（piuccio）にも関西の番号が無いので、順番に振られている路線だけ規則で付ける。
 * JR 西日本や私鉄は欠番・飛び番があるので、確かな元データが手に入るまで付けない
 */
export const KANSAI_SEQUENTIAL: SequentialRule[] = [
  { railway: 'JR-West.OsakaLoop', prefix: 'O', from: '天王寺', toward: '寺田町', start: 1 },
  { railway: 'OsakaMetro.Midosuji', prefix: 'M', from: '江坂', toward: '東三国', start: 11 },
  { railway: 'Kitakyu.NambokuLine', prefix: 'M', from: '箕面萱野', toward: '箕面船場阪大前', start: 6 },
  { railway: 'OsakaMetro.Tanimachi', prefix: 'T', from: '大日', toward: '守口', start: 11 },
  { railway: 'OsakaMetro.Yotsubashi', prefix: 'Y', from: '西梅田', toward: '肥後橋', start: 11 },
  { railway: 'OsakaMetro.Chuo', prefix: 'C', from: '夢洲', toward: 'コスモスクエア', start: 9 },
  { railway: 'OsakaMetro.Sennichimae', prefix: 'S', from: '野田阪神', toward: '玉川', start: 11 },
  { railway: 'OsakaMetro.Sakaisuji', prefix: 'K', from: '天神橋筋六丁目', toward: '扇町', start: 11 },
  { railway: 'OsakaMetro.Nagahori', prefix: 'N', from: '大正', toward: 'ドーム前千代崎', start: 11 },
  { railway: 'OsakaMetro.Imazatosuji', prefix: 'I', from: '井高野', toward: '瑞光四丁目', start: 11 },
  { railway: 'OsakaMetro.NewTram', prefix: 'P', from: 'コスモスクエア', toward: 'トレードセンター前', start: 9 },
  { railway: 'KyotoSubway.Karasuma', prefix: 'K', from: '国際会館', toward: '松ヶ崎', start: 1 },
  { railway: 'KyotoSubway.Tozai', prefix: 'T', from: '六地蔵', toward: '石田', start: 1 },
  { railway: 'KobeSubway.SeishinYamate', prefix: 'S', from: '谷上', toward: '新神戸', start: 1 },
  { railway: 'KobeSubway.Kaigan', prefix: 'K', from: '三宮・花時計前', toward: '旧居留地・大丸前', start: 1 },
];

export const KANSAI_OVERRIDES: Record<string, string> = {};

export interface NumberingStation {
  id: string;
  ja: string;
}

/**
 * 1 路線の駅に番号を付ける。戻り値は駅 ID → 番号（番号の無い駅は含めない）。
 * 優先順位: OVERRIDES → SEQUENTIAL → 元データ
 */
export function numberRailway(
  railway: string,
  stations: NumberingStation[],
  source: Map<string, string>,
  rules: SequentialRule[] = SEQUENTIAL,
  overrides: Record<string, string> = OVERRIDES,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of stations) {
    const code = source.get(s.id);
    if (code) out.set(s.id, normalizeCode(code));
  }
  const rule = rules.find((r) => r.railway === railway);
  if (rule) {
    // 環状線の重複（始点 = 終点）は除いて並べる
    const order = stations.filter((s, i) => stations.findIndex((t) => t.id === s.id) === i);
    const i0 = order.findIndex((s) => s.ja === rule.from);
    const i1 = order.findIndex((s) => s.ja === rule.toward);
    if (i0 >= 0 && i1 >= 0) {
      const step = i1 > i0 ? 1 : -1;
      let n = rule.start;
      for (let i = i0; i >= 0 && i < order.length; i += step) {
        const s = order[i]!;
        if (rule.skip?.includes(s.ja)) continue;
        out.set(s.id, `${rule.prefix}${String(n).padStart(2, '0')}`);
        n++;
      }
    }
  }
  for (const s of stations) {
    const code = overrides[`${railway}:${s.ja}`];
    if (code) out.set(s.id, code);
  }
  return out;
}

/** 番号から路線記号を取り出す: "JK26" → "JK" */
export function lineSymbol(code: string): string {
  return code.replace(/\d+$/, '');
}
