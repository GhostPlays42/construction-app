"use client";

// Links here are plain <a> page loads, not client-side navigation, so the
// phone's copy of each screen opens when there's no signal.
/* eslint-disable @next/next/no-html-link-for-pages */

import { formatDate, formatTime, todayISO } from "@/lib/dates";
import { safetyStatus, todaysJob, useOnPhone, usePick } from "@/lib/offline/today";
import type { WorkerSnapshot } from "@/lib/offline/types";
import { useWorkerData } from "@/lib/offline/use-worker-data";
import { SafetyForm } from "./safety-form";

export function SafetyScreen({ initial }: { initial: WorkerSnapshot }) {
  const { snapshot, outbox } = useWorkerData(initial);
  const today = todayISO();
  const pick = usePick(initial.userId, today);
  // The job pick lives on the phone, so decide what to show once there.
  const ready = useOnPhone();

  const { job } = todaysJob(snapshot, today, pick);
  const meeting = job ? safetyStatus(snapshot, outbox, job.id, today) : null;

  return (
    <main data-offline-page className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Safety meeting</h1>
        <a href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </a>
      </div>
      {!ready ? null : !snapshot.isSupervisor ? (
        <p className="text-lg">
          Your supervisor runs the safety meeting.{" "}
          <a href="/" className="underline">
            Back home
          </a>
        </p>
      ) : !job ? (
        <p className="text-lg">
          Pick today&apos;s job on your{" "}
          <a href="/" className="underline">
            home screen
          </a>{" "}
          first.
        </p>
      ) : meeting?.state === "sent" || meeting?.state === "waiting" ? (
        <p className="text-lg">
          Today&apos;s safety meeting for {job.name} is done. {meeting.ledBy} ran it at {formatTime(meeting.filledAt)}.{" "}
          <a href="/" className="underline">
            Back home
          </a>
        </p>
      ) : (
        <>
          <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            {job.name} · {formatDate(today)}
          </p>
          <SafetyForm
            snapshot={snapshot}
            job={job}
            today={today}
            crew={snapshot.crews.filter((c) => c.job_id === job.id)}
          />
        </>
      )}
    </main>
  );
}
