"use client";

import { useState, useTransition } from "react";
import { TimeCardFields, draftFrom, partsFrom } from "@/app/time-card/time-card-fields";
import type { TimeCardPayload } from "@/lib/offline/types";
import { updateTimeCard } from "../../actions";

type Parts = Pick<TimeCardPayload, "start" | "end" | "breakMinutes" | "lines" | "equipment">;

export function EditForm({
  id,
  initial,
  codes,
  machines,
}: {
  id: string;
  initial: Parts;
  codes: { id: string; code: string; name: string }[];
  machines: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateTimeCard(id, partsFrom(draft));
          setError(result?.error ?? "");
        });
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <TimeCardFields draft={draft} onChange={setDraft} codes={codes} machines={machines} />
      <div className="flex flex-col gap-3">
        {error && !pending && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Your changes are recorded in the time card&apos;s history.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
