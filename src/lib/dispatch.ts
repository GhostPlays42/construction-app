import { addDays } from "@/lib/dates";
import { clock } from "@/lib/daily-report";

// Start times the office can pick: every 15 minutes from 4 a.m. to 6 p.m.
export const START_TIMES: { value: string; label: string }[] = Array.from({ length: (18 - 4) * 4 + 1 }, (_, i) => {
  const minutes = 4 * 60 + i * 15;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value, label: clock(value) };
});

// "07:00:00" (as the database has it) as "7:00 a.m.".
export function startTime(time: string | null): string | null {
  return time ? clock(time.slice(0, 5)) : null;
}

// The Monday on or before a YYYY-MM-DD date.
export function weekStart(dateISO: string): string {
  const day = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return addDays(dateISO, -((day + 6) % 7));
}

// "Mon Oct 12" for a YYYY-MM-DD date.
export function shortDay(dateISO: string): string {
  return new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${dateISO}T00:00:00Z`),
  );
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Short plain-words messages for the database's error codes.
const DISPATCH_MESSAGES: Record<string, string> = {
  no_access: "Only office admins can do this.",
  past_date: "That day has gone. You can only plan today and later.",
  job_not_available: "This job isn't active any more. Set it to active on its job page first.",
  bad_time: "Pick a start time from the list.",
  notes_too_long: "The note is too long. Keep it under 1000 characters.",
  person_not_available: "Someone picked has been switched off. Refresh and pick again.",
  equipment_not_available: "A machine picked has been switched off. Refresh and pick again.",
};

export function dispatchMessage(code: string): string {
  return DISPATCH_MESSAGES[code] ?? "Something went wrong. Check your connection and try again.";
}
