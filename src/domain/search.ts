import type { Place } from './types';

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-ー・]/g, '');

/** ひらがな 1 文字 → ローマ字（ヘボン式） */
// prettier-ignore
const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
  // 駅名の「ヶ」（霞ヶ関など）は「が」と読む
  ヶ: 'ga',
};

/** 拗音の小さい「ゃゅょ」 */
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

const KANA_RE = /[ぁ-ゖァ-ヺ]/;

/** カタカナをひらがなにする（ヶ・長音記号はそのまま） */
const toHiragana = (s: string) => s.replace(/[ァ-ヵ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 仮名をローマ字にする（ヘボン式）。仮名以外の文字はそのまま残す */
export function kanaToRomaji(input: string): string {
  const s = toHiragana(input);
  let out = '';
  let sokuon = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === 'っ') {
      sokuon = true;
      continue;
    }
    const next = s[i + 1];
    const base = KANA[c];
    let r: string;
    if (next && SMALL_Y[next] && base && base.length > 1 && base.endsWith('i')) {
      // 拗音: きゃ → kya、しゃ → sha、ちょ → cho、じゅ → ju
      r = /(sh|ch|j)i$/.test(base) ? base.slice(0, -1) + SMALL_Y[next] : base.slice(0, -1) + 'y' + SMALL_Y[next];
      i++;
    } else if (c === 'ー') {
      // 長音記号は直前の母音を伸ばす
      r = out.slice(-1);
    } else {
      r = base ?? c;
    }
    if (sokuon && /^[a-z]/.test(r) && !/^[aiueo]/.test(r)) {
      // 促音は子音を重ねる。っち は tchi
      out += r.startsWith('ch') ? 't' : r[0];
    }
    sokuon = false;
    out += r;
  }
  return out;
}

/**
 * ローマ字の表記ゆれをそろえる。長音記号（ō）・記号・空白を外し、続く同じ母音や ou・ei を 1 文字にし、
 * b・p・m の前の m を n にする（Shimbashi と しんばし、Tokyo と とうきょう を同じにする）
 */
export function foldRomaji(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/m(?=[bpm])/g, 'n')
    .replace(/tch/g, 'cch')
    .replace(/([aiueo])\1+/g, '$1')
    .replace(/ou/g, 'o')
    .replace(/ei/g, 'e');
}

/** 英語の駅名をそろえた形（入力のたびに作り直さないように覚えておく） */
const foldedCache = new Map<string, string>();
const foldedEn = (en: string) => {
  let v = foldedCache.get(en);
  if (v === undefined) foldedCache.set(en, (v = foldRomaji(en)));
  return v;
};

/**
 * 駅名（日本語・ローマ字）で前方一致 → 部分一致の順に探す。乗換駅が多い駅を先にする。
 * 仮名（スマホのキーボードで変換せずに確定した「しぶや」など）は、ローマ字にして英語の駅名と比べる
 */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const qr = KANA_RE.test(query) ? foldRomaji(kanaToRomaji(query)) : '';
  const scored: [number, Place][] = [];
  for (const p of places) {
    const ja = normalize(p.ja);
    const en = normalize(p.en);
    let score: number;
    if (ja === q || en === q) score = 0;
    else if (ja.startsWith(q) || en.startsWith(q)) score = 1;
    else if (ja.includes(q) || en.includes(q)) score = 2;
    else if (qr) {
      const er = foldedEn(p.en);
      if (er === qr) score = 0;
      else if (er.startsWith(qr)) score = 1;
      else if (er.includes(qr)) score = 2;
      else continue;
    } else continue;
    scored.push([score * 100 - p.lines, p]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, p]) => p);
}
