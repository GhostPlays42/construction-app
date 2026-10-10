import { useSyncExternalStore } from "react";
import { officeHas } from "./outbox";
import { workedMinutes } from "./time-card-rules";
import type { JobFormCopy, OutboxItem, TimeCardPayload, WorkerSnapshot } from "./types";

type Job = WorkerSnapshot["jobs"][number];

// Today's jobs are the worker's active jobs that have started. The job the
// office sent them to today comes first and is picked for them; with several
// (or none sent), the worker's pick for today (kept on the phone) decides.
// Saved as the pick while the worker is choosing another job.
export const SWITCHING = "switching";

export function todaysJob(snapshot: WorkerSnapshot, today: string, pick: string | null) {
  const sent = (snapshot.schedule ?? []).filter((s) => s.work_date === today);
  const started = snapshot.jobs.filter((j) => !j.start_date || j.start_date <= today);
  const isSent = (j: Job) => sent.some((s) => s.job_id === j.id);
  const jobs = [...started.filter(isSent), ...started.filter((j) => !isSent(j))];
  const dispatched = jobs.filter(isSent);
  const job: Job | undefined =
    pick === SWITCHING
      ? undefined
      : (jobs.find((j) => j.id === pick) ??
        (dispatched.length === 1 ? dispatched[0] : dispatched.length === 0 && jobs.length === 1 ? jobs[0] : undefined));
  const plan = job ? sent.find((s) => s.job_id === job.id) : undefined;
  return { jobs, job, plan, dispatched: dispatched.map((j) => j.id) };
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

export type TimeCardView = {
  id: string;
  // Waiting on the phone, sent to the office, approved there, or stuck.
  state: "waiting" | "sent" | "approved" | "failed";
  error?: string;
  filledAt: string;
  workedMinutes: number;
} & Pick<TimeCardPayload, "start" | "end" | "breakMinutes" | "lines" | "equipment">;

// This worker's time card for a job and day: the phone's newer copy while
// it's on its way, otherwise the office's.
export function timeCardFor(
  snapshot: WorkerSnapshot,
  outbox: OutboxItem[],
  jobId: string,
  day: string,
): TimeCardView | null {
  const item = outbox
    .filter((i) => i.kind === "time-card" && i.payload.jobId === jobId && i.payload.workDate === day)
    .at(-1);
  if (item?.kind === "time-card" && !(item.status === "sent" && officeHas(snapshot, item))) {
    const p = item.payload;
    return {
      id: item.id,
      state: item.status,
      error: item.error,
      filledAt: p.filledAt,
      workedMinutes: workedMinutes(p.start, p.end, p.breakMinutes) ?? 0,
      start: p.start,
      end: p.end,
      breakMinutes: p.breakMinutes,
      lines: p.lines,
      equipment: p.equipment,
    };
  }
  const card = snapshot.timeCards.find((c) => c.job_id === jobId && c.work_date === day);
  if (!card) return null;
  return {
    id: card.id,
    state: card.status === "approved" ? "approved" : "sent",
    filledAt: card.filled_at,
    workedMinutes: card.worked_minutes,
    start: card.start_time.slice(0, 5),
    end: card.end_time.slice(0, 5),
    breakMinutes: card.break_minutes,
    lines: card.lines.map(({ cost_code_id, minutes, description }) => ({ cost_code_id, minutes, description })),
    equipment: card.equipment.map(({ equipment_id, minutes }) => ({ equipment_id, minutes })),
  };
}

export type SafetyStatus =
  | { state: "sent"; filledAt: string; ledBy: string }
  | { state: "waiting"; filledAt: string; ledBy: string }
  | { state: "failed"; error: string; itemId: string }
  | null;

// Whether today's safety meeting for a job has happened: sent by anyone on
// the crew, or saved on this phone and waiting to send, or stuck.
export function safetyStatus(
  snapshot: WorkerSnapshot,
  outbox: OutboxItem[],
  jobId: string,
  today: string,
): SafetyStatus {
  const sent = snapshot.safetyMeetings.find((m) => m.job_id === jobId && m.work_date === today);
  if (sent) return { state: "sent", filledAt: sent.filled_at, ledBy: sent.led_by_name };
  const me = snapshot.crews.find((c) => c.employee_id === snapshot.employeeId)?.full_name ?? snapshot.firstName;
  const mine = outbox.filter(
    (i) => i.kind === "safety-meeting" && i.payload.jobId === jobId && i.payload.workDate === today,
  );
  const delivered = mine.find((i) => i.status === "sent");
  if (delivered) return { state: "sent", filledAt: delivered.payload.filledAt, ledBy: me };
  const waiting = mine.find((i) => i.status === "waiting");
  if (waiting) return { state: "waiting", filledAt: waiting.payload.filledAt, ledBy: me };
  const failed = mine.find((i) => i.status === "failed");
  if (failed) return { state: "failed", error: failed.error ?? "", itemId: failed.id };
  return null;
}

// How many site photos & notes this worker has sent for a job today, and how
// many are saved on the phone waiting to send or stuck.
export function sitePhotosToday(snapshot: WorkerSnapshot, outbox: OutboxItem[], jobId: string, today: string) {
  const sentIds = new Set(
    (snapshot.siteEntries ?? []).filter((e) => e.job_id === jobId && e.work_date === today).map((e) => e.id),
  );
  const mine = outbox.filter(
    (i) => i.kind === "site-photos" && i.payload.jobId === jobId && i.payload.workDate === today,
  );
  for (const i of mine) if (i.status === "sent") sentIds.add(i.id);
  return {
    sent: sentIds.size,
    waiting: mine.filter((i) => i.status === "waiting").length,
    failed: mine.filter((i) => i.status === "failed").length,
  };
}

// How many trucking slips this worker has sent for a job today, and how many
// are saved on the phone waiting to send.
export function slipsToday(snapshot: WorkerSnapshot, outbox: OutboxItem[], jobId: string, today: string) {
  const sentIds = new Set(
    (snapshot.truckingSlips ?? []).filter((s) => s.job_id === jobId && s.work_date === today).map((s) => s.id),
  );
  const mine = outbox.filter(
    (i) => i.kind === "trucking-slip" && i.payload.jobId === jobId && i.payload.workDate === today,
  );
  for (const i of mine) if (i.status === "sent") sentIds.add(i.id);
  return { sent: sentIds.size, waiting: mine.filter((i) => i.status === "waiting").length };
}

export type JobFormView = JobFormCopy & {
  // Once-a-day forms: who sent today's, and when (sent, or waiting on this phone).
  done: { by: string; filledAt: string; waiting: boolean } | null;
  // Any-time forms: how many this worker sent today, and how many are waiting.
  sent: number;
  waiting: number;
};

// The office's forms on a job, with what's been sent on each today.
export function jobFormsToday(snapshot: WorkerSnapshot, outbox: OutboxItem[], jobId: string, today: string): JobFormView[] {
  const me = snapshot.crews.find((c) => c.employee_id === snapshot.employeeId)?.full_name ?? snapshot.firstName;
  return (snapshot.forms ?? [])
    .filter((f) => f.job_id === jobId)
    .map((f) => {
      const sentToday = (snapshot.formSubmissions ?? []).filter(
        (s) => s.form_id === f.form_id && s.job_id === jobId && s.work_date === today,
      );
      const mine = outbox.filter(
        (i) => i.kind === "job-form" && i.payload.formId === f.form_id && i.payload.jobId === jobId && i.payload.workDate === today,
      );
      const ids = new Set(sentToday.filter((s) => s.mine).map((s) => s.id));
      for (const i of mine) if (i.status === "sent") ids.add(i.id);
      const waiting = mine.filter((i) => i.status === "waiting");

      let done: JobFormView["done"] = null;
      if (f.frequency === "once_daily") {
        const office = sentToday[0];
        const phone = mine.find((i) => i.status === "sent") ?? waiting[0];
        if (office) done = { by: office.sent_by, filledAt: office.filled_at, waiting: false };
        else if (phone) done = { by: me, filledAt: phone.payload.filledAt, waiting: phone.status === "waiting" };
      }
      return { ...f, done, sent: ids.size, waiting: waiting.length };
    });
}
