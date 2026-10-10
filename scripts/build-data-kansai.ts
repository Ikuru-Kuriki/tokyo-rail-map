/**
 * 国土数値情報「鉄道（N02）」の GeoJSON から、関西の路線・駅の src/data/regions/kansai/network.json を生成する。
 *
 *   NODE_USE_ENV_PROXY=1 npm run data:kansai
 *
 * 元データの zip は .cache/n02/ に保存する（2 回目からはダウンロードしない）。
 * N02 は駅と線路の形だけで、駅の並び順が無い。線路のつながりをたどって隣の駅を求め、路線ごとに並べる。
 * N02 には英語名と駅ナンバリングが無い。英語名は空、番号は src/domain/numbering.ts の関西の表から付ける。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { LonLat, Network, Place, Railway, Station } from '../src/domain/types.ts';
import { kansaiStationDepth } from '../src/domain/depth.ts';
import { KANSAI_OVERRIDES, KANSAI_SEQUENTIAL, numberRailway } from '../src/domain/numbering.ts';

const VERSION = 'N02-25';
const ZIP_URL = `https://nlftp.mlit.go.jp/ksj/gml/data/N02/${VERSION}/${VERSION}_GML.zip`;
const CACHE = new URL('../.cache/n02/', import.meta.url);
const OUT = new URL('../src/data/regions/kansai/network.json', import.meta.url);

/** 表示範囲（経度・緯度）。はみ出した部分は路線ごとに切り落とす */
const BOUNDS = { west: 134.9, east: 136.32, south: 34.15, north: 35.33 };

/**
 * 路線の表。key は「事業者名/路線名」（N02 の表記）。
 * pieces があれば、その区間（駅名 → 駅名）を元データの路線からつなげて 1 本にする（JR の愛称区間など）。
 * 無ければ元データの路線をそのまま 1 本にする（枝分かれしていたら、いちばん長い並びだけ）。
 * loop は環状線（始点と次の駅。先頭の駅を末尾にも入れる）。色は各社の路線色の目安
 */
interface LineDef {
  id: string;
  ja: string;
  en: string;
  color: string;
  key?: string;
  pieces?: [key: string, from: string, to: string][];
  /** 環状線の始点と、次の駅（並びの向き） */
  loop?: [from: string, toward: string];
}

