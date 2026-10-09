"use client";

import { formatDate, formatDateTime, formatTime, todayISO } from "@/lib/dates";
import { mapLink } from "@/lib/maps";
import { flhaMessage } from "@/lib/offline/flha-rules";
import { removeFromOutbox } from "@/lib/offline/outbox";
import { flhaStatus, savePick, todaysJob, usePick } from "@/lib/offline/today";
import type { WorkerSnapshot } from "@/lib/offline/types";
import { useWorkerData } from "@/lib/offline/use-worker-data";
import { SignOutButton } from "./sign-out-button";

// The forms a worker fills in on a job. They unlock once the FLHA is done.
const FORMS = ["Time card", "Trucking slip", "Site photos"];

const card = "flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800";

// The worker's home screen. It draws from the phone's copy of their job and
// lists, so it works with no signal.
export function WorkerHome({ initial }: { initial: WorkerSnapshot }) {
  const { snapshot, outbox, offline, signedOut, send } = useWorkerData(initial);
  const today = todayISO();
  const pick = usePick(initial.userId, today);

  const { jobs, job } = todaysJob(snapshot, today, pick);
  const flha = job ? flhaStatus(snapshot, outbox, job.id, today) : null;
  const waiting = outbox.filter((i) => i.status === "waiting");
  const failed = outbox.filter((i) => i.status === "failed");

  const choose = (jobId: string | null) => savePick(initial.userId, today, jobId);

  return (
    <main data-offline-page className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{snapshot.companyName}</p>
        <h1 className="text-3xl font-bold">Hi, {snapshot.firstName}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{formatDate(today)}</p>
      </div>

      {offline && (
        <p role="status" className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
          No signal. You can keep filling in forms; they&apos;ll send when signal comes back.
          <span className="mt-1 block text-base text-zinc-600 dark:text-zinc-400">
            Job and lists last updated {formatDateTime(snapshot.fetchedAt)}
          </span>
        </p>
      )}
      {signedOut && (
        <p role="alert" className="rounded-xl bg-amber-100 p-4 text-lg text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          You&apos;ve been signed out, so forms can&apos;t send.{" "}
          <a href="/login" className="font-semibold underline">
            Sign in again
          </a>{" "}
          when you have signal. Your forms stay saved on this phone.
        </p>
      )}

      {(waiting.length > 0 || failed.length > 0) && (
        <section className="flex flex-col gap-2" aria-label="Not sent yet">
          {waiting.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <span className="text-lg font-semibold">
                {waiting.length === 1 ? "1 form" : `${waiting.length} forms`} waiting to send
              </span>
              <button
                type="button"
                onClick={() => send()}
                className="rounded-lg border-2 border-amber-700 px-3 py-2 text-base dark:border-amber-300"
              >
                Send now
              </button>
            </div>
          )}
          {failed.map((item) => (
            <div key={item.id} role="alert" className="flex flex-col gap-2 rounded-xl bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100">
              <p className="text-lg font-semibold">
                Couldn&apos;t send your FLHA for {item.payload.jobName} ({formatDate(item.payload.workDate)})
              </p>
              <p className="text-base">{flhaMessage(item.error ?? "")}</p>
              <button
                type="button"
                onClick={() => removeFromOutbox(item.id)}
                className="self-start rounded-lg border-2 border-red-700 px-3 py-2 text-base dark:border-red-300"
              >
                I&apos;ve told the office, remove it
              </button>
            </div>
          ))}
        </section>
      )}

      {jobs.length === 0 ? (
        <div className={card}>
          <h2 className="text-xl font-semibold">You&apos;re not on a job yet</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Your office will add you to one. It will show up here.
          </p>
        </div>
      ) : !job ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Which job are you on today?</h2>
          {jobs.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => choose(j.id)}
              className="flex w-full flex-col items-start gap-1 rounded-xl border-2 border-zinc-300 p-4 text-left active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-900"
            >
              <span className="text-xl font-semibold">{j.name}</span>
              {(j.job_number || j.address) && (
                <span className="text-base text-zinc-600 dark:text-zinc-400">
                  {[j.job_number && `#${j.job_number}`, j.address].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          ))}
        </section>
      ) : (
        <>
          <section className={card} aria-label="Today's job">
            <p className="text-base text-zinc-600 dark:text-zinc-400">Today&apos;s job</p>
            <h2 className="text-2xl font-bold">{job.name}</h2>
            {job.job_number && <p className="text-lg text-zinc-600 dark:text-zinc-400">#{job.job_number}</p>}
            {job.address && (
              <>
                <p className="text-lg">{job.address}</p>
                <a
                  href={mapLink(job.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-medium text-amber-700 underline dark:text-amber-400"
                >
                  Open in maps
                </a>
              </>
            )}
            {jobs.length > 1 && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="mt-2 self-start text-base text-zinc-600 underline dark:text-zinc-400"
              >
                Switch job
              </button>
            )}
          </section>

          {flha?.state === "sent" || flha?.state === "waiting" ? (
            <div
              role="status"
              className="flex items-center justify-between rounded-xl bg-green-100 px-4 py-5 text-xl font-semibold text-green-900 dark:bg-green-950 dark:text-green-100"
            >
              <span>
                FLHA done
                {flha.state === "waiting" && (
                  <span className="block text-base font-normal">Waiting to send</span>
                )}
              </span>
              <span className="text-lg font-normal">✓ {formatTime(flha.filledAt)}</span>
            </div>
          ) : (
            // A plain link (not client-side navigation) so the phone's copy
            // of the FLHA screen opens when there's no signal.
            <a
              href="/flha"
              className="w-full rounded-xl bg-amber-500 px-4 py-5 text-center text-2xl font-bold text-black active:bg-amber-600"
            >
              Start FLHA
            </a>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Job forms</h2>
            <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">
              {flha?.state === "sent" || flha?.state === "waiting"
                ? "Coming soon. These are being built next."
                : "These unlock once your FLHA is done."}
            </p>
            {FORMS.map((name) => (
              <button
                key={name}
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border-2 border-zinc-200 px-4 py-4 text-xl text-zinc-500 dark:border-zinc-800"
              >
                <span>{name}</span>
                <span aria-hidden className="text-base">
                  🔒
                </span>
              </button>
            ))}
          </section>
        </>
      )}

      <SignOutButton userId={initial.userId} waiting={waiting.length} />
    </main>
  );
}
