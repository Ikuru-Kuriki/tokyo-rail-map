/** "HH:MM" → 営業日の分（3 時前は翌日扱い）。不正なら null */
export function parseClock(text: string): number | null {
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return (h < 3 ? h + 24 : h) * 60 + min;
}

/** 営業日の分 → "HH:MM"（入力欄用。24 時以降は 0 時から） */
export function formatClock(minutes: number): string {
  const m = Math.floor(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 今の時刻を "HH:MM" で（5 分単位に切り上げ） */
export function nowClock(now = new Date()): string {
  const total = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  return formatClock(total % (24 * 60));
}
