import { describe, expect, it } from 'vitest';
import { addToHistory } from './history';

describe('addToHistory', () => {
  it('新しいものを先頭に入れる', () => {
    expect(addToHistory(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('同じ駅は先頭に移すだけ', () => {
    expect(addToHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('上限を超えたら古いものから消す', () => {
    expect(addToHistory(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
