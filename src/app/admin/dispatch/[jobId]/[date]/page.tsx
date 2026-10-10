import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { todayISO } from "@/lib/dates";
import { DATE, shortDay } from "@/lib/dispatch";
import { saveDispatch } from "../../actions";
import { DispatchForm } from "./dispatch-form";

export const metadata: Metadata = { title: "Plan a job" };

export default async function PlanPage({ params }: { params: Promise<{ jobId: string; date: string }> }) {
  const { jobId, date } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !DATE.test(date) || date < todayISO()) notFound();
  const { supabase } = await requireAdmin();

  const [{ data: job }, { data: plans }, { data: people }, { data: machines }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, address, status, job_assignments(employee_id)")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("dispatches")
      .select("job_id, start_time, notes, jobs(name), dispatch_people(employee_id), dispatch_equipment(equipment_id)")
      .eq("work_date", date),
    supabase.from("employees").select("id, full_name, trade").eq("is_active", true).order("full_name"),
    supabase
      .from("equipment")
      .select("id, name, unit_number, equipment_type, down_for_repair")
      .eq("is_active", true)
      .order("unit_number", { nullsFirst: false })
      .order("name"),
  ]);
  if (!job || job.status !== "active") notFound();

  const mine = plans?.find((p) => p.job_id === jobId);
  // Where else each person and machine is planned this day.
  const elsewhere = new Map<string, string[]>();
  for (const p of plans ?? []) {
    if (p.job_id === jobId) continue;
    const name = p.jobs?.name ?? "another job";
    for (const id of [...p.dispatch_people.map((x) => x.employee_id), ...p.dispatch_equipment.map((x) => x.equipment_id)]) {
      elsewhere.set(id, [...(elsewhere.get(id) ?? []), name]);
    }
  }
  // The job's crew first, then everyone else.
  const crew = new Set(job.job_assignments.map((a) => a.employee_id));
  const sorted = [...(people ?? [])].sort((a, b) => Number(crew.has(b.id)) - Number(crew.has(a.id)));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{job.name}</h1>
        <Link href={`/admin/dispatch?date=${date}`} className="text-base text-zinc-600 underline dark:text-zinc-400">
          Dispatch
        </Link>
      </div>
      <p className="-mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        {shortDay(date)}
        {date === todayISO() && " (today)"}
        {job.job_number && ` · #${job.job_number}`}
      </p>

      <DispatchForm
        action={saveDispatch.bind(null, jobId, date)}
        date={date}
        people={sorted.map((p) => ({
          id: p.id,
          label: p.full_name,
          hint: [crew.has(p.id) ? "On this job's crew" : p.trade, ...(elsewhere.get(p.id) ?? []).map((j) => `Also on ${j}`)]
            .filter(Boolean)
            .join(" · "),
          warn: elsewhere.has(p.id),
        }))}
        machines={(machines ?? []).map((m) => ({
          id: m.id,
          label: m.unit_number ? `${m.unit_number} · ${m.name}` : m.name,
          hint: [m.equipment_type, m.down_for_repair ? "Down for repair" : null, ...(elsewhere.get(m.id) ?? []).map((j) => `Also on ${j}`)]
            .filter(Boolean)
            .join(" · "),
          warn: elsewhere.has(m.id) || m.down_for_repair,
        }))}
        initial={{
          start: mine?.start_time?.slice(0, 5) ?? "",
          notes: mine?.notes ?? "",
          people: mine?.dispatch_people.map((p) => p.employee_id) ?? [],
          equipment: mine?.dispatch_equipment.map((q) => q.equipment_id) ?? [],
        }}
      />
    </main>
  );
}
