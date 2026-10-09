/**
 * 駅ナンバリングの記号（路線色の枠に記号と番号）。number を省くと路線記号だけ（"JK"）
 */
export function StationCode({ code, color, size = 'md' }: { code: string; color: string; size?: 'sm' | 'md' }) {
  const m = code.match(/^([A-Z]+)(\d*)$/);
  const symbol = m ? m[1] : code;
  const number = m ? m[2] : '';
  const box = size === 'sm' ? 'h-[22px] min-w-[22px] border-2' : 'h-[28px] min-w-[28px] border-[3px]';
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-md bg-white px-0.5 leading-none font-bold text-slate-900 ${box}`}
      style={{ borderColor: color }}
      title={code}
      aria-label={`駅番号 ${code}`}
    >
      <span className={size === 'sm' ? 'text-[7px]' : 'text-[8px]'}>{symbol}</span>
      {number && <span className={`tabular-nums ${size === 'sm' ? 'text-[9px]' : 'text-[11px]'}`}>{number}</span>}
    </span>
  );
}