const JRW = '西日本旅客鉄道/';
const METRO = '大阪市高速電気軌道/';
const LINES: LineDef[] = [
  // JR 西日本（アーバンネットワークの愛称区間）
  {
    id: 'JR-West.Biwako',
    ja: '琵琶湖線',
    en: 'Biwako Line',
    color: '#0072BC',
    pieces: [[JRW + '東海道線', '米原', '京都']],
  },
  {
    id: 'JR-West.Kyoto',
    ja: 'JR京都線',
    en: 'JR Kyoto Line',
    color: '#0072BC',
    pieces: [[JRW + '東海道線', '京都', '大阪']],
  },
  {
    id: 'JR-West.Kobe',
    ja: 'JR神戸線',
    en: 'JR Kobe Line',
    color: '#0072BC',
    pieces: [
      [JRW + '東海道線', '大阪', '神戸'],
      [JRW + '山陽線', '神戸', '西明石'],
    ],
  },
  { id: 'JR-West.Kosei', ja: '湖西線', en: 'Kosei Line', color: '#00A0DE', key: JRW + '湖西線' },
  { id: 'JR-West.Kusatsu', ja: '草津線', en: 'Kusatsu Line', color: '#4DB848', key: JRW + '草津線' },
  { id: 'JR-West.Nara', ja: '奈良線', en: 'Nara Line', color: '#B5793A', key: JRW + '奈良線' },
  {
    id: 'JR-West.Sagano',
    ja: '嵯峨野線',
    en: 'Sagano Line',
    color: '#A0186E',
    pieces: [[JRW + '山陰線', '京都', '園部']],
  },
  {
    id: 'JR-West.OsakaHigashi',
    ja: 'おおさか東線',
    en: 'Osaka Higashi Line',
    color: '#2B3C8E',
    key: JRW + 'おおさか東線',
  },
  {
    id: 'JR-West.Takarazuka',
    ja: 'JR宝塚線',
    en: 'JR Takarazuka Line',
    color: '#F6AA00',
    pieces: [[JRW + '福知山線', '尼崎', '篠山口']],
  },
  { id: 'JR-West.Tozai', ja: 'JR東西線', en: 'JR Tozai Line', color: '#E5508E', key: JRW + 'JR東西線' },
  { id: 'JR-West.Gakkentoshi', ja: '学研都市線', en: 'Gakkentoshi Line', color: '#E5508E', key: JRW + '片町線' },
  {
    id: 'JR-West.OsakaLoop',
    ja: '大阪環状線',
    en: 'Osaka Loop Line',
    color: '#F15A22',
    key: JRW + '大阪環状線',
    loop: ['天王寺', '寺田町'],
  },
  { id: 'JR-West.Yumesaki', ja: 'JRゆめ咲線', en: 'JR Yumesaki Line', color: '#1E3D8F', key: JRW + '桜島線' },
  {
    id: 'JR-West.Yamatoji',
    ja: '大和路線',
    en: 'Yamatoji Line',
    color: '#009A3E',
    pieces: [[JRW + '関西線', 'JR難波', '加茂']],
  },
  {
    id: 'JR-West.Hanwa',
    ja: '阪和線',
    en: 'Hanwa Line',
    color: '#F39700',
    pieces: [[JRW + '阪和線', '天王寺', '和歌山']],
  },
  {
    id: 'JR-West.HanwaBranch',
    ja: '阪和線（羽衣線）',
    en: 'Hanwa Line (Hagoromo)',
    color: '#F39700',
    pieces: [[JRW + '阪和線', '鳳', '東羽衣']],
  },
  {
    id: 'JR-West.KansaiAirport',
    ja: '関西空港線',
    en: 'Kansai Airport Line',
    color: '#1D9FD8',
    key: JRW + '関西空港線',
  },
  { id: 'JR-West.Manyo', ja: '万葉まほろば線', en: 'Man-yo Mahoroba Line', color: '#BF4A3B', key: JRW + '桜井線' },
  { id: 'JR-West.Wakayama', ja: '和歌山線', en: 'Wakayama Line', color: '#E0861B', key: JRW + '和歌山線' },
  {
    id: 'JR-West.Kisei',
    ja: '紀勢線',
    en: 'Kisei Line',
    color: '#00A7DB',
    pieces: [[JRW + '紀勢線', '和歌山市', '和歌山']],
  },
  // Osaka Metro・北大阪急行
  { id: 'OsakaMetro.Midosuji', ja: '御堂筋線', en: 'Midosuji Line', color: '#E5171F', key: METRO + '1号線(御堂筋線)' },
  { id: 'OsakaMetro.Tanimachi', ja: '谷町線', en: 'Tanimachi Line', color: '#522886', key: METRO + '2号線(谷町線)' },
  {
    id: 'OsakaMetro.Yotsubashi',
    ja: '四つ橋線',
    en: 'Yotsubashi Line',
    color: '#0078BA',
    key: METRO + '3号線(四つ橋線)',
  },
  { id: 'OsakaMetro.Chuo', ja: '中央線', en: 'Chuo Line', color: '#019A66', key: METRO + '4号線(中央線)' },
  {
    id: 'OsakaMetro.Sennichimae',
    ja: '千日前線',
    en: 'Sennichimae Line',
    color: '#E44D93',
    key: METRO + '5号線(千日前線)',
  },
  { id: 'OsakaMetro.Sakaisuji', ja: '堺筋線', en: 'Sakaisuji Line', color: '#814721', key: METRO + '6号線(堺筋線)' },
  {
    id: 'OsakaMetro.Nagahori',
    ja: '長堀鶴見緑地線',
    en: 'Nagahori Tsurumi-ryokuchi Line',
    color: '#A9CC51',
    key: METRO + '7号線(長堀鶴見緑地線)',
  },
  {
    id: 'OsakaMetro.Imazatosuji',
    ja: '今里筋線',
    en: 'Imazatosuji Line',
    color: '#EE7B1A',
    key: METRO + '8号線(今里筋線)',
  },
  { id: 'OsakaMetro.NewTram', ja: 'ニュートラム', en: 'New Tram', color: '#00A3E0', key: METRO + '南港ポートタウン線' },
  {
    id: 'Kitakyu.NambokuLine',
    ja: '北大阪急行線',
    en: 'Kita-Osaka Kyuko Line',
    color: '#E5171F',
    key: '北大阪急行電鉄/南北線',
  },
  // 京都市営地下鉄
  { id: 'KyotoSubway.Karasuma', ja: '烏丸線', en: 'Karasuma Line', color: '#3BAA53', key: '京都市/烏丸線' },
  { id: 'KyotoSubway.Tozai', ja: '東西線', en: 'Tozai Line', color: '#E8572C', key: '京都市/東西線' },
  // 神戸市営地下鉄・ポートライナー・六甲ライナー
  {
    id: 'KobeSubway.SeishinYamate',
    ja: '西神・山手線',
    en: 'Seishin-Yamate Line',
    color: '#00A54F',
    pieces: [
      ['神戸市/北神線', '谷上', '新神戸'],
      ['神戸市/山手線', '新神戸', '新長田'],
      ['神戸市/西神線', '新長田', '名谷'],
      ['神戸市/西神延伸線', '名谷', '西神中央'],
    ],
  },
  { id: 'KobeSubway.Kaigan', ja: '海岸線', en: 'Kaigan Line', color: '#0068B7', key: '神戸市/海岸線' },
  {
    id: 'KobeNewTransit.PortIsland',
    ja: 'ポートライナー',
    en: 'Port Liner',
    color: '#00AEEF',
    pieces: [['神戸新交通/ポートアイランド線', '三宮', '神戸空港']],
  },
  {
    // 中公園から北埠頭・南公園を回って市民広場へ（島内の環状部分）
    id: 'KobeNewTransit.PortIslandLoop',
    ja: 'ポートライナー（北埠頭経由）',
    en: 'Port Liner (Kita-futo)',
    color: '#00AEEF',
    pieces: [
      ['神戸新交通/ポートアイランド線', '中公園', '北埠頭'],
      ['神戸新交通/ポートアイランド線', '北埠頭', '中埠頭'],
      ['神戸新交通/ポートアイランド線', '中埠頭', '南公園'],
      ['神戸新交通/ポートアイランド線', '南公園', '市民広場'],
    ],
  },
  {
    id: 'KobeNewTransit.RokkoIsland',
    ja: '六甲ライナー',
    en: 'Rokko Liner',
    color: '#3CB4B4',
    key: '神戸新交通/六甲アイランド線',
  },
  // 阪急
  { id: 'Hankyu.Kobe', ja: '阪急神戸線', en: 'Hankyu Kobe Line', color: '#1E50A2', key: '阪急電鉄/神戸線' },
  {
    id: 'Hankyu.KobeKosoku',
    ja: '阪急神戸高速線',
    en: 'Hankyu Kobe Kosoku Line',
    color: '#1E50A2',
    key: '阪急電鉄/神戸高速線',
  },
  { id: 'Hankyu.Imazu', ja: '阪急今津線', en: 'Hankyu Imazu Line', color: '#4A7CC7', key: '阪急電鉄/今津線' },
  { id: 'Hankyu.Itami', ja: '阪急伊丹線', en: 'Hankyu Itami Line', color: '#4A7CC7', key: '阪急電鉄/伊丹線' },
  { id: 'Hankyu.Koyo', ja: '阪急甲陽線', en: 'Hankyu Koyo Line', color: '#4A7CC7', key: '阪急電鉄/甲陽線' },
  { id: 'Hankyu.Takarazuka', ja: '阪急宝塚線', en: 'Hankyu Takarazuka Line', color: '#E8791E', key: '阪急電鉄/宝塚線' },
  { id: 'Hankyu.Mino', ja: '阪急箕面線', en: 'Hankyu Mino Line', color: '#F0A35E', key: '阪急電鉄/箕面線' },
  {
    // 大阪梅田 - 十三は線路の上では宝塚線だが、京都線の電車は大阪梅田から出る
    id: 'Hankyu.Kyoto',
    ja: '阪急京都線',
    en: 'Hankyu Kyoto Line',
    color: '#2E8B3E',
    pieces: [
      ['阪急電鉄/宝塚線', '大阪梅田', '十三'],
      ['阪急電鉄/京都線', '十三', '京都河原町'],
    ],
  },
  { id: 'Hankyu.Senri', ja: '阪急千里線', en: 'Hankyu Senri Line', color: '#5BAE5F', key: '阪急電鉄/千里線' },
  { id: 'Hankyu.Arashiyama', ja: '阪急嵐山線', en: 'Hankyu Arashiyama Line', color: '#5BAE5F', key: '阪急電鉄/嵐山線' },
  // 阪神
  { id: 'Hanshin.Main', ja: '阪神本線', en: 'Hanshin Main Line', color: '#005BAC', key: '阪神電気鉄道/本線' },
  {
    id: 'Hanshin.Namba',
    ja: '阪神なんば線',
    en: 'Hanshin Namba Line',
    color: '#F08300',
    key: '阪神電気鉄道/阪神なんば線',
  },
  {
    id: 'Hanshin.Mukogawa',
    ja: '阪神武庫川線',
    en: 'Hanshin Mukogawa Line',
    color: '#2EAA66',
    key: '阪神電気鉄道/武庫川線',
  },
  {
    id: 'Hanshin.KobeKosoku',
    ja: '阪神神戸高速線',
    en: 'Hanshin Kobe Kosoku Line',
    color: '#005BAC',
    key: '阪神電気鉄道/神戸高速線',
  },
  // 京阪
  {
    id: 'Keihan.Main',
    ja: '京阪本線・鴨東線',
    en: 'Keihan Main Line',
    color: '#0D7D4C',
    pieces: [
      ['京阪電気鉄道/京阪本線', '淀屋橋', '三条'],
      ['京阪電気鉄道/鴨東線', '三条', '出町柳'],
    ],
  },
  {
    id: 'Keihan.Nakanoshima',
    ja: '京阪中之島線',
    en: 'Keihan Nakanoshima Line',
    color: '#0D7D4C',
    key: '京阪電気鉄道/中之島線',
  },
  { id: 'Keihan.Katano', ja: '京阪交野線', en: 'Keihan Katano Line', color: '#4FA36F', key: '京阪電気鉄道/交野線' },
  { id: 'Keihan.Uji', ja: '京阪宇治線', en: 'Keihan Uji Line', color: '#4FA36F', key: '京阪電気鉄道/宇治線' },
  { id: 'Keihan.Keishin', ja: '京阪京津線', en: 'Keihan Keishin Line', color: '#2F9FB0', key: '京阪電気鉄道/京津線' },
  {
    id: 'Keihan.IshiyamaSakamoto',
    ja: '石山坂本線',
    en: 'Ishiyama Sakamoto Line',
    color: '#2F9FB0',
    key: '京阪電気鉄道/石山坂本線',
  },
  // 近鉄
  {
    id: 'Kintetsu.Nara',
    ja: '近鉄奈良線',
    en: 'Kintetsu Nara Line',
    color: '#E86E1E',
    pieces: [
      ['近畿日本鉄道/難波線', '大阪難波', '大阪上本町'],
      ['近畿日本鉄道/大阪線', '大阪上本町', '布施'],
      ['近畿日本鉄道/奈良線', '布施', '近鉄奈良'],
    ],
  },
  { id: 'Kintetsu.Osaka', ja: '近鉄大阪線', en: 'Kintetsu Osaka Line', color: '#C9302C', key: '近畿日本鉄道/大阪線' },
  { id: 'Kintetsu.Shigi', ja: '近鉄信貴線', en: 'Kintetsu Shigi Line', color: '#D9706D', key: '近畿日本鉄道/信貴線' },
  { id: 'Kintetsu.Kyoto', ja: '近鉄京都線', en: 'Kintetsu Kyoto Line', color: '#1E8F5A', key: '近畿日本鉄道/京都線' },
  {
    // 新ノ口 - 八木西口の連絡線を通らないよう、大和八木で区切る
    id: 'Kintetsu.Kashihara',
    ja: '近鉄橿原線',
    en: 'Kintetsu Kashihara Line',
    color: '#5C9F3C',
    pieces: [
      ['近畿日本鉄道/橿原線', '大和西大寺', '大和八木'],
      ['近畿日本鉄道/橿原線', '大和八木', '橿原神宮前'],
    ],
  },
  { id: 'Kintetsu.Tenri', ja: '近鉄天理線', en: 'Kintetsu Tenri Line', color: '#86B754', key: '近畿日本鉄道/天理線' },
  {
    id: 'Kintetsu.Keihanna',
    ja: '近鉄けいはんな線',
    en: 'Kintetsu Keihanna Line',
    color: '#2BA5A0',
    key: '近畿日本鉄道/けいはんな線',
  },
  { id: 'Kintetsu.Ikoma', ja: '近鉄生駒線', en: 'Kintetsu Ikoma Line', color: '#8C6BB1', key: '近畿日本鉄道/生駒線' },
  {
    id: 'Kintetsu.Tawaramoto',
    ja: '近鉄田原本線',
    en: 'Kintetsu Tawaramoto Line',
    color: '#8C6BB1',
    key: '近畿日本鉄道/田原本線',
  },
  {
    id: 'Kintetsu.MinamiOsaka',
    ja: '近鉄南大阪線',
    en: 'Kintetsu Minami-Osaka Line',
    color: '#2C6FB7',
    key: '近畿日本鉄道/南大阪線',
  },
  {
    id: 'Kintetsu.Yoshino',
    ja: '近鉄吉野線',
    en: 'Kintetsu Yoshino Line',
    color: '#5C8FCB',
    key: '近畿日本鉄道/吉野線',
  },
  { id: 'Kintetsu.Nagano', ja: '近鉄長野線', en: 'Kintetsu Nagano Line', color: '#5C8FCB', key: '近畿日本鉄道/長野線' },
  {
    id: 'Kintetsu.Domyoji',
    ja: '近鉄道明寺線',
    en: 'Kintetsu Domyoji Line',
    color: '#5C8FCB',
    key: '近畿日本鉄道/道明寺線',
  },
  { id: 'Kintetsu.Gose', ja: '近鉄御所線', en: 'Kintetsu Gose Line', color: '#5C8FCB', key: '近畿日本鉄道/御所線' },
  // 南海・泉北
  { id: 'Nankai.Main', ja: '南海本線', en: 'Nankai Main Line', color: '#1F64B4', key: '南海電気鉄道/南海本線' },
  { id: 'Nankai.Airport', ja: '南海空港線', en: 'Nankai Airport Line', color: '#7F4FA8', key: '南海電気鉄道/空港線' },
  {
    id: 'Nankai.Takashinohama',
    ja: '南海高師浜線',
    en: 'Nankai Takashinohama Line',
    color: '#5A8FD0',
    key: '南海電気鉄道/高師浜線',
  },
  {
    id: 'Nankai.Tanagawa',
    ja: '南海多奈川線',
    en: 'Nankai Tanagawa Line',
    color: '#5A8FD0',
    key: '南海電気鉄道/多奈川線',
  },
  { id: 'Nankai.Kada', ja: '南海加太線', en: 'Nankai Kada Line', color: '#5A8FD0', key: '南海電気鉄道/加太線' },
  {
    id: 'Nankai.WakayamaKo',
    ja: '南海和歌山港線',
    en: 'Nankai Wakayamako Line',
    color: '#5A8FD0',
    key: '南海電気鉄道/和歌山港線',
  },
  { id: 'Nankai.Koya', ja: '南海高野線', en: 'Nankai Koya Line', color: '#1B9A4C', key: '南海電気鉄道/高野線' },
  { id: 'Nankai.Semboku', ja: '泉北線', en: 'Semboku Line', color: '#0090C8', key: '南海電気鉄道/泉北線' },
  // その他の私鉄・モノレール
  { id: 'Sanyo.Main', ja: '山陽電車本線', en: 'Sanyo Main Line', color: '#D7171F', key: '山陽電気鉄道/本線' },
  { id: 'Shintetsu.Arima', ja: '神鉄有馬線', en: 'Shintetsu Arima Line', color: '#E2422C', key: '神戸電鉄/有馬線' },
  { id: 'Shintetsu.Sanda', ja: '神鉄三田線', en: 'Shintetsu Sanda Line', color: '#E2422C', key: '神戸電鉄/三田線' },
  {
    id: 'Shintetsu.KoenToshi',
    ja: '神鉄公園都市線',
    en: 'Shintetsu Koen-Toshi Line',
    color: '#EE8572',
    key: '神戸電鉄/公園都市線',
  },
  { id: 'Shintetsu.Ao', ja: '神鉄粟生線', en: 'Shintetsu Ao Line', color: '#EE8572', key: '神戸電鉄/粟生線' },
  {
    id: 'Shintetsu.KobeKosoku',
    ja: '神鉄神戸高速線',
    en: 'Shintetsu Kobe Kosoku Line',
    color: '#E2422C',
    key: '神戸電鉄/神戸高速線',
  },
  { id: 'Nose.Myoken', ja: '能勢電鉄妙見線', en: 'Nose Myoken Line', color: '#8E2F45', key: '能勢電鉄/妙見線' },
  { id: 'Nose.Nissei', ja: '能勢電鉄日生線', en: 'Nose Nissei Line', color: '#8E2F45', key: '能勢電鉄/日生線' },
  {
    id: 'OsakaMonorail.Main',
    ja: '大阪モノレール',
    en: 'Osaka Monorail',
    color: '#1C4EA0',
    key: '大阪モノレール/大阪モノレール線',
  },
  {
    id: 'OsakaMonorail.Saito',
    ja: '大阪モノレール彩都線',
    en: 'Osaka Monorail Saito Line',
    color: '#4C7CC8',
    key: '大阪モノレール/国際文化公園都市モノレール線(彩都線)',
  },
  { id: 'Eiden.Eizan', ja: '叡山本線', en: 'Eizan Main Line', color: '#C3423F', key: '叡山電鉄/叡山本線' },
  { id: 'Eiden.Kurama', ja: '叡山電鉄鞍馬線', en: 'Eiden Kurama Line', color: '#C3423F', key: '叡山電鉄/鞍馬線' },
  {
    id: 'Randen.Arashiyama',
    ja: '嵐電嵐山本線',
    en: 'Randen Arashiyama Line',
    color: '#8C3A8E',
    key: '京福電気鉄道/嵐山本線',
  },
  { id: 'Randen.Kitano', ja: '嵐電北野線', en: 'Randen Kitano Line', color: '#8C3A8E', key: '京福電気鉄道/北野線' },
  { id: 'Mizuma.Mizuma', ja: '水間線', en: 'Mizuma Line', color: '#3E8DC9', key: '水間鉄道/水間線' },
  { id: 'Wakayama.Kishigawa', ja: '貴志川線', en: 'Kishigawa Line', color: '#D9524A', key: '和歌山電鐵/貴志川線' },
];

