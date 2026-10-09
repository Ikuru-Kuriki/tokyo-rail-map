/** 最近使った駅（place ID）の一覧に追加する。新しいものを先頭に、重複は除き、max 件まで */
export function addToHistory(list: string[], id: string, max = 8): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}
