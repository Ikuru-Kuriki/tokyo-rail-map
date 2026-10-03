/** 経度・緯度 */
export type LonLat = [number, number];

export interface Railway {
  id: string;
  ja: string;
  en: string;
  color: string;
  /** 走行順の駅 ID（路線ごとの駅） */
  stations: string[];
}

/** 路線ごとの駅（同じ駅でも路線が違えば別のもの） */
export interface Station {
  id: string;
  railway: string;
  ja: string;
  en: string;
  coord: LonLat;
}

/** 同じ名前の駅の集まり。検索や表示の単位 */
export interface Place {
  id: string;
  ja: string;
  en: string;
  coord: LonLat;
  stations: string[];
  /** 乗換できる路線の数（ラベル表示の優先度に使う） */
  lines: number;
}

/**
 * 乗換できる駅のまとまり。内側の配列は同じ構内の駅で、
 * 別の配列の駅へは徒歩連絡（例: 有楽町 ↔ 日比谷）
 */
export type TransferGroup = string[][];

export interface Network {
  railways: Railway[];
  stations: Station[];
  places: Place[];
  transfers: TransferGroup[];
}
