"use client";

// Links here are plain <a> page loads, not client-side navigation, so the
// phone's copy of each screen opens when there's no signal.
/* eslint-disable @next/next/no-html-link-for-pages */

import { useSyncExternalStore } from "react";
import { formatDate, formatTime, todayISO } from "@/lib/dates";
import { flhaStatus, jobFormsToday, todaysJob, useOnPhone, usePick } from "@/lib/offline/today";
import type { WorkerSnapshot } from "@/lib/offline/types";
import { useWorkerData } from "@/lib/offline/use-worker-data";
import { JobFormFill } from "./job-form-fill";

// Which form: the part of the link after "#". It stays on the phone, so this
// one screen is kept for every form and opens with no signal.
function useFormId(): string {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener("hashchange", fn);
      return () => window.removeEventListener("hashchange", fn);
    },
    () => decodeURIComponent(window.location.hash.slice(1)),
    () => "",
  );
}

export function JobFormScreen({ initial }: { initial: WorkerSnapshot }) {
  const { snapshot, outbox } = useWorkerData(initial);
  const today = todayISO();
  const pick = usePick(initial.userId, today);
  const formId = useFormId();
  // The job pick and the form live on the phone, so decide what to show once there.
  const ready = useOnPhone();

  const { job } = todaysJob(snapshot, today, pick);
  const flha = job ? flhaStatus(snapshot, outbox, job.id, today) : null;
  const flhaDone = flha?.state === "sent" || flha?.state === "waiting";
  const form = job ? jobFormsToday(snapshot, outbox, job.id, today).find((f) => f.form_id === formId) : undefined;

  const back = (
    <a href="/" className="underline">
      Back home
    </a>
  );

  return (
    <main data-offline-page className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{ready && form ? form.name : "Job form"}</h1>
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
      ) : !form ? (
        <p className="text-lg">This form isn&apos;t on {job.name}. {back}</p>
      ) : form.done ? (
        <p className="text-lg">
          Today&apos;s {form.name} for {job.name} is done. {form.done.by} sent it at {formatTime(form.done.filledAt)}. {back}
        </p>
      ) : (
        <>
          <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            {job.name} · {formatDate(today)}
          </p>
          <JobFormFill key={form.version_id} snapshot={snapshot} job={job} today={today} form={form} />
        </>
      )}
    </main>
  );
}
