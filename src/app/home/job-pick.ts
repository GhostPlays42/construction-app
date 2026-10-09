import { todayISO } from "@/lib/dates";

export const JOB_PICK_COOKIE = "job_pick";

// The job id saved by pickJob, or null if none was picked today.
export function pickedJobId(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [day, jobId] = cookie.split("_");
  return day === todayISO() && jobId ? jobId : null;
}
