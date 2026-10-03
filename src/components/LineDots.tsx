import type { Railway } from '../domain/types';

/** 路線の色を小さな丸で並べる */
export function LineDots({ railways }: { railways: Railway[] }) {
  return (
    <span className="flex shrink-0 gap-0.5">
      {railways.slice(0, 6).map((r) => (
        <span
          key={r.id}
          title={r.ja}
          className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
          style={{ background: r.color }}
        />
      ))}
    </span>
  );
}
