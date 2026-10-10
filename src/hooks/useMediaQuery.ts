import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false);
}

/** メディアクエリに合うかどうか（画面の幅などが変わると更新する） */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setValue(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

/** PC の幅（検索パネルを左上に置く） */
export const DESKTOP_QUERY = '(min-width: 768px)';
/** 指で操作する端末 */
export const COARSE_QUERY = '(pointer: coarse)';
