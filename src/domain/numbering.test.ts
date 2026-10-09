import { describe, expect, it } from 'vitest';
import { lineSymbol, normalizeCode, numberRailway, type SequentialRule } from './numbering';

const st = (...names: string[]) => names.map((ja) => ({ id: `X.${ja}`, ja }));

describe('normalizeCode', () => {
  it('ハイフンを除き、数字を 2 桁にそろえる', () => {
    expect(normalizeCode('E-01')).toBe('E01');
    expect(normalizeCode('U1')).toBe('U01');
    expect(normalizeCode('KK00')).toBe('KK00');
    expect(normalizeCode('JY30')).toBe('JY30');
  });
});

describe('numberRailway', () => {
  it('元データの番号を使う', () => {
    const r = numberRailway('X', st('a', 'b'), new Map([['X.a', 'Z-1']]), [], {});
    expect(r.get('X.a')).toBe('Z01');
    expect(r.has('X.b')).toBe(false);
  });

  it('順番の規則で、指定の向きに 1 ずつ振る（逆向きの並びでも）', () => {
    const rule: SequentialRule = { railway: 'X', prefix: 'Q', from: 'c', toward: 'b', start: 1 };
    const r = numberRailway('X', st('a', 'b', 'c'), new Map(), [rule], {});
    expect([r.get('X.c'), r.get('X.b'), r.get('X.a')]).toEqual(['Q01', 'Q02', 'Q03']);
  });

  it('skip の駅は番号を付けず、数え飛ばしもしない', () => {
    const rule: SequentialRule = { railway: 'X', prefix: 'Q', from: 'a', toward: 'b', start: 31, skip: ['b'] };
    const r = numberRailway('X', st('a', 'b', 'c'), new Map(), [rule], {});
    expect(r.get('X.a')).toBe('Q31');
    expect(r.has('X.b')).toBe(false);
    expect(r.get('X.c')).toBe('Q32');
  });

  it('上書きの表が最優先', () => {
    const r = numberRailway('X', st('a'), new Map([['X.a', 'Z01']]), [], { 'X:a': 'Z99' });
    expect(r.get('X.a')).toBe('Z99');
  });
});

describe('lineSymbol', () => {
  it('番号を除いた路線記号', () => {
    expect(lineSymbol('JK26')).toBe('JK');
    expect(lineSymbol('G01')).toBe('G');
  });
});
