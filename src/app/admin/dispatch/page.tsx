import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { DATE, shortDay, startTime, weekStart } from "@/lib/dispatch";
import { pushPublicKey } from "@/lib/push";
import { SendButton } from "./send-button";

export const metadata: Metadata = { title: "Dispatch" };

const muted = "text-zinc-600 dark:text-zinc-400";
const warn = "text-amber-700 dark:text-amber-400";

type Plan = {
  job_id: string;
  work_date: string;
  start_time: string | null;
  notes: string | null;
  people: { id: string; name: string }[];
  machines: string[];
};

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const today = todayISO();
  const date = typeof params.date === "string" && DATE.test(params.date) ? params.date : today;
  const week = params.view === "week";
  const first = week ? weekStart(date) : date;
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : [date];
  const last = days.at(-1)!;

  const { supabase } = await requireAdmin();
  const [jobs, plans, people, unsent] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, start_date, end_date")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("dispatches")
      .select(
        "job_id, work_date, start_time, notes, dispatch_people(employee_id, employees(full_name)), dispatch_equipment(equipment(name, unit_number))",
      )
      .gte("work_date", first)
      .lte("work_date", last),
    supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.rpc("unsent_schedule_people"),
  ]);
  const failed = jobs.error ?? plans.error ?? people.error ?? unsent.error;
  // Jobs running on at least one of these days.
  const running = (jobs.data ?? []).filter((j) => (!j.start_date || j.start_date <= last) && (!j.end_date || j.end_date >= first));

  const planned: Plan[] = (plans.data ?? []).map((d) => ({
    job_id: d.job_id,
    work_date: d.work_date,
    start_time: d.start_time,
    notes: d.notes,
    people: d.dispatch_people
      .map((p) => ({ id: p.employee_id, name: p.employees?.full_name ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    machines: d.dispatch_equipment
      .map((q) => (q.equipment ? [q.equipment.unit_number, q.equipment.name].filter(Boolean).join(" · ") : ""))
      .sort(),
  }));
  const planFor = (jobId: string, day: string) => planned.find((p) => p.job_id === jobId && p.work_date === day);
  // People planned on more than one job on a day.
  const doubleBooked = (day: string, id: string) =>
    planned.filter((p) => p.work_date === day && p.people.some((x) => x.id === id)).length > 1;

  const unsentNames = (people.data ?? []).filter((p) => unsent.data?.includes(p.id)).map((p) => p.full_name);
  const link = (d: string, w = week) => `/admin/dispatch?date=${d}${w ? "&view=week" : ""}`;
  const step = week ? 7 : 1;

  return (
    <main className={`mx-auto flex w-full ${week ? "max-w-6xl" : "max-w-2xl"} flex-1 flex-col gap-6 px-4 py-10`}>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Dispatch</h1>
        <Link href="/" className={`text-base underline ${muted}`}>
          Home
        </Link>
      </div>

      {failed ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load the schedule. Refresh to try again.
        </p>
      ) : (
        <>
          {typeof params.sent === "string" && unsentNames.length === 0 && (
            <p role="status" className="rounded-xl bg-green-50 p-4 text-lg text-green-800 dark:bg-green-950 dark:text-green-200">
              ✓ Schedule sent{params.sent !== "0" && ` to ${plural(Number(params.sent), "person", "people")}`}.
              {params.told !== "0" && ` ${plural(Number(params.told), "phone", "phones")} notified.`}
            </p>
          )}
          {unsentNames.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-950">
              <p className="text-lg">
                <span className="font-semibold">Not sent yet.</span> Changes for {unsentNames.join(", ")}. They
                won&apos;t see them until you send.
              </p>
              <SendButton notificationsReady={pushPublicKey() !== null} here={link(date)} />
            </section>
          ) : (
            <p className={`-mt-3 text-base ${muted}`}>Everything planned has been sent to the crew.</p>
          )}

          <nav className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href={link(addDays(date, -step))} aria-label="Earlier" className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-lg dark:border-zinc-700">
                ‹
              </Link>
              <Link href={link(addDays(date, step))} aria-label="Later" className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-lg dark:border-zinc-700">
                ›
              </Link>
              <span className="text-lg font-semibold">
                {week ? `Week of ${formatDate(first)}` : `${shortDay(date)}${date === today ? " (today)" : ""}`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-base">
              {date !== today && (
                <Link href={link(today)} className="underline">
                  Today
                </Link>
              )}
              <span className="flex overflow-hidden rounded-lg border-2 border-zinc-300 dark:border-zinc-700">
                <Link href={link(date, false)} className={`px-3 py-1 ${week ? "" : "bg-amber-500 font-semibold text-black"}`}>
                  Day
                </Link>
                <Link href={link(date, true)} className={`px-3 py-1 ${week ? "bg-amber-500 font-semibold text-black" : ""}`}>
                  Week
                </Link>
              </span>
            </div>
          </nav>

          {running.length === 0 ? (
            <p className={`text-lg ${muted}`}>No active jobs on these days. Set a job to active on its job page.</p>
          ) : week ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] table-fixed border-collapse text-base">
                <thead>
                  <tr>
                    <th className="w-40 p-2 text-left">Job</th>
                    {days.map((d) => (
                      <th key={d} className={`p-2 text-left ${d === today ? "text-amber-700 dark:text-amber-400" : ""}`}>
                        {shortDay(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {running.map((j) => (
                    <tr key={j.id} className="border-t-2 border-zinc-200 align-top dark:border-zinc-800">
                      <td className="p-2 font-semibold">
                        {j.name}
                        {j.job_number && <span className={`block font-normal ${muted}`}>#{j.job_number}</span>}
                      </td>
                      {days.map((d) => {
                        const plan = planFor(j.id, d);
                        const open = d >= today && (!j.start_date || j.start_date <= d) && (!j.end_date || j.end_date >= d);
                        const inner = plan ? (
                          <>
                            {plan.start_time && <span className="block font-medium">{startTime(plan.start_time)}</span>}
                            {plan.people.map((p) => (
                              <span key={p.id} className={`block ${doubleBooked(d, p.id) ? warn : ""}`}>
                                {doubleBooked(d, p.id) && "⚠ "}
                                {p.name}
                              </span>
                            ))}
                            {plan.machines.length > 0 && (
                              <span className={`block ${muted}`}>
                                {plan.machines.length === 1 ? "1 machine" : `${plan.machines.length} machines`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className={muted}>{open ? "+ Plan" : ""}</span>
                        );
                        return (
                          <td key={d} className="p-1">
                            {open ? (
                              <Link
                                href={`/admin/dispatch/${j.id}/${d}`}
                                className="block min-h-16 rounded-lg p-2 hover:bg-zinc-100 active:bg-zinc-100 dark:hover:bg-zinc-900 dark:active:bg-zinc-900"
                              >
                                {inner}
                              </Link>
                            ) : (
                              <div className="min-h-16 p-2 opacity-70">{inner}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DayView
              date={date}
              today={today}
              jobs={running}
              planFor={planFor}
              doubleBooked={doubleBooked}
              people={people.data ?? []}
            />
          )}
          <p className={`text-base ${muted}`}>
            ⚠ means the person is planned on another job that day too. Workers only see days that have been sent.
          </p>
        </>
      )}
    </main>
  );
}

// "1 person", "3 people".
function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function DayView({
  date,
  today,
  jobs,
  planFor,
  doubleBooked,
  people,
}: {
  date: string;
  today: string;
  jobs: { id: string; name: string; job_number: string | null; start_date: string | null; end_date: string | null }[];
  planFor: (jobId: string, day: string) => Plan | undefined;
  doubleBooked: (day: string, id: string) => boolean;
  people: { id: string; full_name: string }[];
}) {
  const open = date >= today;
  const plannedIds = new Set(jobs.flatMap((j) => planFor(j.id, date)?.people.map((p) => p.id) ?? []));
  const free = people.filter((p) => !plannedIds.has(p.id));

  return (
    <>
      <section className="flex flex-col gap-3">
        {jobs.map((j) => {
          const plan = planFor(j.id, date);
          const started = (!j.start_date || j.start_date <= date) && (!j.end_date || j.end_date >= date);
          const body = (
            <>
              <span className="flex items-center justify-between gap-2 text-lg">
                <span className="font-semibold">
                  {j.name}
                  {j.job_number && <span className={`font-normal ${muted}`}> · #{j.job_number}</span>}
                </span>
                {open && started && <span className="text-amber-700 dark:text-amber-400">{plan ? "Change" : "Plan"}</span>}
              </span>
              {!plan ? (
                <span className={`text-base ${muted}`}>{started ? "Nobody planned." : "Not running this day."}</span>
              ) : (
                <>
                  <span className="text-base">
                    {startTime(plan.start_time) ? `Start ${startTime(plan.start_time)}` : "No start time"}
                  </span>
                  <span className="text-base">
                    {plan.people.length === 0
                      ? "Nobody planned."
                      : plan.people.map((p, i) => (
                          <span key={p.id} className={doubleBooked(date, p.id) ? warn : ""}>
                            {i > 0 && ", "}
                            {doubleBooked(date, p.id) && "⚠ "}
                            {p.name}
                          </span>
                        ))}
                  </span>
                  {plan.machines.length > 0 && <span className={`text-base ${muted}`}>{plan.machines.join(", ")}</span>}
                  {plan.notes && <span className="whitespace-pre-line text-base">Note: {plan.notes}</span>}
                </>
              )}
            </>
          );
          const box = "flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 dark:border-zinc-800";
          return open && started ? (
            <Link key={j.id} href={`/admin/dispatch/${j.id}/${date}`} className={`${box} active:bg-zinc-100 dark:active:bg-zinc-900`}>
              {body}
            </Link>
          ) : (
            <div key={j.id} className={box}>
              {body}
            </div>
          );
        })}
      </section>
      {free.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Not planned this day</h2>
          <p className={`text-lg ${muted}`}>{free.map((p) => p.full_name).join(", ")}</p>
        </section>
      )}
    </>
  );
}
