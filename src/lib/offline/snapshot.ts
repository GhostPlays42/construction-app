import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type { WorkerSnapshot } from "./types";

// Everything a worker's screens need, in one go. Row level security limits
// jobs to the ones they're assigned to and FLHAs to their own. Returns null
// when the person has no access.
export async function buildSnapshot(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WorkerSnapshot | null> {
  const { data: me } = await supabase
    .from("employees")
    .select("id, full_name, companies(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) return null;

  const [jobs, flhas, codes, hazards, ppe] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, address, start_date")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("flhas")
      .select("id, job_id, work_date, filled_at")
      .eq("employee_id", me.id)
      .gte("work_date", addDays(todayISO(), -1)),
    supabase.from("cost_codes").select("id, code, name").eq("is_active", true).order("sort_order").order("code"),
    supabase.from("hazards").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("ppe_items").select("id, name").eq("is_active", true).order("sort_order").order("name"),
  ]);
  const failed = jobs.error ?? flhas.error ?? codes.error ?? hazards.error ?? ppe.error;
  if (failed) throw new Error(failed.message);

  return {
    userId,
    employeeId: me.id,
    firstName: me.full_name.split(" ")[0],
    companyName: me.companies?.name ?? "",
    fetchedAt: new Date().toISOString(),
    jobs: jobs.data ?? [],
    flhas: flhas.data ?? [],
    lists: { codes: codes.data ?? [], hazards: hazards.data ?? [], ppe: ppe.data ?? [] },
  };
}
