"use client";

import { startTransition, useActionState, useState } from "react";
import { countLines, CRA_YEARS, KEEP_CHOICES, parseKeepYears } from "@/lib/record-keeping";
import { saveKeepYears, type KeepFormState } from "./actions";

const choice =
  "flex items-center gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800";
const muted = "text-base text-zinc-600 dark:text-zinc-400";
const button =
  "flex-1 rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50";

export function KeepRecordsForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState(saveKeepYears, {});
  const [picked, setPicked] = useState(current);
  const [cancelled, setCancelled] = useState<KeepFormState["confirm"]>();
  // The confirm step is only for the choice it counted, until it's cancelled.
  const confirm = state.confirm?.value === picked && state.confirm !== cancelled ? state.confirm : undefined;
  const years = parseKeepYears(picked);
  const underCra = typeof years === "number" && years < CRA_YEARS;

  return (
    // Sent by hand: a form action resets the form afterwards, which would undo the pick on screen.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-lg font-medium">Keep records for</legend>
        {KEEP_CHOICES.map((c) => (
          <label key={c.value} className={choice}>
            <input
              type="radio"
              name="keep_years"
              value={c.value}
              checked={picked === c.value}
              onChange={() => setPicked(c.value)}
              className="h-5 w-5 accent-amber-500"
            />
            <span className="text-lg font-medium">{c.text}</span>
          </label>
        ))}
      </fieldset>

      {underCra && (
        <p role="note" className="rounded-xl bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The CRA asks businesses to keep records for at least {CRA_YEARS} years. Check with your accountant
          before picking less.
        </p>
      )}

      {confirm ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border-2 border-red-300 p-4 dark:border-red-800">
          <p className="text-lg font-semibold">This deletes records for good tonight:</p>
          <ul className="list-disc pl-6 text-lg">
            {countLines(confirm.counts).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={muted}>Their photos and PDFs go too. This can&apos;t be undone.</p>
          <input type="hidden" name="confirmed" value={confirm.value} />
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={`${button} bg-red-600 text-white active:bg-red-700`}>
              {pending ? "Saving…" : "Delete them and save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCancelled(state.confirm);
                setPicked(current);
              }}
              className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {state.error && (
            <p role="alert" className="text-base text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          {state.saved && picked === current && (
            <p role="status" className="text-base text-green-700 dark:text-green-400">
              Saved.
            </p>
          )}
          <button type="submit" disabled={pending || picked === current} className={`${button} mt-2`}>
            {pending ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </form>
  );
}
