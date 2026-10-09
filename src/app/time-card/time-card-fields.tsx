"use client";

import {
  BREAK_OPTIONS,
  TIME_OPTIONS,
  hoursText,
  parseHours,
  workedMinutes,
} from "@/lib/offline/time-card-rules";
import type { TimeCardPayload } from "@/lib/offline/types";

// The time card as it's being filled in. Hours are kept as typed.
export type TimeCardDraft = {
  start: string;
  end: string;
  breakMinutes: number;
  lines: { cost_code_id: string; hours: string; description: string }[];
  // Ticked machines and their hours.
  equipment: Record<string, string>;
};

type Parts = Pick<TimeCardPayload, "start" | "end" | "breakMinutes" | "lines" | "equipment">;

export const emptyDraft = (): TimeCardDraft => ({
  start: "",
  end: "",
  breakMinutes: 30,
  lines: [{ cost_code_id: "", hours: "", description: "" }],
  equipment: {},
});

const hoursInput = (minutes: number) => String(Number((minutes / 60).toFixed(2)));

export function draftFrom(card: Parts): TimeCardDraft {
  return {
    start: card.start,
    end: card.end,
    breakMinutes: card.breakMinutes,
    lines: card.lines.map((l) => ({ ...l, hours: hoursInput(l.minutes) })),
    equipment: Object.fromEntries(card.equipment.map((e) => [e.equipment_id, hoursInput(e.minutes)])),
  };
}

// The hours left to put on a line: worked minus what the lines already have.
function remaining(draft: TimeCardDraft): number | null {
  const worked = workedMinutes(draft.start, draft.end, draft.breakMinutes);
  if (worked === null) return null;
  return worked - draft.lines.reduce((sum, l) => sum + (parseHours(l.hours) ?? 0), 0);
}

// The draft as the database takes it. A single line left blank takes the
// hours that are left, so a one-line day needs no hours typed.
export function partsFrom(draft: TimeCardDraft): Parts {
  const left = remaining(draft);
  const blanks = draft.lines.filter((l) => !l.hours.trim()).length;
  return {
    start: draft.start,
    end: draft.end,
    breakMinutes: draft.breakMinutes,
    lines: draft.lines.map((l) => ({
      cost_code_id: l.cost_code_id,
      minutes: !l.hours.trim() && blanks === 1 && left !== null && left > 0 ? left : (parseHours(l.hours) ?? 0),
      description: l.description.trim(),
    })),
    equipment: Object.entries(draft.equipment).map(([equipment_id, hours]) => ({
      equipment_id,
      minutes: parseHours(hours) ?? 0,
    })),
  };
}

const select =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-3 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const label = "flex flex-col gap-1 text-base font-medium";
const box = "h-7 w-7 flex-none accent-amber-500";

export function TimeCardFields({
  draft,
  onChange,
  codes,
  machines,
}: {
  draft: TimeCardDraft;
  onChange: (d: TimeCardDraft) => void;
  codes: { id: string; code: string; name: string }[];
  machines: { id: string; name: string }[];
}) {
  const worked = workedMinutes(draft.start, draft.end, draft.breakMinutes);
  const parts = partsFrom(draft);
  const onLines = parts.lines.reduce((sum, l) => sum + l.minutes, 0);
  const left = remaining(draft);
  const setLine = (i: number, change: Partial<TimeCardDraft["lines"][number]>) =>
    onChange({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...change } : l)) });

  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">1. Your hours</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Start
            <select value={draft.start} onChange={(e) => onChange({ ...draft, start: e.target.value })} className={select}>
              <option value="">Pick</option>
              {TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            End
            <select value={draft.end} onChange={(e) => onChange({ ...draft, end: e.target.value })} className={select}>
              <option value="">Pick</option>
              {TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          Break
          <select
            value={draft.breakMinutes}
            onChange={(e) => onChange({ ...draft, breakMinutes: Number(e.target.value) })}
            className={select}
          >
            {BREAK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "No break" : `${m} minutes`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-lg" aria-live="polite">
          Hours worked: <span className="font-semibold">{worked === null ? "–" : hoursText(worked)}</span>
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-xl font-semibold">2. What you worked on</legend>
        {draft.lines.map((line, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-3 dark:border-zinc-800">
            <label className={label}>
              Cost code
              <select
                value={line.cost_code_id}
                onChange={(e) => setLine(i, { cost_code_id: e.target.value })}
                className={select}
              >
                <option value="">Pick</option>
                {codes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Hours
              <input
                inputMode="decimal"
                value={line.hours}
                placeholder={
                  !line.hours.trim() && left !== null && left > 0 && draft.lines.filter((l) => !l.hours.trim()).length === 1
                    ? hoursInput(left)
                    : "e.g. 4"
                }
                onChange={(e) => setLine(i, { hours: e.target.value })}
                className={select}
              />
            </label>
            <label className={label}>
              What you did
              <textarea
                rows={2}
                maxLength={500}
                value={line.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                className={select}
              />
            </label>
            {draft.lines.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })}
                className="self-start text-base text-zinc-600 underline dark:text-zinc-400"
              >
                Remove this line
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, lines: [...draft.lines, { cost_code_id: "", hours: "", description: "" }] })}
          className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700"
        >
          + Add another line
        </button>
        {worked !== null && (
          <p
            className={`text-lg ${onLines === worked ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
            aria-live="polite"
          >
            Lines add up to {hoursText(onLines)} of {hoursText(worked)}
            {onLines === worked ? " ✓" : ""}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">3. Equipment you ran</legend>
        {machines.length === 0 ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">No equipment on this job.</p>
        ) : (
          <p className="-mt-1 text-base text-zinc-600 dark:text-zinc-400">Leave blank if you didn&apos;t run any.</p>
        )}
        {machines.map((m) => {
          const ticked = m.id in draft.equipment;
          return (
            <div key={m.id} className="flex flex-col gap-2">
              <label className="flex items-center gap-3 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg has-[:checked]:border-amber-500 dark:border-zinc-800">
                <input
                  type="checkbox"
                  className={box}
                  checked={ticked}
                  onChange={() => {
                    const next = { ...draft.equipment };
                    if (ticked) delete next[m.id];
                    else next[m.id] = "";
                    onChange({ ...draft, equipment: next });
                  }}
                />
                <span>{m.name}</span>
              </label>
              {ticked && (
                <div className="pl-6">
                  <input
                    aria-label={`Hours on ${m.name}`}
                    inputMode="decimal"
                    placeholder="Hours, e.g. 4"
                    value={draft.equipment[m.id]}
                    onChange={(e) => onChange({ ...draft, equipment: { ...draft.equipment, [m.id]: e.target.value } })}
                    className={select}
                  />
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
