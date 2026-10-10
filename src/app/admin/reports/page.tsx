import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Daily reports" };

// How many days back the list goes.
const DAYS = 30;

export default async function ReportsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("daily_report_days", { p_days: DAYS });
  const rows = data ?? [];
  const drafts = rows.filter((r) => !r.report_id);
  const finalized = rows.filter((r) => r.report_id);

  const card =
    "flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900";
  const muted = "text-base text-zinc-600 dark:text-zinc-400";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Daily reports</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <p className={`-mt-3 ${muted}`}>
        Each active job gets a draft report at noon the next day. Check it, fix anything missing, then finalize it.
      </p>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load reports. Refresh to try again.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Waiting to finalize</h2>
            {drafts.length === 0 ? (
              <p className={`text-lg ${muted}`}>Nothing waiting.</p>
            ) : (
              drafts.map((r) => (
                <Link key={`${r.job_id}-${r.work_date}`} href={`/admin/reports/${r.job_id}/${r.work_date}`} className={card}>
                  <span className="flex items-center justify-between gap-2 text-lg">
                    <span className="font-semibold">{r.job_name}</span>
                    <span className="text-amber-700 dark:text-amber-400">Draft</span>
                  </span>
                  <span className={muted}>
                    {formatDate(r.work_date)}
                    {r.job_number && ` · #${r.job_number}`}
                  </span>
                </Link>
              ))
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Finalized</h2>
            {finalized.length === 0 ? (
              <p className={`text-lg ${muted}`}>None in the last {DAYS} days.</p>
            ) : (
              finalized.map((r) => (
                <Link key={r.report_id} href={`/admin/reports/${r.job_id}/${r.work_date}`} className={card}>
                  <span className="flex items-center justify-between gap-2 text-lg">
                    <span className="font-semibold">{r.job_name}</span>
                    <span className="text-green-700 dark:text-green-400">✓ Finalized</span>
                  </span>
                  <span className={muted}>
                    {formatDate(r.work_date)} · finalized {formatDateTime(r.finalized_at)}
                    {!r.has_pdf && " · PDF not made yet"}
                  </span>
                </Link>
              ))
            )}
          </section>
          <p className={muted}>Older finalized reports are on each job&apos;s page.</p>
        </>
      )}
    </main>
  );
}
