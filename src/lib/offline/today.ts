import { useSyncExternalStore } from "react";
import type { OutboxItem, WorkerSnapshot } from "./types";

type Job = WorkerSnapshot["jobs"][number];

// Until dispatch exists, today's jobs are the worker's active jobs that have
// started. With several, the worker's pick for today (kept on the phone)
// decides.
export function todaysJob(snapshot: WorkerSnapshot, today: string, pick: string | null) {
  const jobs = snapshot.jobs.filter((j) => !j.start_date || j.start_date <= today);
  const job: Job | undefined = jobs.length === 1 ? jobs[0] : jobs.find((j) => j.id === pick);
  return { jobs, job };
}

const pickKey = (userId: string) => `job_pick:${userId}`;

export function readPick(userId: string, today: string): string | null {
  try {
    const [day, jobId] = (localStorage.getItem(pickKey(userId)) ?? "").split("_");
    return day === today && jobId ? jobId : null;
  } catch {
    return null;
  }
}

export function savePick(userId: string, today: string, jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(pickKey(userId), `${today}_${jobId}`);
    else localStorage.removeItem(pickKey(userId));
  } catch {}
  window.dispatchEvent(new Event(PICK_CHANGED));
}

const PICK_CHANGED = "job-pick-changed";
const noop = () => () => {};

// The worker's job pick for today. The page is drawn on the server first,
// which can't see the phone's storage, so it starts as "none".
export function usePick(userId: string, today: string): string | null {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener(PICK_CHANGED, fn);
      return () => window.removeEventListener(PICK_CHANGED, fn);
    },
    () => readPick(userId, today),
    () => null,
  );
}

// False while the page is first drawn, true once it runs on the phone.
export function useOnPhone(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export type FlhaStatus =
  | { state: "sent"; filledAt: string }
  | { state: "waiting"; filledAt: string }
  | { state: "failed"; error: string; itemId: string }
  | null;

// Whether this worker's FLHA for a job is done today: sent to the office,
// saved on the phone and waiting to send, or stuck with a reason.
export function flhaStatus(
  snapshot: WorkerSnapshot,
  outbox: OutboxItem[],
  jobId: string,
  today: string,
): FlhaStatus {
  const sent = snapshot.flhas.find((f) => f.job_id === jobId && f.work_date === today);
  if (sent) return { state: "sent", filledAt: sent.filled_at };
  const mine = outbox.filter((i) => i.kind === "flha" && i.payload.jobId === jobId && i.payload.workDate === today);
  const delivered = mine.find((i) => i.status === "sent");
  if (delivered) return { state: "sent", filledAt: delivered.payload.filledAt };
  const waiting = mine.find((i) => i.status === "waiting");
  if (waiting) return { state: "waiting", filledAt: waiting.payload.filledAt };
  const failed = mine.find((i) => i.status === "failed");
  if (failed) return { state: "failed", error: failed.error ?? "", itemId: failed.id };
  return null;
}
