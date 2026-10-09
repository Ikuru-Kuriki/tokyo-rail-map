/**
 * 終電計算用の時刻表（scripts/build-timetable.ts が生成）。
 * 列指向の配列で持つ。i 番目の区間 = 1 本の列車が駅 from[i] を dep[i] に出て、次の停車駅 to[i] に arr[i] に着く。
 * 時刻は「営業日の分」（0:30 は 24*60+30）。区間は dep の昇順。
 */
export interface Timetable {
  /** 駅 ID の一覧（from / to はこの添字） */
  stations: string[];
  /** 列車の行き先（駅名）。train はこの添字 */
  destinations: string[];
  from: number[];
  to: number[];
  dep: number[];
  arr: number[];
  train: number[];
  /** 同じ列車（直通先を含む）の次の区間。無ければ -1 */
  next: number[];
  /** 分割する列車のもう一方の次の区間。無ければ -1 */
  next2: number[];
}

export type DayType = 'weekday' | 'holiday';

/**
 * シミュレーション用の 1 日分の時刻表。1 時間ごとのファイル（DayChunk）と、共通の索引（DayIndex）に分ける。
 * 時刻は「営業日の分」。trip は列車の番号で、直通運転でつながる列車は同じ番号になる。
 */
export interface DayIndex {
  /** 駅 ID の一覧（DayChunk の from / to はこの添字） */
  stations: string[];
  /** 列車の行き先（駅名）の一覧 */
  destinations: string[];
  /** trip ごとの行き先（destinations の添字） */
  tripDest: number[];
  /** ファイルがある時（営業日の時。4〜26） */
  hours: number[];
}

/** ある 1 時間に発車する区間（dep の昇順） */
export interface DayChunk {
  from: number[];
  to: number[];
  dep: number[];
  arr: number[];
  trip: number[];
}
