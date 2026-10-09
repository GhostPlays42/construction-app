"use client";

// Links here are plain <a> page loads, not client-side navigation, so the
// phone's copy of each screen opens when there's no signal.
/* eslint-disable @next/next/no-html-link-for-pages */

import { formatDate, todayISO } from "@/lib/dates";
import { hoursText, timeLabel } from "@/lib/offline/time-card-rules";
import { flhaStatus, timeCardFor, todaysJob, useOnPhone, usePick, type TimeCardView } from "@/lib/offline/today";
import type { WorkerSnapshot } from "@/lib/offline/types";
import { useWorkerData } from "@/lib/offline/use-worker-data";
import { TimeCardForm } from "./time-card-form";

export function TimeCardScreen({ initial }: { initial: WorkerSnapshot }) {
  const { snapshot, outbox } = useWorkerData(initial);
  const today = todayISO();
  const pick = usePick(initial.userId, today);
  // The job pick lives on the phone, so decide what to show once there.
  const ready = useOnPhone();

  const { job } = todaysJob(snapshot, today, pick);
  const flha = job ? flhaStatus(snapshot, outbox, job.id, today) : null;
  const flhaDone = flha?.state === "sent" || flha?.state === "waiting";
  const card = job ? timeCardFor(snapshot, outbox, job.id, today) : null;

  return (
    <main data-offline-page className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Time card</h1>
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
      ) : card?.state === "approved" ? (
        <>
          <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            {job.name} · {formatDate(today)}
          </p>
          <p role="status" className="rounded-xl bg-green-100 p-4 text-lg text-green-900 dark:bg-green-950 dark:text-green-100">
            Approved by the office. Ask them if anything needs changing.
          </p>
          <CardSummary card={card} snapshot={snapshot} />
        </>
      ) : (
        <>
          <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            {job.name} · {formatDate(today)}
          </p>
          {card && (
            <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
              You sent this already. Change anything below and send it again.
            </p>
          )}
          <TimeCardForm key={card?.id ?? "new"} snapshot={snapshot} job={job} today={today} existing={card} />
        </>
      )}
    </main>
  );
}

const item = "rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg dark:border-zinc-800";

// A read-only time card, for once the office has approved it.
function CardSummary({ card, snapshot }: { card: TimeCardView; snapshot: WorkerSnapshot }) {
  const office = snapshot.timeCards.find((c) => c.id === card.id);
  const codeName = (id: string) => {
    const c = snapshot.lists.codes.find((x) => x.id === id) ?? office?.lines.find((l) => l.cost_code_id === id);
    return c ? `${c.code} ${c.name}` : "";
  };
  const machineName = (id: string) =>
    office?.equipment.find((e) => e.equipment_id === id)?.name ??
    snapshot.lists.equipment.find((m) => m.id === id)?.name ??
    "";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">
        {timeLabel(card.start)} to {timeLabel(card.end)}, {card.breakMinutes} min break ·{" "}
        <span className="font-semibold">{hoursText(card.workedMinutes)}</span>
      </p>
      <div className="flex flex-col gap-2">
        {card.lines.map((l, i) => (
          <div key={i} className={item}>
            <p className="font-medium">
              {codeName(l.cost_code_id)} · {hoursText(l.minutes)}
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">{l.description}</p>
          </div>
        ))}
      </div>
      {card.equipment.length > 0 && (
        <div className="flex flex-col gap-2">
          {card.equipment.map((e) => (
            <p key={e.equipment_id} className={item}>
              {machineName(e.equipment_id)} · {hoursText(e.minutes)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
