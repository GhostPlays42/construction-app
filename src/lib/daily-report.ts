// A job's daily report, as public.daily_report_content builds it. Times are
// minutes; clock times are "HH:MM" in the company's time zone.
export type ReportContent = {
  job: { id: string; name: string; job_number: string | null; address: string | null; client: string | null };
  date: string;
  manpower: {
    name: string;
    trade: string | null;
    start: string;
    end: string;
    break_minutes: number;
    minutes: number;
    approved: boolean;
  }[];
  total_minutes: number;
  cost_codes: { code: string; name: string; minutes: number; lines: { name: string; minutes: number; description: string }[] }[];
  equipment: { name: string; unit_number: string | null; minutes: number; by: { name: string; minutes: number }[] }[];
  flhas: {
    name: string;
    done: boolean;
    filled_at: string | null;
    tasks: string[];
    hazards: { name: string; control: string }[];
    ppe: string[];
  }[];
  safety_meeting: {
    led_by: string;
    filled_at: string;
    topic: string;
    hazards: string[];
    attendees: { name: string; signed: boolean }[];
  } | null;
  trucking: {
    sent_by: string;
    filled_at: string;
    checked: boolean;
    trucking_company: string | null;
    truck_number: string | null;
    ticket_number: string | null;
    material: string | null;
    loads: number | null;
    tonnage: number | null;
    slip_date: string | null;
    photo_path: string;
  }[];
  total_loads: number | null;
  total_tonnage: number | null;
  site_entries: {
    sent_by: string;
    filled_at: string;
    notes: string | null;
    photos: { path: string; code: string | null; code_name: string | null; caption: string | null }[];
  }[];
  missing: string[];
};

// 510 minutes as "8.5 h".
export function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 100) / 100} h`;
}

// "15:30" as "3:30 p.m.".
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "a.m." : "p.m.";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Short plain-words messages for the database's error codes.
export const REPORT_MESSAGES: Record<string, string> = {
  no_access: "Only office admins can do this.",
  not_found: "This report couldn't be found.",
  not_ready: "This report isn't ready yet. Reports are ready at noon the next day.",
  already_finalized: "This report was already finalized.",
  pdf_missing: "The PDF didn't upload. Try again.",
};

export function reportMessage(code: string): string {
  return REPORT_MESSAGES[code] ?? "Something went wrong. Try again.";
}
