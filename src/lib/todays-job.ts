import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_PICK_COOKIE, pickedJobId } from "@/app/home/job-pick";
import { todayISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

// The jobs a worker can be on today, and the one they're on. Row level
// security only returns jobs this worker is assigned to. Until dispatch
// exists, those active jobs (already started) are "today's jobs"; with
// several, the worker's pick for today decides.
export async function loadTodaysJob(supabase: SupabaseClient<Database>) {
  const [{ data, error }, store] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, address")
      .eq("status", "active")
      .or(`start_date.is.null,start_date.lte.${todayISO()}`)
      .order("name"),
    cookies(),
  ]);

  const jobs = data ?? [];
  const picked = pickedJobId(store.get(JOB_PICK_COOKIE)?.value);
  const job = jobs.length === 1 ? jobs[0] : jobs.find((j) => j.id === picked);
  return { jobs, job, failed: !!error };
}
