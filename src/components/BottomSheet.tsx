import { useEffect, useRef, useState, type ReactNode } from 'react';

/** シートの高さの段階: 小（見出しだけ）・中・大 */
export type SheetSnap = 'peek' | 'half' | 'full';

const PEEK = 92;

/** 段階ごとのシートの高さ（px） */
export function sheetHeight(snap: SheetSnap, viewportHeight: number): number {
  if (snap === 'peek') return PEEK;
  if (snap === 'half') return Math.round(viewportHeight * 0.45);
  return Math.round(viewportHeight * 0.88);
}

/** 指を離した高さにいちばん近い段階 */
export function nearestSnap(height: number, viewportHeight: number): SheetSnap {
  const snaps: SheetSnap[] = ['peek', 'half', 'full'];
  let best: SheetSnap = 'peek';
  for (const s of snaps) {
    if (Math.abs(sheetHeight(s, viewportHeight) - height) < Math.abs(sheetHeight(best, viewportHeight) - height))
      best = s;
  }
  return best;
}

export function useViewportHeight(): number {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return h;
}

interface Props {
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  viewportHeight: number;
  /** つまみの下に出す見出し（小のときも見える） */
  header: ReactNode;
  children: ReactNode;
}

/**
 * スマホ用の、画面の下から出るシート。つまみ・見出しを上下にドラッグすると高さを変え、
 * 離すと近い段階に吸着する。つまみをタップすると小と中を切り替える。
 */
export function BottomSheet({ snap, onSnap, viewportHeight, header, children }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const height = drag ?? sheetHeight(snap, viewportHeight);

  const onPointerDown = (e: React.PointerEvent) => {
    // 見出しの中のボタンはそのまま押せるように
    if ((e.target as HTMLElement).closest('button:not([data-sheet-handle]), input, select, a')) return;
    start.current = {
      y: e.clientY,
      height: sheetHeight(snap, viewportHeight),
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > 6) s.moved = true;
    if (!s.moved) return;
    const min = sheetHeight('peek', viewportHeight);
    const max = sheetHeight('full', viewportHeight);
    setDrag(Math.min(max, Math.max(min, s.height - dy)));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) onSnap(snap === 'peek' ? 'half' : 'peek');
    else if (drag !== null) onSnap(nearestSnap(drag, viewportHeight));
    setDrag(null);
  };

  return (
    <section
      className={`panel pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white/97 backdrop-blur ${drag === null ? 'transition-[height] duration-200 ease-out' : ''}`}
      style={{ height }}
    >
      <div
        className="shrink-0 touch-none px-4 pt-2 pb-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          data-sheet-handle
          aria-label={snap === 'peek' ? 'パネルを広げる' : 'パネルを縮める'}
          className="mx-auto mb-1.5 block h-5 w-16"
          // 指・マウスでは上の pointer イベントで切り替える。キーボードで押したとき（detail 0）だけここで切り替える
          onClick={(e) => {
            if (e.detail === 0) onSnap(snap === 'peek' ? 'half' : 'peek');
          }}
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-slate-300" />
        </button>
        {header}
      </div>
      <div
        className={`min-h-0 flex-1 overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${snap === 'peek' && drag === null ? 'invisible overflow-hidden' : 'overflow-y-auto'}`}
      >
        {children}
      </div>
    </section>
  );
}