/**
 * 駅名は違うが、歩いて乗り換えられる駅（駅名の組。乗換のまとまりの中で別の配列にする）。
 * 同じ名前で近い駅（難波など）は自動でつなぐ
 */
const WALKS: string[][] = [
  ['大阪', '梅田', '大阪梅田', '東梅田', '西梅田', '北新地'],
  ['難波', '大阪難波', 'JR難波'],
  ['三ノ宮', '三宮', '神戸三宮', '三宮・花時計前'],
  ['元町', '西元町'],
  ['天王寺', '大阪阿部野橋'],
  ['谷町九丁目', '大阪上本町'],
  ['日本橋', '近鉄日本橋'],
  ['新今宮', '動物園前'],
  ['烏丸', '四条'],
  ['京都河原町', '祇園四条'],
  ['三条', '三条京阪'],
  ['京阪山科', '山科'],
  ['南森町', '大阪天満宮'],
  ['大阪城北詰', '天満橋'],
  ['大阪ビジネスパーク', '大阪城公園'],
  ['京橋', '大阪ビジネスパーク'],
  ['心斎橋', '四ツ橋'],
  ['新開地', '湊川'],
  ['湊川', '湊川公園'],
  ['ドーム前', 'ドーム前千代崎'],
];

/** 同じ名前の駅をまとめる距離（m） */
const SAME_NAME_METERS = 800;

