import { describe, expect, it } from 'vitest';
import { foldRomaji, kanaToRomaji, searchPlaces } from './search';
import real from '../data/network.json';
import type { Network } from './types';

const network = real as unknown as Network;
const first = (q: string) => searchPlaces(network.places, q)[0]?.ja;

describe('kanaToRomaji', () => {
  it('ヘボン式にする（拗音・促音・ん・長音記号）', () => {
    expect(kanaToRomaji('しぶや')).toBe('shibuya');
    expect(kanaToRomaji('とうきょう')).toBe('toukyou');
    expect(kanaToRomaji('じゅうじょう')).toBe('juujou');
    expect(kanaToRomaji('はっちょうぼり')).toBe('hatchoubori');
    expect(kanaToRomaji('しっぷ')).toBe('shippu');
    expect(kanaToRomaji('ゲートウェイ')).toBe('geetouei');
  });
});

describe('foldRomaji', () => {
  it('長音記号・ou・m の表記ゆれをそろえる', () => {
    expect(foldRomaji('Keiō-hachiōji')).toBe(foldRomaji(kanaToRomaji('けいおうはちおうじ')));
    expect(foldRomaji('Shimbashi')).toBe(foldRomaji(kanaToRomaji('しんばし')));
    expect(foldRomaji('Tokyo')).toBe(foldRomaji(kanaToRomaji('とうきょう')));
  });
});

describe('searchPlaces（仮名）', () => {
  it.each([
    ['しぶや', '渋谷'],
    ['とうきょう', '東京'],
    ['しんばし', '新橋'],
    ['おおかやま', '大岡山'],
    ['シナガワ', '品川'],
    ['しんじゅく', '新宿'],
    ['じんぼうちょう', '神保町'],
    ['かすみがせき', '霞ケ関'],
    ['はっちょうぼり', '八丁堀'],
    ['けいきゅうかまた', '京急蒲田'],
  ])('%s → %s', (q, ja) => {
    expect(first(q)).toBe(ja);
  });

  it('打ちかけ（前方一致）でも候補が出る', () => {
    expect(searchPlaces(network.places, 'しぶ').map((p) => p.ja)).toContain('渋谷');
  });

  it('漢字・ローマ字の検索は今まで通り', () => {
    expect(first('渋谷')).toBe('渋谷');
    expect(first('shibuya')).toBe('渋谷');
  });
});
