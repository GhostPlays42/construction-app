"use client";

import { useState } from "react";
import { addToOutbox, sendWaiting } from "@/lib/offline/outbox";
import { checkTimeCard, timeCardMessage } from "@/lib/offline/time-card-rules";
import type { TimeCardView } from "@/lib/offline/today";
import type { TimeCardPayload, WorkerSnapshot } from "@/lib/offline/types";
import { TimeCardFields, draftFrom, emptyDraft, partsFrom } from "./time-card-fields";

// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 4000;

export function TimeCardForm({
  snapshot,
  job,
  today,
  existing,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
  // The time card already sent today, when changing it.
  existing: TimeCardView | null;
}) {
  const [draft, setDraft] = useState(() => (existing ? draftFrom(existing) : emptyDraft()));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const machines = snapshot.lists.equipment.filter((m) => m.job_ids.includes(job.id));

  // Saved on the phone first, then sent. With no signal it waits on the
  // phone and home shows it as waiting to send. Changing it later sends a
  // newer copy under the same id.
  async function submit() {
    const parts = partsFrom(draft);
    const problem = checkTimeCard(parts);
    if (problem) return setError(timeCardMessage(problem));

    const payload: TimeCardPayload = {
      jobId: job.id,
      jobName: job.name,
      workDate: today,
      filledAt: new Date().toISOString(),
      ...parts,
    };
    setError("");
    setPending(true);
    try {
      await addToOutbox({
        id: existing?.id ?? crypto.randomUUID(),
        kind: "time-card",
        userId: snapshot.userId,
        employeeId: snapshot.employeeId,
        createdAt: new Date().toISOString(),
        status: "waiting",
        payload,
      });
    } catch {
      setPending(false);
      return setError("Couldn't save on this phone. Check it has free space and try again.");
    }
    await Promise.race([
      sendWaiting(snapshot.userId).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, SEND_WAIT_MS)),
    ]);
    // A full page load, so the phone's copy of home opens with no signal.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <TimeCardFields draft={draft} onChange={setDraft} codes={snapshot.lists.codes} machines={machines} />

      <div className="flex flex-col gap-3">
        {error && !pending && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-amber-500 px-4 py-5 text-2xl font-bold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : existing ? "Send changes" : "Send time card"}
        </button>
      </div>
    </form>
  );
}
