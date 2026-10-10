import { Fragment, useId, useState } from 'react';
import { network, placeByStation, railwayById, stationById } from '../data';
import type { SimulationState } from '../data/useSimulation';
import { formatMinutes } from '../domain/lastTrain';
import { earliestBoarding, replaceRide, trainsBetween, type Connections, type SimJourney } from '../domain/simulate';
import { buildFootpaths } from '../domain/lastTrain';
import type { SimRouteInput, StartMode, TimeKind } from '../domain/simRoutes';
import type { DayType } from '../domain/timetableTypes';
import type { Place } from '../domain/types';
import { SIM_COLORS } from '../map/trainIcon';
import { StationName } from './StationName';
import { StationPicker } from './StationPicker';

export const MAX_SIM_ROUTES = 3;

export type SimSlot = { route: number; field: 'from' | 'to' };

interface Props {
  routes: SimRouteInput[];
  baseTime: string;
  day: DayType;
  slot: SimSlot;
  state: SimulationState;
  /** 経路ごとに選んだ候補の番号（無ければ 0 = 最速） */
  choice: number[];
  onChoose: (route: number, index: number) => void;
  /** 経路ごとに今使っている行き方（区間ごとに選び直したものを含む） */
  journeys: (SimJourney | null)[];
  /** 区間ごとに列車を選び直した行き方 */
  onCustomize: (route: number, journey: SimJourney) => void;
  /** 区間ごとに選び直した経路（true の経路）と、元に戻す操作 */
  customized: boolean[];
  onResetCustom: (route: number) => void;
  onSlot: (slot: SimSlot) => void;
  onChange: (index: number, patch: Partial<SimRouteInput>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onBaseTime: (time: string) => void;
  /** 時刻を出発・到着のどちらとして使うか（全経路共通） */
  timeKind: TimeKind;
  onTimeKind: (kind: TimeKind) => void;
  onDay: (day: DayType) => void;
}

const TIME_KINDS: [TimeKind, string][] = [
  ['depart', '出発'],
  ['arrive', '到着'],
];

const DAYS: [DayType, string][] = [
  ['weekday', '平日'],
  ['holiday', '土休日'],
];

/** 経路の色の丸と番号 */
export function RouteBadge({ index }: { index: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
      style={{ background: SIM_COLORS[index] }}
    >
      {index + 1}
    </span>
  );
}

/** 乗る列車が走る路線（直通運転で路線が変わるときはすべて） */
function railwaysOfRide(hops: { from: string; to: string }[]) {
  const ids: string[] = [];
  for (const h of hops)
    for (const id of [h.from, h.to]) {
      const r = stationById.get(id)!.railway;
      if (!ids.includes(r)) ids.push(r);
    }
  return ids.map((id) => railwayById.get(id)!);
}

/** 乗換駅。降りた駅と次に乗る駅が別の駅（徒歩連絡）なら、乗る駅も返す */
function transferStations(prev: { to: string }[], next: { from: string }[]): { off: string; on: string | null } {
  const off = prev[prev.length - 1]!.to;
  const on = next[0]!.from;
  const name = (id: string) => stationById.get(id)!.ja;
  return { off: name(off), on: placeByStation.get(off)?.id === placeByStation.get(on)?.id ? null : name(on) };
}

function TransferChip({ name }: { name: string }) {
  return (
    <span className="rounded bg-white px-1 font-bold whitespace-nowrap text-slate-900 ring-1 ring-slate-300">
      {name}
    </span>
  );
}

/** 行き方の候補の一覧。クリックで乗る電車を切り替える */
function CandidateList({
  candidates,
  selected,
  start,
  onChoose,
}: {
  candidates: { journey: SimJourney; labels: string[] }[];
  selected: number;
  start: number | null;
  onChoose: (index: number) => void;
}) {
  if (candidates.length < 2) return null;
  return (
    <fieldset className="mt-2">
      <legend className="mb-1 text-xs font-semibold text-slate-500">行き方を選ぶ</legend>
      <ul className="space-y-1">
        {candidates.map((c, k) => {
          const j = c.journey;
          const rides = j.legs.filter((l) => l.kind === 'ride');
          const active = k === selected;
          return (
            <li key={k}>
              <button
                type="button"
                aria-pressed={active}
                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${active ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}
                onClick={() => onChoose(k)}
              >
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatMinutes(j.dep)}→{formatMinutes(j.arr)}
                  </span>
                  <span className="text-slate-500">
                    {j.arr - (start ?? j.dep)}分・乗換{Math.max(0, rides.length - 1)}回
                  </span>
                  {c.labels.map((label) => (
                    <span
                      key={label}
                      className={`rounded px-1 text-[10px] font-semibold ${label === '最速' || label === '間に合う最終' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {label}
                    </span>
                  ))}
                </span>
                {/* 乗る路線を順に並べ、間に乗換駅を挟む（直通運転で路線が変わるところは →） */}
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  {rides.map((l, i) => (
                    <Fragment key={i}>
                      {i > 0 &&
                        (() => {
                          const t = transferStations(rides[i - 1]!.hops, l.hops);
                          return (
                            <span className="inline-flex flex-wrap items-center gap-1 text-slate-400">
                              ›
                              <TransferChip name={t.off} />
                              {t.on && (
                                <>
                                  <span className="text-[10px]">徒歩</span>
                                  <TransferChip name={t.on} />
                                </>
                              )}
                              ›
                            </span>
                          );
                        })()}
                      {railwaysOfRide(l.hops).map((r, k) => (
                        <span key={r.id} className="inline-flex items-center gap-1 text-slate-700">
                          {k > 0 && <span className="text-slate-400">→</span>}
                          <span className="h-1.5 w-3 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                          {r.ja}
                        </span>
                      ))}
                    </Fragment>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

const footpaths = buildFootpaths(network);
const placeStations = (stationId: string) => placeByStation.get(stationId)?.stations ?? [stationId];

/** ある乗車区間に乗れるほかの列車の一覧。選ぶとその先の乗換を組み直す */
function LegTrainPicker({
  connections,
  journey,
  legIndex,
  toStations,
  arrive,
  deadline,
  onPick,
}: {
  connections: Connections;
  journey: SimJourney;
  legIndex: number;
  toStations: string[];
  arrive: boolean;
  deadline: number | null;
  onPick: (journey: SimJourney) => void;
}) {
  const leg = journey.legs[legIndex]!;
  if (leg.kind !== 'ride') return null;
  const first = leg.hops[0]!;
  const last = leg.hops[leg.hops.length - 1]!;
  // 最初の乗車は指定の時刻（到着指定なら 30 分前）から、2 つめ以降は前の区間に着いて乗り換えられる時刻から
  const after = earliestBoarding(journey, legIndex) ?? (arrive ? journey.dep - 30 : journey.start);
  const options = trainsBetween(connections, placeStations(first.from), placeStations(last.to), after, 8)
    .map((train) => ({ train, result: replaceRide(connections, footpaths, journey, legIndex, train, toStations) }))
    .filter((o): o is { train: typeof o.train; result: SimJourney } => o.result !== null);
  if (options.length === 0) return <p className="py-1 text-slate-500">ほかに乗れる列車はありません。</p>;
  return (
    <ul className="mt-1 mb-1.5 space-y-1 border-l-2 border-slate-200 pl-2">
      {options.map(({ train, result }) => {
        const current = train.trip === leg.trip && train.dep === first.dep;
        const late = deadline !== null && result.arr > deadline;
        const r = railwayById.get(stationById.get(train.hops[0]!.from)!.railway)!;
        return (
          <li key={`${train.trip}@${train.dep}`}>
            <button
              type="button"
              aria-pressed={current}
              className={`flex w-full flex-wrap items-center gap-x-1.5 rounded-md border px-2 py-1 text-left ${current ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
              onClick={() => onPick(result)}
            >
              <span className="font-bold text-slate-900 tabular-nums">
                {formatMinutes(train.dep)}→{formatMinutes(train.arr)}
              </span>
              <span className="font-semibold" style={{ color: r.color }}>
                {r.ja}
              </span>
              {train.destination && <span>{train.destination}行</span>}
              <span className={`ml-auto tabular-nums ${late ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                最終 {formatMinutes(result.arr)} 着{late && '（遅れる）'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function JourneySummary({
  journey,
  start,
  deadline,
  connections,
  toStations,
  arrive,
  onCustomize,
}: {
  journey: SimJourney | null;
  start: number | null;
  /** 到着指定のときの締切 */
  deadline: number | null;
  connections: Connections | null;
  toStations: string[];
  arrive: boolean;
  onCustomize: (journey: SimJourney) => void;
}) {
  const [openLeg, setOpenLeg] = useState<number | null>(null);
  if (!journey)
    return (
      <p className="text-xs text-slate-500">
        {deadline !== null
          ? `${formatMinutes(deadline)} までに着く電車が見つかりませんでした。`
          : 'この時刻からの電車が見つかりませんでした。'}
      </p>
    );
  const rides = journey.legs.filter((l) => l.kind === 'ride');
  return (
    <div className="text-xs text-slate-600">
      <p className="mb-1">
        <span className="font-bold text-slate-900 tabular-nums">{formatMinutes(journey.dep)}</span> 発 →{' '}
        <span className="font-bold text-slate-900 tabular-nums">{formatMinutes(journey.arr)}</span> 着（
        {journey.arr - (start ?? journey.dep)} 分・乗換 {Math.max(0, rides.length - 1)} 回
        {deadline !== null && `・${formatMinutes(deadline)} までに到着`}）
      </p>
      <ol className="space-y-0.5">
        {journey.legs.map((l, legIndex) => {
          if (l.kind !== 'ride') return null;
          const open = openLeg === legIndex;
          return (
            <li key={legIndex}>
              <div className="flex flex-wrap items-center gap-1">
                <span className="tabular-nums">{formatMinutes(l.hops[0]!.dep)}</span>
                <StationName id={l.hops[0]!.from} />
                {railwaysOfRide(l.hops).map((r, n) => (
                  <span key={r.id} className="font-semibold" style={{ color: r.color }}>
                    {n > 0 && <span className="text-slate-400">→</span>}
                    {r.ja}
                  </span>
                ))}
                {l.destination && <span>{l.destination}行</span>}
                {connections && (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? '列車の一覧を閉じる' : 'この区間の列車を変える'}
                    className="ml-auto rounded px-1.5 py-0.5 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setOpenLeg(open ? null : legIndex)}
                  >
                    {open ? '閉じる' : '変更'}
                  </button>
                )}
              </div>
              {open && connections && (
                <LegTrainPicker
                  connections={connections}
                  journey={journey}
                  legIndex={legIndex}
                  toStations={toStations}
                  arrive={arrive}
                  deadline={deadline}
                  onPick={(j) => {
                    onCustomize(j);
                    setOpenLeg(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SimulationPanel(props: Props) {
  const { routes, baseTime, day, slot, state } = props;
  const timeId = useId();
  const arrive = props.timeKind === 'arrive';
  /** 到着指定のときの経路ごとの締切 */
  const deadline = (i: number) => (arrive && state.status === 'ready' ? (state.starts[i] ?? null) : null);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <div role="radiogroup" aria-label="時刻の指定" className="mb-1 flex gap-1 text-xs font-semibold">
            {TIME_KINDS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={props.timeKind === value}
                className={`rounded px-1.5 py-0.5 ${props.timeKind === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                onClick={() => props.onTimeKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor={timeId} className="sr-only">
            {arrive ? '到着時刻' : '出発時刻'}
          </label>
          <input
            id={timeId}
            type="time"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[15px] font-semibold tabular-nums"
            value={baseTime}
            onChange={(e) => props.onBaseTime(e.target.value)}
          />
        </div>
        <div role="radiogroup" aria-label="ダイヤ" className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {DAYS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={day === value}
              className={`rounded-md px-3 py-1 font-semibold ${day === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => props.onDay(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-3 space-y-3">
        {routes.map((r, i) => (
          <li
            key={r.id}
            className="rounded-xl border border-slate-200 p-2.5"
            style={{ borderLeft: `4px solid ${SIM_COLORS[i]}` }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <RouteBadge index={i} />
              <span className="text-sm font-bold">経路 {i + 1}</span>
              {i > 0 && (
                <button
                  type="button"
                  className="ml-auto rounded px-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`経路 ${i + 1} を削除`}
                  onClick={() => props.onRemove(i)}
                >
                  ×
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <StationPicker
                label="出発"
                value={r.from}
                onChange={(p: Place | null) => props.onChange(i, { from: p })}
                active={slot.route === i && slot.field === 'from'}
                onFocus={() => props.onSlot({ route: i, field: 'from' })}
              />
              <StationPicker
                label="到着"
                value={r.to}
                onChange={(p: Place | null) => props.onChange(i, { to: p })}
                active={slot.route === i && slot.field === 'to'}
                onFocus={() => props.onSlot({ route: i, field: 'to' })}
              />
            </div>
            {i > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <select
                  aria-label={`経路 ${i + 1} の${arrive ? '到着' : '出発'}時刻`}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-1 font-semibold"
                  value={r.mode}
                  onChange={(e) => props.onChange(i, { mode: e.target.value as StartMode })}
                >
                  <option value="same">経路 1 と同じ{arrive ? '到着' : '出発'}時刻</option>
                  <option value="offset">経路 1 の◯分後に{arrive ? '到着' : '出発'}</option>
                  <option value="time">{arrive ? '到着' : '出発'}時刻を指定</option>
                </select>
                {r.mode === 'offset' && (
                  <label className="flex items-center gap-1">
                    <input
                      type="number"
                      min={-180}
                      max={180}
                      step={5}
                      className="w-16 rounded-md border border-slate-200 px-1.5 py-1 tabular-nums"
                      value={r.offset}
                      onChange={(e) => props.onChange(i, { offset: Number(e.target.value) || 0 })}
                    />
                    分後に{arrive ? '到着' : '出発'}
                  </label>
                )}
                {r.mode === 'time' && (
                  <input
                    type="time"
                    aria-label={`経路 ${i + 1} の${arrive ? '到着' : '出発'}時刻を指定`}
                    className="rounded-md border border-slate-200 px-1.5 py-1 tabular-nums"
                    value={r.time}
                    onChange={(e) => props.onChange(i, { time: e.target.value })}
                  />
                )}
              </div>
            )}
            {state.status === 'ready' && r.from && r.to && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <JourneySummary
                  journey={props.journeys[i] ?? null}
                  start={arrive ? null : (state.starts[i] ?? null)}
                  deadline={deadline(i)}
                  connections={state.connections}
                  toStations={r.to.stations}
                  arrive={arrive}
                  onCustomize={(j) => props.onCustomize(i, j)}
                />
                {props.customized[i] && (
                  <p className="mt-1.5 flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    区間ごとに列車を選び直しています
                    <button
                      type="button"
                      className="ml-auto font-semibold underline underline-offset-2"
                      onClick={() => props.onResetCustom(i)}
                    >
                      元に戻す
                    </button>
                  </p>
                )}
                <CandidateList
                  candidates={state.candidates[i] ?? []}
                  selected={props.choice[i] ?? 0}
                  start={arrive ? null : (state.starts[i] ?? null)}
                  onChoose={(k) => props.onChoose(i, k)}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      {routes.length < MAX_SIM_ROUTES && (
        <button type="button" className="btn mt-2 text-sm" onClick={props.onAdd}>
          ＋ 経路を追加
        </button>
      )}
      {state.status === 'loading' && <p className="mt-2 text-xs text-slate-500">時刻表を読み込んでいます…</p>}
      {state.status === 'error' && <p className="mt-2 text-xs text-red-700">{state.message}</p>}
      {state.status === 'idle' && (
        <p className="mt-2 text-xs text-slate-500">
          経路ごとに出発・到着を選ぶと、時刻表どおりに電車が走る様子を再生できます。地図の駅名をクリックしても選べます。
        </p>
      )}
    </>
  );
}