// ---------------------------------------------------------------- 元データ

interface Feature {
  properties: Record<string, string>;
  geometry: { type: 'LineString'; coordinates: LonLat[] } | { type: 'MultiLineString'; coordinates: LonLat[][] };
}

function load(name: string): Feature[] {
  const dir = new URL(`${VERSION}_GML/UTF-8/`, CACHE);
  const file = new URL(`${VERSION}_${name}.geojson`, dir);
  return (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features;
}

async function download() {
  const zip = new URL(`${VERSION}_GML.zip`, CACHE);
  if (!existsSync(zip)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error(`${ZIP_URL}: ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const geo = new URL(`${VERSION}_GML/UTF-8/${VERSION}_Station.geojson`, CACHE);
  if (!existsSync(geo))
    execFileSync('unzip', ['-oq', zip.pathname, `${VERSION}_GML/UTF-8/*.geojson`, '-d', CACHE.pathname]);
}

const lines = (f: Feature): LonLat[][] =>
  f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
const nodeKey = (c: LonLat) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`;
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const inBounds = ([lon, lat]: LonLat) =>
  lon >= BOUNDS.west && lon <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north;

function meters(a: LonLat, b: LonLat) {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = b[1] - a[1];
  return Math.hypot(x, y) * k * 6371000;
}

// ---------------------------------------------------------------- 路線ごとの駅のつながり

interface SrcStation {
  name: string;
  group: string;
  coord: LonLat;
  nodes: string[];
}

interface SrcLine {
  stations: Map<string, SrcStation>;
  /** 駅名 → 隣の駅名 */
  adjacent: Map<string, Set<string>>;
}

function buildLine(sections: Feature[], stationFeatures: Feature[]): SrcLine {
  const edges = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  };
  for (const f of [...sections, ...stationFeatures])
    for (const l of lines(f)) for (let i = 1; i < l.length; i++) link(nodeKey(l[i - 1]!), nodeKey(l[i]!));

  // 同じ駅名の地物（ホームが複数など）は 1 駅にまとめる
  const stations = new Map<string, SrcStation>();
  for (const f of stationFeatures) {
    const name = f.properties.N02_005!;
    const pts = lines(f).flat();
    const s = stations.get(name) ?? { name, group: f.properties.N02_005g!, coord: [0, 0], nodes: [] };
    s.nodes.push(...pts.map(nodeKey));
    stations.set(name, s);
  }
  const owner = new Map<string, string>();
  for (const s of stations.values()) {
    for (const n of s.nodes) owner.set(n, s.name);
    // 代表点は地物の点の平均
    const pts = s.nodes.map((n) => n.split(',').map(Number) as LonLat);
    s.coord = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }

  // 駅から線路をたどり、最初に着いた別の駅を隣の駅とする
  const adjacent = new Map<string, Set<string>>([...stations.keys()].map((n) => [n, new Set<string>()]));
  for (const s of stations.values()) {
    const seen = new Set(s.nodes);
    const queue = [...s.nodes];
    while (queue.length) {
      const n = queue.shift()!;
      for (const m of edges.get(n) ?? []) {
        if (seen.has(m)) continue;
        seen.add(m);
        const o = owner.get(m);
        if (o && o !== s.name) {
          adjacent.get(s.name)!.add(o);
          adjacent.get(o)!.add(s.name);
        } else queue.push(m);
      }
    }
  }
  return { stations, adjacent };
}

/** 駅名 from から to までの最短の駅の並び */
function pathBetween(line: SrcLine, from: string, to: string, label: string): string[] {
  if (!line.stations.has(from) || !line.stations.has(to)) throw new Error(`${label}: ${from} / ${to} not found`);
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const m of line.adjacent.get(n)!)
      if (!prev.has(m)) {
        prev.set(m, n);
        queue.push(m);
      }
  }
  if (!prev.has(to)) throw new Error(`${label}: no path ${from} → ${to}`);
  const out: string[] = [];
  for (let n: string | null = to; n !== null; n = prev.get(n)!) out.unshift(n);
  return out;
}

