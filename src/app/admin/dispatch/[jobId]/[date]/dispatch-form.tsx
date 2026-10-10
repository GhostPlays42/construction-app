"use client";

import Link from "next/link";
import { useActionState } from "react";
import { START_TIMES } from "@/lib/dispatch";
import type { DispatchFormState } from "../../actions";

type Choice = { id: string; label: string; hint: string; warn: boolean };
type Values = NonNullable<DispatchFormState["values"]>;

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const label = "text-lg font-medium";
const muted = "text-base text-zinc-600 dark:text-zinc-400";

// Who and what goes to a job on a day, with a start time and a note.
export function DispatchForm({
  action,
  date,
  people,
  machines,
  initial,
}: {
  action: (prev: DispatchFormState, fd: FormData) => Promise<DispatchFormState>;
  date: string;
  people: Choice[];
  machines: Choice[];
  initial: Values;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a warning or a failed save, keep what was picked.
  const v = state.values ?? initial;
  const conflicts = state.conflicts ?? [];
  // Remount the fields when the server sends back values, so they show them.
  const key = JSON.stringify(v);

  return (
    <form key={key} action={formAction} className="flex flex-col gap-3" noValidate>
      <label htmlFor="start" className={label}>
        Start time
      </label>
      <select id="start" name="start" defaultValue={v.start} className={input}>
        <option value="">No set time</option>
        {START_TIMES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label htmlFor="notes" className={label}>
        Note for the crew
      </label>
      <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={v.notes} className={input} />
      <p className={`-mt-1 ${muted}`}>For example: bring the pump, meet at the north gate.</p>

      <Checklist title="People" name="people" choices={people} picked={v.people} empty="Add people first." />
      <Checklist title="Equipment" name="equipment" choices={machines} picked={v.equipment} empty="Add equipment first." />

      {state.error && (
        <p role="alert" className="text-base text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      {conflicts.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 p-4 dark:border-amber-600">
          <p className="text-lg font-semibold">Double booked</p>
          <ul className="flex list-disc flex-col gap-1 pl-6 text-lg">
            {conflicts.map((c) => (
              <li key={`${c.kind}-${c.id}-${c.other_job}`}>
                {c.name} is also planned on {c.other_job}.
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              type="submit"
              name="confirm"
              value="1"
              disabled={pending}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save anyway"}
            </button>
            <Link
              href={`/admin/dispatch?date=${date}`}
              className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
            >
              Cancel
            </Link>
          </div>
          <p className={muted}>Or change who&apos;s picked above and check again.</p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl border-2 border-amber-500 px-4 py-3 text-lg font-semibold"
          >
            Check again
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <Link
            href={`/admin/dispatch?date=${date}`}
            className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
          >
            Cancel
          </Link>
        </div>
      )}
      <p className={muted}>Saving doesn&apos;t tell the crew yet. Use Send schedule on the dispatch board when you&apos;re ready.</p>
    </form>
  );
}

function Checklist({
  title,
  name,
  choices,
  picked,
  empty,
}: {
  title: string;
  name: string;
  choices: Choice[];
  picked: string[];
  empty: string;
}) {
  return (
    <fieldset className="mt-2 flex flex-col gap-2">
      <legend className={`${label} mb-2`}>{title}</legend>
      {choices.length === 0 && <p className={muted}>{empty}</p>}
      {choices.map((c) => (
        <label
          key={c.id}
          className="flex items-center gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800"
        >
          <input
            type="checkbox"
            name={name}
            value={c.id}
            defaultChecked={picked.includes(c.id)}
            className="h-6 w-6 accent-amber-500"
          />
          <span className="flex flex-col">
            <span className="text-lg">{c.label}</span>
            {c.hint && (
              <span className={c.warn ? "text-base text-amber-700 dark:text-amber-400" : muted}>
                {c.warn && "⚠ "}
                {c.hint}
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
