import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, formatTime, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "FLHAs" };

type Row = { employeeId: string; name: string; flhaId?: string; filledAt?: string };

export default async function FlhasPage({
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

  const [flhas, jobs, people] = await Promise.all([
    supabase.from("flhas").select("id, job_id, employee_id, filled_at").eq("work_date", date),
    supabase.from("jobs").select("id, name, job_number, status, job_assignments(employee_id)").order("name"),
    supabase.from("employees").select("id, full_name, is_active"),
  ]);
  const failed = flhas.error || jobs.error || people.error;

  const names = new Map((people.data ?? []).map((p) => [p.id, p]));
  const done = flhas.data ?? [];
  // Active jobs, plus any other job someone did an FLHA for that day. Who
  // should have done one comes from today's crew lists until dispatch exists.
  const groups = (jobs.data ?? [])
    .filter((j) => j.status === "active" || done.some((f) => f.job_id === j.id))
    .map((j) => {
      const rows = new Map<string, Row>();
      for (const a of j.job_assignments) {
        const p = names.get(a.employee_id);
        if (p?.is_active) rows.set(a.employee_id, { employeeId: a.employee_id, name: p.full_name });
      }
      for (const f of done.filter((f) => f.job_id === j.id)) {
        rows.set(f.employee_id, {
          employeeId: f.employee_id,
          name: names.get(f.employee_id)?.full_name ?? "Unknown",
          flhaId: f.id,
          filledAt: f.filled_at,
        });
      }
      const list = [...rows.values()].sort(
        (a, b) => Number(!!a.flhaId) - Number(!!b.flhaId) || a.name.localeCompare(b.name),
      );
      return { job: j, rows: list, doneCount: list.filter((r) => r.flhaId).length };
    });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">FLHAs</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <nav className="flex items-center justify-between gap-2" aria-label="Pick a day">
        <Link
          href={`/admin/flha?date=${addDays(date, -1)}`}
          className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
        >
          ← Day before
        </Link>
        <span className="text-lg font-semibold">{date === today ? "Today" : formatDate(date)}</span>
        {date < today ? (
          <Link
            href={`/admin/flha?date=${addDays(date, 1)}`}
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
          Couldn&apos;t load FLHAs. Refresh to try again.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
      ) : (
        groups.map(({ job, rows, doneCount }) => (
          <section key={job.id} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">
              {job.name}
              {job.job_number && (
                <span className="font-normal text-zinc-600 dark:text-zinc-400"> · #{job.job_number}</span>
              )}
            </h2>
            <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">
              {rows.length === 0 ? "No crew on this job." : `${doneCount} of ${rows.length} done`}
            </p>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.employeeId}>
                  {r.flhaId ? (
                    <Link
                      href={`/admin/flha/${r.flhaId}`}
                      className="flex items-center justify-between rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                    >
                      <span>{r.name}</span>
                      <span className="text-green-700 dark:text-green-400">✓ {formatTime(r.filledAt!)}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-lg dark:border-red-900 dark:bg-red-950">
                      <span>{r.name}</span>
                      <span className="text-red-700 dark:text-red-300">Not done</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