/** 枝分かれを含む路線で、いちばん長い駅の並び（木の直径）。残りの駅は報告する */
function longestPath(line: SrcLine, label: string): string[] {
  const farthest = (start: string) => {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    let last = start;
    while (queue.length) {
      const n = queue.shift()!;
      last = n;
      for (const m of line.adjacent.get(n)!)
        if (!dist.has(m)) {
          dist.set(m, dist.get(n)! + 1);
          queue.push(m);
        }
    }
    return last;
  };
  const first = line.stations.keys().next().value!;
  const a = farthest(first);
  const b = farthest(a);
  const path = pathBetween(line, a, b, label);
  const left = [...line.stations.keys()].filter((n) => !path.includes(n));
  if (left.length) console.warn(`${label}: 並びに入らなかった駅 ${left.join('・')}`);
  return path;
}

/** 環状線の駅の並び。どの駅も隣が 2 つであることを確かめて、ひと回りたどる */
function cycle(line: SrcLine, [first, second]: [string, string], label: string): string[] {
  const odd = [...line.adjacent].filter(([, m]) => m.size !== 2).map(([n]) => n);
  if (odd.length) throw new Error(`${label}: not a simple loop (${odd.join('・')})`);
  if (!line.adjacent.get(first)?.has(second)) throw new Error(`${label}: ${first} - ${second} are not adjacent`);
  const out = [first];
  let prev = first;
  let cur = second;
  while (cur !== first) {
    out.push(cur);
    const next = [...line.adjacent.get(cur)!].find((n) => n !== prev)!;
    prev = cur;
    cur = next;
  }
  if (out.length !== line.stations.size) throw new Error(`${label}: loop misses stations`);
  return out;
}

