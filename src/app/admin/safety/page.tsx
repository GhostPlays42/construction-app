import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, formatTime, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Safety meetings" };

export default async function SafetyMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = todayISO();
  const date =
    typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today
      ? dateParam
      : today;
  const { supabase } = await requireAdmin();

  const [meetings, jobs, people] = await Promise.all([
    supabase
      .from("safety_meetings")
      .select("id, job_id, led_by, filled_at, safety_meeting_attendees(employee_id)")
      .eq("work_date", date),
    supabase.from("jobs").select("id, name, job_number, status, job_assignments(employee_id)").order("name"),
    supabase.from("employees").select("id, full_name, is_active"),
  ]);
  const failed = meetings.error || jobs.error || people.error;

  const names = new Map((people.data ?? []).map((p) => [p.id, p]));
  const held = meetings.data ?? [];
  // Active jobs, plus any other job that had a meeting that day.
  const rows = (jobs.data ?? [])
    .filter((j) => j.status === "active" || held.some((m) => m.job_id === j.id))
    .map((j) => ({
      job: j,
      meeting: held.find((m) => m.job_id === j.id),
      crew: j.job_assignments.filter((a) => names.get(a.employee_id)?.is_active).length,
    }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Safety meetings</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <nav className="flex items-center justify-between gap-2" aria-label="Pick a day">
        <Link
          href={`/admin/safety?date=${addDays(date, -1)}`}
          className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
        >
          ← Day before
        </Link>
        <span className="text-lg font-semibold">{date === today ? "Today" : formatDate(date)}</span>
        {date < today ? (
          <Link
            href={`/admin/safety?date=${addDays(date, 1)}`}
            className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
          >
            Day after →
          </Link>
        ) : (
          <span className="w-[7.5rem]" />
        )}
      </nav>

      {failed ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load safety meetings. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ job, meeting, crew }) => (
            <li key={job.id}>
              {meeting ? (
                <Link
                  href={`/admin/safety/${meeting.id}`}
                  className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                >
                  <span className="flex items-center justify-between gap-2 text-lg">
                    <span className="font-semibold">{job.name}</span>
                    <span className="text-green-700 dark:text-green-400">✓ {formatTime(meeting.filled_at)}</span>
                  </span>
                  <span className="text-base text-zinc-600 dark:text-zinc-400">
                    Run by {names.get(meeting.led_by)?.full_name ?? "Unknown"} ·{" "}
                    {meeting.safety_meeting_attendees.length} of {crew} crew there
                  </span>
                </Link>
              ) : (
                <div className="flex items-center justify-between rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-lg dark:border-red-900 dark:bg-red-950">
                  <span className="font-semibold">{job.name}</span>
                  <span className="text-red-700 dark:text-red-300">No meeting</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
