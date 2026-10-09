import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { hoursText } from "@/lib/offline/time-card-rules";

export const metadata: Metadata = { title: "Time cards" };

type Row = { employeeId: string; name: string; cardId?: string; minutes?: number; approved?: boolean };

export default async function TimeCardsPage({
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

  const [cards, jobs, people] = await Promise.all([
    supabase.from("time_cards").select("id, job_id, employee_id, worked_minutes, status").eq("work_date", date),
    supabase.from("jobs").select("id, name, job_number, status, job_assignments(employee_id)").order("name"),
    supabase.from("employees").select("id, full_name, is_active"),
  ]);
  const failed = cards.error || jobs.error || people.error;

  const names = new Map((people.data ?? []).map((p) => [p.id, p]));
  const sent = cards.data ?? [];
  // Active jobs, plus any other job someone sent a time card for that day.
  // Who should have sent one comes from the crew lists until dispatch exists.
  const groups = (jobs.data ?? [])
    .filter((j) => j.status === "active" || sent.some((c) => c.job_id === j.id))
    .map((j) => {
      const rows = new Map<string, Row>();
      for (const a of j.job_assignments) {
        const p = names.get(a.employee_id);
        if (p?.is_active) rows.set(a.employee_id, { employeeId: a.employee_id, name: p.full_name });
      }
      for (const c of sent.filter((c) => c.job_id === j.id)) {
        rows.set(c.employee_id, {
          employeeId: c.employee_id,
          name: names.get(c.employee_id)?.full_name ?? "Unknown",
          cardId: c.id,
          minutes: c.worked_minutes,
          approved: c.status === "approved",
        });
      }
      const list = [...rows.values()].sort(
        (a, b) => Number(!!a.cardId) - Number(!!b.cardId) || a.name.localeCompare(b.name),
      );
      return {
        job: j,
        rows: list,
        sentCount: list.filter((r) => r.cardId).length,
        toApprove: list.filter((r) => r.cardId && !r.approved).length,
      };
    });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Time cards</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <nav className="flex items-center justify-between gap-2" aria-label="Pick a day">
        <Link
          href={`/admin/time-cards?date=${addDays(date, -1)}`}
          className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
        >
          ← Day before
        </Link>
        <span className="text-lg font-semibold">{date === today ? "Today" : formatDate(date)}</span>
        {date < today ? (
          <Link
            href={`/admin/time-cards?date=${addDays(date, 1)}`}
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
          Couldn&apos;t load time cards. Refresh to try again.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
      ) : (
        groups.map(({ job, rows, sentCount, toApprove }) => (
          <section key={job.id} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">
              {job.name}
              {job.job_number && (
                <span className="font-normal text-zinc-600 dark:text-zinc-400"> · #{job.job_number}</span>
              )}
            </h2>
            <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">
              {rows.length === 0
                ? "No crew on this job."
                : `${sentCount} of ${rows.length} sent${toApprove ? ` · ${toApprove} to approve` : ""}`}
            </p>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.employeeId}>
                  {r.cardId ? (
                    <Link
                      href={`/admin/time-cards/${r.cardId}`}
                      className="flex items-center justify-between rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                    >
                      <span>{r.name}</span>
                      <span className={r.approved ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
                        {hoursText(r.minutes!)} · {r.approved ? "Approved ✓" : "To approve"}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-lg dark:border-red-900 dark:bg-red-950">
                      <span>{r.name}</span>
                      <span className="text-red-700 dark:text-red-300">Not sent</span>
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