// ---------------------------------------------------------------- 生成

await download();
const sectionFeatures = load('RailroadSection');
const stationFeatures = load('Station');
const keyOf = (f: Feature) => `${f.properties.N02_004}/${f.properties.N02_003}`;
const byKey = <T extends Feature>(fs: T[]) => {
  const m = new Map<string, T[]>();
  for (const f of fs) m.set(keyOf(f), [...(m.get(keyOf(f)) ?? []), f]);
  return m;
};
const sectionsByKey = byKey(sectionFeatures);
const stationsByKey = byKey(stationFeatures);
const srcLines = new Map<string, SrcLine>();
function srcLine(key: string): SrcLine {
  if (!srcLines.has(key)) {
    if (!stationsByKey.has(key)) throw new Error(`${key}: not in ${VERSION}`);
    srcLines.set(key, buildLine(sectionsByKey.get(key) ?? [], stationsByKey.get(key)!));
  }
  return srcLines.get(key)!;
}

const railways: Railway[] = [];
const stations: Station[] = [];
/** 駅 ID → N02 の駅グループコード（同じ構内の駅） */
const groupOf = new Map<string, string>();

for (const def of LINES) {
  // [元データの路線, 駅名] の並び
  let seq: [SrcLine, string][] = [];
  for (const [key, from, to] of def.pieces ?? [[def.key!, '', '']]) {
    const line = srcLine(key);
    const names = from
      ? pathBetween(line, from, to, def.id)
      : def.loop
        ? cycle(line, def.loop, def.id)
        : longestPath(line, def.id);
    for (const n of names) if (seq.at(-1)?.[1] !== n) seq.push([line, n]);
  }
  // 範囲内で連続する駅のうち、いちばん長い区間だけを残す
  let best: typeof seq = [];
  let run: typeof seq = [];
  for (const item of seq) {
    if (inBounds(item[0].stations.get(item[1])!.coord)) {
      run.push(item);
      if (run.length > best.length) best = run;
    } else run = [];
  }
  if (best.length < 2) {
    console.warn(`${def.id}: 範囲内の駅が足りないので外した`);
    continue;
  }
  seq = best;
  const ids = seq.map(([, name], i) => `${def.id}.${String(i + 1).padStart(2, '0')}`);
  const codes = numberRailway(
    def.id,
    seq.map(([, name], i) => ({ id: ids[i]!, ja: name })),
    new Map(),
    KANSAI_SEQUENTIAL,
    KANSAI_OVERRIDES,
  );
  seq.forEach(([line, name], i) => {
    const src = line.stations.get(name)!;
    const id = ids[i]!;
    groupOf.set(id, src.group);
    stations.push({
      id,
      railway: def.id,
      ja: name,
      en: '',
      coord: [round(src.coord[0]), round(src.coord[1])],
      depth: kansaiStationDepth(def.id, name),
      ...(codes.has(id) ? { code: codes.get(id)! } : {}),
    });
  });
  railways.push({
    id: def.id,
    ja: def.ja,
    en: def.en,
    color: def.color,
    stations: def.loop ? [...ids, ids[0]!] : ids,
  });
}

