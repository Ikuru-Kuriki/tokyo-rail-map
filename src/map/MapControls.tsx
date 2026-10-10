import { LABEL_DENSITIES, type LabelDensity } from './labels';

interface Props {
  pitch: number;
  bearing: number;
  /** 画面の下から、ボタンを置く位置までの距離（スマホのシートの高さ） */
  bottom: number;
  density: LabelDensity;
  onDensity: (density: LabelDensity) => void;
  onZoom: (delta: number) => void;
  onPitch: (pitch: number) => void;
  onResetBearing: () => void;
}

export const TILTED_PITCH = 52;

const BTN =
  'panel flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 text-slate-800 backdrop-blur active:bg-slate-100 hover:bg-slate-50';

/** 地図の操作ボタン（右上: 駅名の出し方、右下: 拡大・縮小・傾き・方位） */
export function MapControls({ pitch, bearing, bottom, density, onDensity, onZoom, onPitch, onResetBearing }: Props) {
  const tilted = pitch > 10;
  // 北からのずれ（0〜180 度）。最初の向き（少しだけ回している）では出さない
  const turned = Math.abs((((bearing % 360) + 540) % 360) - 180);
  const rotated = turned > 10;
  const index = LABEL_DENSITIES.findIndex((d) => d.value === density);
  const next = LABEL_DENSITIES[(index + 1) % LABEL_DENSITIES.length]!;
  return (
    <>
      <div className="pointer-events-none absolute top-3 right-3 z-10 md:top-4 md:right-4">
        <button
          type="button"
          className="panel pointer-events-auto flex h-11 items-center gap-1.5 rounded-xl bg-white/95 px-3 text-sm font-semibold text-slate-800 backdrop-blur hover:bg-slate-50 active:bg-slate-100"
          aria-label={`駅名の表示: ${LABEL_DENSITIES[index]!.label}（押すと${next.label}）`}
          onClick={() => onDensity(next.value)}
        >
          <span aria-hidden="true" className="text-xs text-slate-400">
            駅名
          </span>
          {LABEL_DENSITIES[index]!.label}
        </button>
      </div>
      <div
        className="pointer-events-none absolute right-3 z-10 flex flex-col gap-2 md:right-4"
        style={{ bottom: bottom + 12 }}
      >
        {rotated && (
          <button
            type="button"
            className={`${BTN} pointer-events-auto`}
            aria-label="北を上に戻す"
            title="北を上に戻す"
            onClick={onResetBearing}
          >
            {/* 方位磁針: 赤い方が今の北 */}
            <svg viewBox="0 0 24 24" width="22" height="22" style={{ transform: `rotate(${-bearing}deg)` }}>
              <path d="M12 3 L16 12 L8 12 Z" fill="#e5484d" />
              <path d="M12 21 L8 12 L16 12 Z" fill="#94a3b8" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={`${BTN} pointer-events-auto text-xs font-bold`}
          aria-label={tilted ? '真上から見る' : '斜めから見る'}
          title={tilted ? '真上から見る' : '斜めから見る'}
          onClick={() => onPitch(tilted ? 0 : TILTED_PITCH)}
        >
          {tilted ? '真上' : '3D'}
        </button>
        <div className="panel pointer-events-auto flex flex-col overflow-hidden rounded-xl bg-white/95 backdrop-blur">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-xl font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100"
            aria-label="拡大"
            onClick={() => onZoom(1)}
          >
            +
          </button>
          <span className="mx-2 h-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-xl font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100"
            aria-label="縮小"
            onClick={() => onZoom(-1)}
          >
            −
          </button>
        </div>
      </div>
    </>
  );
}
