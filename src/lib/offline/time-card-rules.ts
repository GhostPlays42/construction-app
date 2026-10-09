import type { TimeCardPayload } from "./types";

// Plain-words messages for the short codes the database and these checks use.
export const TIME_CARD_MESSAGES: Record<string, string> = {
  bad_times: "Pick a start and end time.",
  bad_break: "The break is longer than the shift. Check your times.",
  line_required: "Add at least one line for the work you did.",
  line_hours: "Enter hours for each line in quarter hours, like 4 or 3.5 or 2.25.",
  description_required: "Say what you did on each line.",
  description_too_long: "Keep each description under 500 characters.",
  hours_dont_match: "Your lines need to add up to the hours you worked.",
  too_many_lines: "That's too many lines. Combine some of them.",
  equipment_hours: "Enter hours for each machine you ticked, like 4 or 3.5.",
  equipment_too_long: "A machine can't have more hours than you worked.",
  flha_required: "Do your FLHA for this job first.",
  already_done: "You already sent a time card for this job today.",
  already_approved: "The office already approved this time card. Ask them to make any changes.",
  job_not_available: "You're no longer on this job. Check with your office.",
  item_not_available: "The office changed a cost code or machine while this was waiting. Check with your office.",
  bad_time: "Your phone's clock was wrong when you filled this in. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  not_found: "That time card wasn't found.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function timeCardMessage(code: string): string {
  return TIME_CARD_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}

// "07:30" -> minutes after midnight.
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// End minus start minus break; an end before the start runs past midnight.
// Null when the times don't make a shift.
export function workedMinutes(start: string, end: string, breakMinutes: number): number | null {
  if (!start || !end || start === end) return null;
  const worked = ((toMinutes(end) - toMinutes(start) + 1440) % 1440) - breakMinutes;
  return worked > 0 ? worked : null;
}

// 450 -> "7.5h"
export function hoursText(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))}h`;
}

// What the worker typed ("7.5", "7,5", "7") -> minutes, or null if it isn't
// a whole number of quarter hours.
export function parseHours(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return null;
  const minutes = Math.round(n * 60);
  return Math.abs(n * 60 - minutes) < 0.01 && minutes % 15 === 0 ? minutes : null;
}

// Every quarter hour of the day, for the start and end pickers.
export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
  return { value, label };
});

export function timeLabel(time: string): string {
  return TIME_OPTIONS.find((o) => o.value === time.slice(0, 5))?.label ?? time.slice(0, 5);
}

export const BREAK_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 120];

// The same checks the database makes, run on the phone so a worker with no
// signal finds out straight away. Returns a code, or null when it's ready.
export function checkTimeCard(p: Pick<TimeCardPayload, "start" | "end" | "breakMinutes" | "lines" | "equipment">) {
  if (!p.start || !p.end || p.start === p.end) return "bad_times";
  const worked = workedMinutes(p.start, p.end, p.breakMinutes);
  if (worked === null) return "bad_break";
  if (p.lines.length === 0) return "line_required";
  if (p.lines.length > 30 || p.equipment.length > 30) return "too_many_lines";
  if (p.lines.some((l) => !l.cost_code_id)) return "line_required";
  if (p.lines.some((l) => !(l.minutes > 0 && l.minutes % 15 === 0))) return "line_hours";
  if (p.lines.some((l) => !l.description.trim())) return "description_required";
  if (p.lines.some((l) => l.description.trim().length > 500)) return "description_too_long";
  if (p.lines.reduce((sum, l) => sum + l.minutes, 0) !== worked) return "hours_dont_match";
  if (p.equipment.some((e) => !(e.minutes > 0 && e.minutes % 15 === 0))) return "equipment_hours";
  if (p.equipment.some((e) => e.minutes > worked)) return "equipment_too_long";
  return null;
}