// 乗換のまとまり。同じ構内（N02 の駅グループ、または同じ名前で近い駅）を内側の配列に、
// 歩いて乗り換える駅（WALKS）を同じまとまりの別の配列にする
const parent = new Map(stations.map((s) => [s.id, s.id]));
const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
const union = (a: string, b: string) => parent.set(find(a), find(b));
const inner = new Map(stations.map((s) => [s.id, s.id]));
const findInner = (x: string): string =>
  inner.get(x) === x ? x : (inner.set(x, findInner(inner.get(x)!)), inner.get(x)!);
const unionInner = (a: string, b: string) => {
  inner.set(findInner(a), findInner(b));
  union(a, b);
};

const byGroup = new Map<string, Station[]>();
for (const s of stations) byGroup.set(groupOf.get(s.id)!, [...(byGroup.get(groupOf.get(s.id)!) ?? []), s]);
for (const g of byGroup.values()) for (const s of g.slice(1)) unionInner(g[0]!.id, s.id);
const byName = new Map<string, Station[]>();
for (const s of stations) byName.set(s.ja, [...(byName.get(s.ja) ?? []), s]);
for (const g of byName.values())
  for (let i = 0; i < g.length; i++)
    for (let j = i + 1; j < g.length; j++)
      if (meters(g[i]!.coord, g[j]!.coord) < SAME_NAME_METERS && findInner(g[i]!.id) !== findInner(g[j]!.id))
        union(g[i]!.id, g[j]!.id);
