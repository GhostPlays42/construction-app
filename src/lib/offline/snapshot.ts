import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/dates";
import type { Question } from "@/lib/forms";
import type { Database } from "@/lib/supabase/database.types";
import type { WorkerSnapshot } from "./types";

// Everything a worker's screens need, in one go. Row level security limits
// jobs (and their machines, crews, safety meetings and forms) to the ones
// they're assigned to, and FLHAs, time cards, site photos, slips and sent
// forms to their own. Returns null
// when the person has no access.
export async function buildSnapshot(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WorkerSnapshot | null> {
  const { data: me } = await supabase
    .from("employees")
    .select("id, company_id, full_name, companies(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) return null;

  const since = addDays(todayISO(), -1);
  const today = todayISO();
  const [jobs, flhas, cards, codes, hazards, ppe, machines, meetings, crews, entries, slips, schedule, unread, forms, sentForms] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, address, start_date")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("flhas")
      .select("id, job_id, work_date, filled_at")
      .eq("employee_id", me.id)
      .gte("work_date", since),
    supabase
      .from("time_cards")
      .select(
        "id, job_id, work_date, start_time, end_time, break_minutes, worked_minutes, status, filled_at, time_card_lines(cost_code_id, code, name, minutes, description, position), time_card_equipment(equipment_id, name, minutes, position)",
      )
      .eq("employee_id", me.id)
      .gte("work_date", since),
    supabase.from("cost_codes").select("id, code, name").eq("is_active", true).order("sort_order").order("code"),
    supabase.from("hazards").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("ppe_items").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("job_equipment").select("job_id, equipment(id, name, unit_number, is_active)"),
    supabase
      .from("safety_meetings")
      .select("id, job_id, work_date, filled_at, employees(full_name)")
      .gte("work_date", since),
    supabase.rpc("my_job_crews"),
    supabase
      .from("site_entries")
      .select("id, job_id, work_date, filled_at")
      .eq("employee_id", me.id)
      .gte("work_date", since),
    supabase
      .from("trucking_slips")
      .select("id, job_id, work_date, filled_at, status, ticket_number")
      .eq("employee_id", me.id)
      .gte("work_date", since)
      .order("filled_at"),
    supabase
      .from("schedule_entries")
      .select("work_date, job_id, start_time, notes, jobs(name, address)")
      .eq("employee_id", me.id)
      .gte("work_date", today)
      .lte("work_date", addDays(today, 13))
      .order("work_date")
      .order("start_time", { nullsFirst: false }),
    supabase.rpc("chat_unread"),
    supabase.rpc("my_job_forms"),
    supabase.rpc("my_form_submissions", { p_since: since }),
  ]);
  const failed =
    jobs.error ??
    flhas.error ??
    cards.error ??
    codes.error ??
    hazards.error ??
    ppe.error ??
    machines.error ??
    meetings.error ??
    crews.error ??
    entries.error ??
    slips.error ??
    schedule.error ??
    unread.error ??
    forms.error ??
    sentForms.error;
  if (failed) throw new Error(failed.message);

  const equipment = new Map<string, { id: string; name: string; job_ids: string[] }>();
  for (const row of machines.data ?? []) {
    const m = row.equipment;
    if (!m?.is_active) continue;
    const entry = equipment.get(m.id) ?? { id: m.id, name: machineName(m), job_ids: [] };
    entry.job_ids.push(row.job_id);
    equipment.set(m.id, entry);
  }
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

  return {
    userId,
    employeeId: me.id,
    firstName: me.full_name.split(" ")[0],
    companyName: me.companies?.name ?? "",
    companyId: me.company_id,
    fetchedAt: new Date().toISOString(),
    jobs: jobs.data ?? [],
    flhas: flhas.data ?? [],
    timeCards: (cards.data ?? []).map(({ time_card_lines, time_card_equipment, status, ...card }) => ({
      ...card,
      status: status === "approved" ? "approved" : "submitted",
      lines: [...time_card_lines]
        .sort(byPosition)
        .map(({ cost_code_id, code, name, minutes, description }) => ({ cost_code_id, code, name, minutes, description })),
      equipment: [...time_card_equipment]
        .sort(byPosition)
        .map(({ equipment_id, name, minutes }) => ({ equipment_id, name, minutes })),
    })),
    safetyMeetings: (meetings.data ?? []).map(({ employees, ...m }) => ({
      ...m,
      led_by_name: employees?.full_name ?? "",
    })),
    crews: crews.data ?? [],
    chatUnread: unread.data ?? [],
    forms: (forms.data ?? []).map((f) => ({
      ...f,
      frequency: f.frequency === "once_daily" ? "once_daily" : "many",
      questions: f.questions as Question[],
    })),
    formSubmissions: sentForms.data ?? [],
    schedule: (schedule.data ?? []).map(({ jobs, ...s }) => ({
      ...s,
      job_name: jobs?.name ?? "A job",
      address: jobs?.address ?? null,
    })),
    siteEntries: entries.data ?? [],
    truckingSlips: (slips.data ?? []).map((s) => ({ ...s, status: s.status === "checked" ? "checked" : "unchecked" })),
    lists: {
      codes: codes.data ?? [],
      hazards: hazards.data ?? [],
      ppe: ppe.data ?? [],
      equipment: [...equipment.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

// "Excavator #EX-12", the way time cards show a machine.
export function machineName(m: { name: string; unit_number: string | null }) {
  return m.unit_number ? `${m.name} #${m.unit_number}` : m.name;
}
