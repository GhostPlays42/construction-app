"use client";

// Links here are plain <a> page loads, not client-side navigation, so the
// phone's copy of each screen opens when there's no signal.
/* eslint-disable @next/next/no-html-link-for-pages */

import { formatDate, todayISO } from "@/lib/dates";
import { flhaStatus, slipsToday, todaysJob, useOnPhone, usePick } from "@/lib/offline/today";
import type { WorkerSnapshot } from "@/lib/offline/types";
import { useWorkerData } from "@/lib/offline/use-worker-data";
import { SlipForm } from "./slip-form";

export function SlipScreen({ initial }: { initial: WorkerSnapshot }) {
  const { snapshot, outbox } = useWorkerData(initial);
  const today = todayISO();
  const pick = usePick(initial.userId, today);
  // The job pick lives on the phone, so decide what to show once there.
  const ready = useOnPhone();

  const { job } = todaysJob(snapshot, today, pick);
  const flha = job ? flhaStatus(snapshot, outbox, job.id, today) : null;
  const flhaDone = flha?.state === "sent" || flha?.state === "waiting";
  const sent = job ? slipsToday(snapshot, outbox, job.id, today) : null;
  const done = sent ? sent.sent + sent.waiting : 0;

  return (
    <main data-offline-page className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Trucking slip</h1>
        <a href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </a>
      </div>
      {!ready ? null : !job ? (
        <p className="text-lg">
          Pick today&apos;s job on your{" "}
          <a href="/" className="underline">
            home screen
          </a>{" "}
          first.
        </p>
      ) : !flhaDone ? (
        <p className="text-lg">
          Do your{" "}
          <a href="/flha" className="underline">
            FLHA
          </a>{" "}
          for {job.name} first.
        </p>
      ) : (
        <>
          <div className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            <p>
              {job.name} · {formatDate(today)}
            </p>
            {done > 0 && <p>You&apos;ve sent {done === 1 ? "1 slip" : `${done} slips`} today.</p>}
          </div>
          <SlipForm snapshot={snapshot} job={job} today={today} />
        </>
      )}
    </main>
  );
}
