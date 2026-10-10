import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, formatTime, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Site photos" };

export default async function SitePhotosPage({
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

  const [entries, jobs] = await Promise.all([
    supabase
      .from("site_entries")
      .select("id, job_id, filled_at, notes, employees(full_name), site_photos(count)")
      .eq("work_date", date)
      .order("filled_at"),
    supabase.from("jobs").select("id, name, status").order("name"),
  ]);
  const failed = entries.error || jobs.error;

  const sent = entries.data ?? [];
  // Active jobs, plus any other job with photos or notes that day.
  const rows = (jobs.data ?? [])
    .filter((j) => j.status === "active" || sent.some((e) => e.job_id === j.id))
    .map((j) => ({ job: j, entries: sent.filter((e) => e.job_id === j.id) }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Site photos</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <nav className="flex items-center justify-between gap-2" aria-label="Pick a day">
        <Link
          href={`/admin/site-photos?date=${addDays(date, -1)}`}
          className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
        >
          ← Day before
        </Link>
        <span className="text-lg font-semibold">{date === today ? "Today" : formatDate(date)}</span>
        {date < today ? (
          <Link
            href={`/admin/site-photos?date=${addDays(date, 1)}`}
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
          Couldn&apos;t load site photos. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map(({ job, entries }) => (
            <section key={job.id} className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{job.name}</h2>
              {entries.length === 0 ? (
                <p className="text-lg text-zinc-600 dark:text-zinc-400">Nothing sent</p>
              ) : (
                entries.map((e) => {
                  const count = e.site_photos[0]?.count ?? 0;
                  return (
                    <Link
                      key={e.id}
                      href={`/admin/site-photos/${e.id}`}
                      className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                    >
                      <span className="flex items-center justify-between gap-2 text-lg">
                        <span className="font-semibold">{e.employees?.full_name ?? "Unknown"}</span>
                        <span className="text-zinc-600 dark:text-zinc-400">{formatTime(e.filled_at)}</span>
                      </span>
                      <span className="text-base text-zinc-600 dark:text-zinc-400">
                        {count === 1 ? "1 photo" : `${count} photos`}
                        {e.notes ? ` · ${e.notes.length > 80 ? `${e.notes.slice(0, 80)}…` : e.notes}` : ""}
                      </span>
                    </Link>
                  );
                })
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