for (const names of WALKS) {
  const members = names.flatMap((n) => byName.get(n) ?? []);
  const missing = names.filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`walk ${names.join('↔')}: ${missing.join('・')} not found`);
  // 名前ごとに近いものだけ（同じ名前の遠い駅をつながない）
  const anchor = members[0]!;
  for (const s of members.slice(1)) if (meters(anchor.coord, s.coord) < 1500) union(anchor.id, s.id);
}

const transferMap = new Map<string, Map<string, string[]>>();
for (const s of stations) {
  const root = find(s.id);
  const sub = transferMap.get(root) ?? new Map<string, string[]>();
  const k = findInner(s.id);
  sub.set(k, [...(sub.get(k) ?? []), s.id]);
  transferMap.set(root, sub);
}
const transfers = [...transferMap.values()].map((sub) => [...sub.values()]);

// 検索・表示の単位（place）は、乗換のまとまりを駅名ごとに分けたもの
const stationById = new Map(stations.map((s) => [s.id, s]));
const places: Place[] = [];
for (const t of transfers) {
  const group = new Map<string, Station[]>();
  for (const id of t.flat()) {
    const s = stationById.get(id)!;
    group.set(s.ja, [...(group.get(s.ja) ?? []), s]);
  }
  for (const members of group.values()) {
    const first = members[0]!;
    places.push({
      id: first.id,
      ja: first.ja,
      en: first.en,
      coord: [
        round(members.reduce((a, s) => a + s.coord[0], 0) / members.length),
        round(members.reduce((a, s) => a + s.coord[1], 0) / members.length),
      ],
      stations: members.map((s) => s.id),
      lines: new Set(t.flat().map((id) => stationById.get(id)!.railway)).size,
    });
  }
}

// 番号の規則の駅名が実データにあるか確かめる
for (const rule of KANSAI_SEQUENTIAL) {
  const names = new Set(stations.filter((s) => s.railway === rule.railway).map((s) => s.ja));
  if (!names.has(rule.from) || !names.has(rule.toward))
    throw new Error(`numbering rule for ${rule.railway}: ${rule.from} / ${rule.toward} not found`);
}

const network: Network = { railways, stations, places, transfers };
mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(network));
console.log(
  `railways: ${railways.length}, stations: ${stations.length}, places: ${places.length}, numbered: ${stations.filter((s) => s.code).length}`,
);
