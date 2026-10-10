import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, formatTime, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Trucking slips" };

export default async function TruckingSlipsPage({
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

  const [slips, jobs] = await Promise.all([
    supabase
      .from("trucking_slips")
      .select(
        "id, job_id, filled_at, status, read_status, trucking_company, ticket_number, material, loads, tonnage, employees(full_name), trucking_slip_changes(count)",
      )
      .eq("work_date", date)
      .order("filled_at"),
    supabase.from("jobs").select("id, name, status").order("name"),
  ]);
  const failed = slips.error || jobs.error;

  const sent = slips.data ?? [];
  // Active jobs, plus any other job with slips that day.
  const rows = (jobs.data ?? [])
    .filter((j) => j.status === "active" || sent.some((s) => s.job_id === j.id))
    .map((j) => ({ job: j, slips: sent.filter((s) => s.job_id === j.id) }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Trucking slips</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <nav className="flex items-center justify-between gap-2" aria-label="Pick a day">
        <Link
          href={`/admin/trucking-slips?date=${addDays(date, -1)}`}
          className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700"
        >
          ← Day before
        </Link>
        <span className="text-lg font-semibold">{date === today ? "Today" : formatDate(date)}</span>
        {date < today ? (
          <Link
            href={`/admin/trucking-slips?date=${addDays(date, 1)}`}
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
          Couldn&apos;t load trucking slips. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map(({ job, slips }) => (
            <section key={job.id} className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{job.name}</h2>
              {slips.length === 0 ? (
                <p className="text-lg text-zinc-600 dark:text-zinc-400">No slips</p>
              ) : (
                slips.map((s) => {
                  const corrected = (s.trucking_slip_changes[0]?.count ?? 0) > 0;
                  const amounts = [
                    s.loads != null && `${Number(s.loads)} ${Number(s.loads) === 1 ? "load" : "loads"}`,
                    s.tonnage != null && `${Number(s.tonnage)} t`,
                  ].filter(Boolean);
                  return (
                    <Link
                      key={s.id}
                      href={`/admin/trucking-slips/${s.id}`}
                      className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                    >
                      <span className="flex items-center justify-between gap-2 text-lg">
                        <span className="font-semibold">
                          {s.ticket_number ? `Ticket ${s.ticket_number}` : "No ticket # yet"}
                        </span>
                        {s.status === "unchecked" ? (
                          <span className="text-amber-700 dark:text-amber-400">Not checked yet</span>
                        ) : corrected ? (
                          <span className="text-green-700 dark:text-green-400">✓ Corrected by office</span>
                        ) : (
                          <span className="text-green-700 dark:text-green-400">✓ Checked</span>
                        )}
                      </span>
                      <span className="text-base text-zinc-600 dark:text-zinc-400">
                        {[s.trucking_company, s.material, ...amounts].filter(Boolean).join(" · ") || "Not read yet"}
                      </span>
                      <span className="text-base text-zinc-600 dark:text-zinc-400">
                        {s.employees?.full_name ?? "Unknown"} · {formatTime(s.filled_at)}
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
