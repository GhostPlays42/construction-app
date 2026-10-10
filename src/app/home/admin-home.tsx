import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { byDay, missingForms, missingLink } from "@/lib/admin-home";
import type { ReportContent } from "@/lib/daily-report";
import { addDays, certStatus, EXPIRY_WARNING_DAYS, formatDate, todayISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

// How far back the office is asked about time cards and slips still waiting.
const LOOK_BACK_DAYS = 30;

const MENU = [
  { href: "/admin/reports", label: "Daily reports" },
  { href: "/admin/dispatch", label: "Dispatch" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/jobs", label: "Job sites" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/flha", label: "FLHAs" },
  { href: "/admin/safety", label: "Safety meetings" },
  { href: "/admin/site-photos", label: "Site photos" },
  { href: "/admin/trucking-slips", label: "Trucking slips" },
  { href: "/admin/time-cards", label: "Time cards" },
  { href: "/admin/forms", label: "Forms" },
  { href: "/admin/lists", label: "Lists" },
];

const card =
  "flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900";
const muted = "text-base text-zinc-600 dark:text-zinc-400";
const amber = "text-amber-700 dark:text-amber-400";
const green = "text-green-700 dark:text-green-400";
const red = "text-red-700 dark:text-red-400";

type Job = { id: string; name: string; job_number: string | null };

// A job is on the go that day when it's active and the day is within its dates.
function onTheGo(
  j: { status: string; start_date: string | null; end_date: string | null },
  date: string,
): boolean {
  return j.status === "active" && (!j.start_date || j.start_date <= date) && (!j.end_date || j.end_date >= date);
}

// The office's home: what needs doing, how today is going on each job, and
// what yesterday's reports are missing. Everything opens where it's fixed.
export async function AdminHome({
  supabase,
  companyName,
  firstName,
  owner,
  signOut,
}: {
  supabase: SupabaseClient<Database>;
  companyName: string;
  firstName: string;
  owner: boolean;
  signOut: React.ReactNode;
}) {
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const since = addDays(today, -LOOK_BACK_DAYS);

  const [jobs, reportDays, cards, slips, certs, machines, finalized] = await Promise.all([
    supabase.from("jobs").select("id, name, job_number, status, start_date, end_date").order("name"),
    supabase.rpc("daily_report_days", { p_days: LOOK_BACK_DAYS }),
    supabase.from("time_cards").select("work_date").eq("status", "submitted").gte("work_date", since),
    supabase.from("trucking_slips").select("work_date").eq("status", "unchecked").gte("work_date", since),
    supabase
      .from("certifications")
      .select("id, name, expires_on, employees!inner(id, full_name, is_active)")
      .eq("employees.is_active", true)
      .lte("expires_on", addDays(today, EXPIRY_WARNING_DAYS))
      .order("expires_on"),
    supabase.from("equipment").select("id, name, unit_number").eq("is_active", true).eq("down_for_repair", true).order("name"),
    supabase.from("daily_reports").select("job_id").eq("work_date", yesterday),
  ]);
  const failed = jobs.error || reportDays.error || cards.error || slips.error || certs.error || machines.error || finalized.error;

  const allJobs = jobs.data ?? [];
  const todayJobs: Job[] = allJobs.filter((j) => onTheGo(j, today));
  // Yesterday's jobs whose report isn't finalized yet.
  const yesterdayJobs: Job[] = allJobs.filter(
    (j) => onTheGo(j, yesterday) && !(finalized.data ?? []).some((r) => r.job_id === j.id),
  );
  const content = async (jobId: string, date: string) => {
    const { data } = await supabase.rpc("daily_report_content", { p_job_id: jobId, p_date: date });
    return (data as ReportContent | null) ?? null;
  };
  const [todayReports, yesterdayReports] = await Promise.all([
    Promise.all(todayJobs.map((j) => content(j.id, today))),
    Promise.all(yesterdayJobs.map((j) => content(j.id, yesterday))),
  ]);
  // Yesterday's report can be opened once it's ready at noon today.
  const ready = new Set((reportDays.data ?? []).map((d) => `${d.job_id}/${d.work_date}`));

  const drafts = (reportDays.data ?? []).filter((d) => !d.report_id).length;
  const cardDays = byDay(cards.data ?? []);
  const slipDays = byDay(slips.data ?? []);
  const certRows = certs.data ?? [];
  const down = machines.data ?? [];
  const needs = drafts + cardDays.length + slipDays.length + certRows.length + down.length;

  const missingYesterday = yesterdayJobs
    .map((job, i) => ({ job, missing: yesterdayReports[i]?.missing ?? [] }))
    .filter((r) => r.missing.length > 0);

  const row = (href: string, label: React.ReactNode, right: React.ReactNode, key?: string) => (
    <Link key={key ?? href} href={href} className={`${card} flex-row items-center justify-between`}>
      <span className="text-lg">{label}</span>
      <span className="text-lg font-semibold">{right}</span>
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10 lg:max-w-5xl">
      <div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{companyName}</p>
        <h1 className="text-3xl font-bold">Hi, {firstName}</h1>
        <p className={muted}>{formatDate(today)}</p>
      </div>

      {failed && (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Some of this couldn&apos;t load. Refresh to try again.
        </p>
      )}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-2" aria-label="Needs you">
            <h2 className="text-xl font-semibold">Needs you</h2>
            {needs === 0 ? (
              <p className={`text-lg ${muted}`}>Nothing needs you right now.</p>
            ) : (
              <>
                {drafts > 0 &&
                  row("/admin/reports", "Daily reports to finalize", <span className={amber}>{drafts}</span>)}
                {cardDays.map((d) =>
                  row(
                    `/admin/time-cards?date=${d.date}`,
                    <>
                      Time cards to approve <span className={muted}>· {formatDate(d.date)}</span>
                    </>,
                    <span className={amber}>{d.count}</span>,
                  ),
                )}
                {slipDays.map((d) =>
                  row(
                    `/admin/trucking-slips?date=${d.date}`,
                    <>
                      Trucking slips to check <span className={muted}>· {formatDate(d.date)}</span>
                    </>,
                    <span className={amber}>{d.count}</span>,
                  ),
                )}
                {certRows.map((c) => {
                  const expired = certStatus(c.expires_on) === "expired";
                  return row(
                    `/admin/people/${c.employees.id}`,
                    <>
                      {c.employees.full_name} <span className={muted}>· {c.name}</span>
                    </>,
                    <span className={`text-base ${expired ? red : amber}`}>
                      {expired ? "Expired" : "Expires"} {formatDate(c.expires_on!)}
                    </span>,
                    c.id,
                  );
                })}
                {down.map((m) =>
                  row(
                    `/admin/equipment/${m.id}`,
                    m.unit_number ? `${m.name} #${m.unit_number}` : m.name,
                    <span className={`text-base ${red}`}>Down for repair</span>,
                  ),
                )}
              </>
            )}
          </section>

          {missingYesterday.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Missing from yesterday">
              <h2 className="text-xl font-semibold">Missing from yesterday</h2>
              {missingYesterday.map(({ job, missing }) => (
                <div
                  key={job.id}
                  role="group"
                  aria-label={job.name}
                  className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{job.name}</span>
                    {ready.has(`${job.id}/${yesterday}`) && (
                      <Link href={`/admin/reports/${job.id}/${yesterday}`} className={`text-base underline ${amber}`}>
                        Open report
                      </Link>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {missing.map((m) => (
                      <li key={m}>
                        <Link href={missingLink(m, job.id, yesterday)} className="text-lg underline decoration-zinc-400">
                          {m}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>

        <section className="flex flex-col gap-2" aria-label="Today's jobs">
          <h2 className="text-xl font-semibold">Today&apos;s jobs</h2>
          {todayJobs.length === 0 ? (
            <p className={`text-lg ${muted}`}>No active jobs today.</p>
          ) : (
            todayJobs.map((job, i) => {
              const r = todayReports[i];
              const crew = r?.flhas.length ?? 0;
              const flhas = r?.flhas.filter((f) => f.done).length ?? 0;
              const timeCards = r?.manpower.length ?? 0;
              const formsDone = (r?.forms ?? []).map((f) => f.name);
              const formsToDo = missingForms(r?.missing ?? []);
              return (
                <Link key={job.id} href={`/admin/jobs/${job.id}`} className={card}>
                  <span className="flex items-baseline justify-between gap-2 text-lg">
                    <span className="font-semibold">{job.name}</span>
                    {job.job_number && <span className={muted}>#{job.job_number}</span>}
                  </span>
                  {!r ? (
                    <span className={muted}>Couldn&apos;t load today&apos;s progress.</span>
                  ) : crew === 0 ? (
                    <span className={muted}>No crew on this job today.</span>
                  ) : (
                    <>
                      <span className="text-base">
                        Crew {crew} ·{" "}
                        <span className={flhas === crew ? green : amber}>
                          FLHAs {flhas} of {crew}
                        </span>{" "}
                        ·{" "}
                        <span className={timeCards >= crew ? green : muted}>
                          Time cards {timeCards} of {crew}
                        </span>
                      </span>
                      <span className={`text-base ${r.safety_meeting ? green : amber}`}>
                        {r.safety_meeting ? "✓ Safety meeting done" : "No safety meeting yet"}
                      </span>
                      {formsDone.map((f) => (
                        <span key={f} className={`text-base ${green}`}>
                          ✓ {f}
                        </span>
                      ))}
                      {formsToDo.map((f) => (
                        <span key={f} className={`text-base ${amber}`}>
                          No {f} yet
                        </span>
                      ))}
                    </>
                  )}
                </Link>
              );
            })
          )}
        </section>
      </div>

      <nav aria-label="Menu" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-xl bg-amber-500 px-3 py-3 text-center text-lg font-semibold text-black active:bg-amber-600"
          >
            {m.label}
          </Link>
        ))}
        {owner && (
          <Link
            href="/owner"
            className="rounded-xl bg-zinc-100 px-3 py-3 text-center text-lg font-medium dark:bg-zinc-800"
          >
            Owner view
          </Link>
        )}
      </nav>
      <div className="lg:max-w-xs">{signOut}</div>
    </main>
  );
}
