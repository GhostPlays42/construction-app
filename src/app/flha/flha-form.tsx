"use client";

import { useState } from "react";
import { addToOutbox, sendWaiting } from "@/lib/offline/outbox";
import { checkFlha, flhaMessage } from "@/lib/offline/flha-rules";
import type { FlhaPayload, WorkerSnapshot } from "@/lib/offline/types";
import { SignaturePad } from "./signature-pad";

const box = "h-7 w-7 flex-none accent-amber-500";
const row =
  "flex items-center gap-3 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg has-[:checked]:border-amber-500 dark:border-zinc-800";
const text =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 4000;

function toggle(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function FlhaForm({
  snapshot,
  job,
  today,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
}) {
  const { codes, hazards, ppe } = snapshot.lists;
  const [tasks, setTasks] = useState<Set<string>>(new Set());
  const [controls, setControls] = useState<Map<string, string>>(new Map());
  const [other, setOther] = useState("");
  const [otherControl, setOtherControl] = useState("");
  const [worn, setWorn] = useState<Set<string>>(new Set());
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Saved on the phone first, then sent. With no signal it waits on the
  // phone and home shows it as waiting to send.
  async function submit() {
    const payload: FlhaPayload = {
      jobId: job.id,
      jobName: job.name,
      workDate: today,
      filledAt: new Date().toISOString(),
      tasks: [...tasks],
      hazards: [...controls].map(([hazard_id, control]) => ({ hazard_id, control })),
      otherHazard: other.trim(),
      otherControl: other.trim() ? otherControl.trim() : "",
      ppe: [...worn],
      signature,
    };
    const problem = checkFlha(payload);
    if (problem) return setError(flhaMessage(problem));

    setError("");
    setPending(true);
    try {
      await addToOutbox({
        id: crypto.randomUUID(),
        kind: "flha",
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
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">1. What are you doing today?</legend>
        {codes.length === 0 && (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Your office hasn&apos;t added any tasks yet. Ask them to add cost codes.
          </p>
        )}
        {codes.map((c) => (
          <label key={c.id} className={row}>
            <input
              type="checkbox"
              className={box}
              checked={tasks.has(c.id)}
              onChange={() => setTasks(toggle(tasks, c.id))}
            />
            <span>
              <span className="font-medium">{c.code}</span> {c.name}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">2. Hazards on site</legend>
        <p className="-mt-1 text-base text-zinc-600 dark:text-zinc-400">
          Tick each hazard and say how you&apos;ll control it.
        </p>
        {hazards.map((h) => {
          const picked = controls.has(h.id);
          return (
            <div key={h.id} className="flex flex-col gap-2">
              <label className={row}>
                <input
                  type="checkbox"
                  className={box}
                  checked={picked}
                  onChange={() => {
                    const next = new Map(controls);
                    if (picked) next.delete(h.id);
                    else next.set(h.id, "");
                    setControls(next);
                  }}
                />
                <span>{h.name}</span>
              </label>
              {picked && (
                <div className="pl-6">
                  <input
                    aria-label={`How you'll control: ${h.name}`}
                    placeholder="How I'll control it"
                    value={controls.get(h.id)}
                    onChange={(e) => setControls(new Map(controls).set(h.id, e.target.value))}
                    className={text}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <input
            aria-label="Other hazard"
            placeholder="Other hazard (optional)"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className={text}
          />
          {other.trim() && (
            <input
              aria-label="How you'll control: Other hazard"
              placeholder="How I'll control it"
              value={otherControl}
              onChange={(e) => setOtherControl(e.target.value)}
              className={text}
            />
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">3. PPE you&apos;re wearing</legend>
        {ppe.map((p) => (
          <label key={p.id} className={row}>
            <input type="checkbox" className={box} checked={worn.has(p.id)} onChange={() => setWorn(toggle(worn, p.id))} />
            <span>{p.name}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">4. Sign with your finger</legend>
        <SignaturePad value={signature} onChange={setSignature} />
      </fieldset>

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
          {pending ? "Saving…" : "Submit FLHA"}
        </button>
      </div>
    </form>
  );
}
