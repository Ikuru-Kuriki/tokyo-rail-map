import type { Network } from './types';

/**
 * テスト用の小さな路線網。
 *   A線: a1 - a2 - a3 - a4
 *   B線: b1 - b2(=a3と同じ構内) - b3
 *   C線（環状）: c1 - c2 - c3 - c4 - c1
 *   D線: d1 - d2（どこともつながらない）
 */
export const fixture: Network = {
  railways: [
    { id: 'A', ja: 'A線', en: 'A Line', color: '#f00', stations: ['A.1', 'A.2', 'A.3', 'A.4'] },
    { id: 'B', ja: 'B線', en: 'B Line', color: '#0f0', stations: ['B.1', 'B.2', 'B.3'] },
    { id: 'C', ja: 'C線', en: 'C Line', color: '#00f', stations: ['C.1', 'C.2', 'C.3', 'C.4', 'C.1'] },
    { id: 'D', ja: 'D線', en: 'D Line', color: '#000', stations: ['D.1', 'D.2'] },
  ],
  stations: [
    { id: 'A.1', railway: 'A', ja: 'エー1', en: 'A1', coord: [139.0, 35.0] },
    { id: 'A.2', railway: 'A', ja: 'エー2', en: 'A2', coord: [139.01, 35.0] },
    { id: 'A.3', railway: 'A', ja: '中央', en: 'Chuo', coord: [139.02, 35.0] },
    { id: 'A.4', railway: 'A', ja: 'エー4', en: 'A4', coord: [139.03, 35.0] },
    { id: 'B.1', railway: 'B', ja: 'ビー1', en: 'B1', coord: [139.02, 35.01] },
    { id: 'B.2', railway: 'B', ja: '中央', en: 'Chuo', coord: [139.02, 35.0] },
    { id: 'B.3', railway: 'B', ja: 'ビー3', en: 'B3', coord: [139.02, 34.99] },
    { id: 'C.1', railway: 'C', ja: 'シー1', en: 'C1', coord: [139.1, 35.0] },
    { id: 'C.2', railway: 'C', ja: 'シー2', en: 'C2', coord: [139.11, 35.0] },
    { id: 'C.3', railway: 'C', ja: 'シー3', en: 'C3', coord: [139.11, 35.01] },
    { id: 'C.4', railway: 'C', ja: 'シー4', en: 'C4', coord: [139.1, 35.01] },
    { id: 'D.1', railway: 'D', ja: 'ディー1', en: 'D1', coord: [139.5, 35.0] },
    { id: 'D.2', railway: 'D', ja: 'ディー2', en: 'D2', coord: [139.51, 35.0] },
  ],
  places: [],
  transfers: [[['A.3', 'B.2']]],
};

for (const s of fixture.stations) {
  if (s.id === 'B.2') continue;
  fixture.places.push({
    id: s.id,
    ja: s.ja,
    en: s.en,
    coord: s.coord,
    stations: s.id === 'A.3' ? ['A.3', 'B.2'] : [s.id],
    lines: s.id === 'A.3' ? 2 : 1,
  });
}
