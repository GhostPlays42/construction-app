"use client";

import { useState } from "react";
import { Signature, SignaturePad } from "@/app/flha/signature-pad";
import { addToOutbox, sendWaiting } from "@/lib/offline/outbox";
import { checkSafetyMeeting, safetyMessage } from "@/lib/offline/safety-rules";
import type { SafetyMeetingPayload, WorkerSnapshot } from "@/lib/offline/types";

const box = "h-7 w-7 flex-none accent-amber-500";
const row =
  "flex items-center gap-3 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg has-[:checked]:border-amber-500 dark:border-zinc-800";
const text =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const small = "rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700";
// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 4000;

// How each person present was marked: their signature, or "tapped".
type Present = Record<string, string>;
const TAPPED = "tapped";

export function SafetyForm({
  snapshot,
  job,
  today,
  crew,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
  crew: WorkerSnapshot["crews"];
}) {
  const [hazards, setHazards] = useState<Set<string>>(new Set());
  const [other, setOther] = useState("");
  const [topic, setTopic] = useState("");
  const [present, setPresent] = useState<Present>({});
  // Whose signature is being drawn, and the drawing so far.
  const [signing, setSigning] = useState<string | null>(null);
  const [drawing, setDrawing] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const mark = (id: string, how: string | null) => {
    const next = { ...present };
    if (how) next[id] = how;
    else delete next[id];
    setPresent(next);
  };

  // Saved on the phone first, then sent. With no signal it waits on the
  // phone and home shows it as waiting to send.
  async function submit() {
    const payload: SafetyMeetingPayload = {
      jobId: job.id,
      jobName: job.name,
      workDate: today,
      filledAt: new Date().toISOString(),
      hazards: [...hazards],
      otherHazard: other.trim(),
      topic: topic.trim(),
      attendees: Object.entries(present).map(([employee_id, how]) => ({
        employee_id,
        signature: how === TAPPED ? null : how,
      })),
    };
    const problem = signing ? "finish_signing" : checkSafetyMeeting(payload);
    if (problem === "finish_signing") return setError("Finish the signature that's open, or cancel it.");
    if (problem) return setError(safetyMessage(problem));

    setError("");
    setPending(true);
    try {
      await addToOutbox({
        id: crypto.randomUUID(),
        kind: "safety-meeting",
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
        <legend className="mb-1 text-xl font-semibold">1. Hazards you talked about</legend>
        {snapshot.lists.hazards.map((h) => (
          <label key={h.id} className={row}>
            <input
              type="checkbox"
              className={box}
              checked={hazards.has(h.id)}
              onChange={() => {
                const next = new Set(hazards);
                if (next.has(h.id)) next.delete(h.id);
                else next.add(h.id);
                setHazards(next);
              }}
            />
            <span>{h.name}</span>
          </label>
        ))}
        <input
          aria-label="Other hazard"
          placeholder="Other hazard (optional)"
          value={other}
          maxLength={500}
          onChange={(e) => setOther(e.target.value)}
          className={text}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">2. Topic</legend>
        <textarea
          aria-label="Topic"
          rows={3}
          maxLength={2000}
          placeholder="What you talked about, like working near traffic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={text}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">3. Who was there</legend>
        <p className="-mt-1 text-base text-zinc-600 dark:text-zinc-400">
          Hand the phone to each person to sign, or tap their name.
        </p>
        {crew.map((c) => {
          const how = present[c.employee_id];
          return (
            <div
              key={c.employee_id}
              className={`flex flex-col gap-2 rounded-xl border-2 px-4 py-3 ${how ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-medium">{c.full_name}</span>
                {how ? (
                  <span className="flex items-center gap-3">
                    <span className="text-base text-green-700 dark:text-green-400">
                      ✓ {how === TAPPED ? "Name tapped" : "Signed"}
                    </span>
                    <button type="button" onClick={() => mark(c.employee_id, null)} className="text-base underline">
                      Undo
                    </button>
                  </span>
                ) : signing === c.employee_id ? null : (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSigning(c.employee_id);
                        setDrawing("");
                      }}
                      className={small}
                    >
                      Sign
                    </button>
                    <button
                      type="button"
                      onClick={() => mark(c.employee_id, TAPPED)}
                      className={small}
                      aria-label={`Tap name: ${c.full_name}`}
                    >
                      Tap name
                    </button>
                  </span>
                )}
              </div>
              {how && how !== TAPPED && <Signature path={how} />}
              {signing === c.employee_id && (
                <div className="flex flex-col gap-2">
                  <SignaturePad value={drawing} onChange={setDrawing} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!drawing}
                      onClick={() => {
                        mark(c.employee_id, drawing);
                        setSigning(null);
                      }}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-base font-semibold text-black disabled:opacity-40"
                    >
                      Done
                    </button>
                    <button type="button" onClick={() => setSigning(null)} className={small}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
          {pending ? "Saving…" : "Send safety meeting"}
        </button>
      </div>
    </form>
  );
}
