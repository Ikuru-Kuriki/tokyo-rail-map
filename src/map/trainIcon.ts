/** 経路ごとの色（1 = 青、2 = オレンジ、3 = 緑） */
export const SIM_COLORS = ['#1d6fd8', '#e8710a', '#1a9e5c'];

/** 電車のアイコン（経路の色の丸い板に白い電車、右上に経路番号）。IconLayer 用の SVG の data URL */
export function trainIconUrl(color: string, number: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="30" cy="34" r="25" fill="${color}" stroke="white" stroke-width="4"/>
  <rect x="18" y="18" width="24" height="26" rx="6" fill="white"/>
  <rect x="21.5" y="22" width="17" height="9" rx="2" fill="${color}"/>
  <circle cx="24.5" cy="37.5" r="2.2" fill="${color}"/>
  <circle cx="35.5" cy="37.5" r="2.2" fill="${color}"/>
  <path d="M22 44 L18 50 M38 44 L42 50" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <circle cx="51" cy="13" r="11" fill="white" stroke="${color}" stroke-width="3"/>
  <text x="51" y="18" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#1e293b">${number}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
