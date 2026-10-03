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
