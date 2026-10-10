import { useSyncExternalStore } from 'react';
import { addToHistory } from '../domain/history';
import type { Place } from '../domain/types';
import { placeById, region } from './index';

/**
 * 最近使った駅。ブラウザの localStorage に保存する（使えない環境ではこの画面を開いている間だけ覚える）
 */
// 地域ごとに分ける（首都圏は前からのキーのまま）
const KEY = region.id === 'tokyo' ? 'tokyo-rail-map:station-history' : `tokyo-rail-map:${region.id}:station-history`;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && placeById.has(id)) : [];
  } catch {
    return [];
  }
}

let ids = read();
const listeners = new Set<() => void>();

export function rememberStation(place: Place) {
  const next = addToHistory(ids, place.id);
  if (next.join() === ids.join()) return;
  ids = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
  listeners.forEach((l) => l());
}

export function clearStationHistory() {
  ids = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStationHistory(): Place[] {
  const current = useSyncExternalStore(subscribe, () => ids);
  return current.map((id) => placeById.get(id)!);
}
