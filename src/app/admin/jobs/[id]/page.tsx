import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { mapLink } from "@/lib/maps";
import { saveJob } from "../actions";
import { JobForm } from "../job-form";
import { crewChoices, equipmentChoices } from "../people";

export const metadata: Metadata = { title: "Edit job" };

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, { crew: crewParam }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, name, job_number, address, client, start_date, end_date, status, job_assignments(employee_id), job_equipment(equipment_id)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  const onCrew = job.job_assignments.map((a) => a.employee_id);
  const onJob = job.job_equipment.map((e) => e.equipment_id);
  const [people, machines, { data: reports }, { data: unread }, { data: forms }] = await Promise.all([
    crewChoices(supabase, onCrew),
    equipmentChoices(supabase, onJob),
    supabase
      .from("daily_reports")
      .select("id, work_date, pdf_path")
      .eq("job_id", job.id)
      .order("work_date", { ascending: false })
      .limit(100),
    supabase.rpc("chat_unread"),
    supabase.from("forms").select("id, name, all_jobs, form_jobs(job_id)").eq("is_active", true).order("name"),
  ]);
  const jobForms = (forms ?? []).filter((f) => f.all_jobs || f.form_jobs.some((j) => j.job_id === job.id));
  const newMessages = unread?.find((u) => u.job_id === job.id)?.unread ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{job.name}</h1>
        {job.address && (
          <a
            href={mapLink(job.address)}
            target="_blank"
            rel="noreferrer"
            className="text-lg text-amber-700 underline dark:text-amber-400"
          >
            Open address in Maps
          </a>
        )}
        <Link
          href={`/chat/${job.id}`}
          className="flex items-center justify-between rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg font-semibold active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-900"
        >
          <span>Job chat</span>
          {newMessages > 0 ? (
            <span className="rounded-full bg-amber-500 px-3 py-1 text-base text-black">{newMessages} new</span>
          ) : (
            <span aria-hidden>→</span>
          )}
        </Link>
      </div>

      {crewParam === "failed" && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
          The job was added, but the crew or equipment didn&apos;t save. Pick them again below.
        </p>
      )}

      <JobForm
        action={saveJob.bind(null, job.id)}
        people={people}
        machines={machines}
        initial={{
          name: job.name,
          job_number: job.job_number ?? "",
          address: job.address ?? "",
          client: job.client ?? "",
          start_date: job.start_date ?? "",
          end_date: job.end_date ?? "",
          status: job.status,
          crew: onCrew.join(","),
          equipment: onJob.join(","),
        }}
        isNew={false}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Forms on this job</h2>
        {jobForms.length === 0 ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            None. Put forms on jobs from{" "}
            <Link href="/admin/forms" className="underline">
              Forms
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobForms.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/forms/${f.id}`}
                  className="flex justify-between gap-2 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                >
                  <span>{f.name}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{f.all_jobs ? "All jobs" : "This job"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/admin/forms/sent?job=${job.id}`} className="self-start text-lg text-amber-700 underline dark:text-amber-400">
          Forms sent on this job
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Daily reports</h2>
        {!reports?.length ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">No finalized reports yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reports/${job.id}/${r.work_date}`}
                  className="flex justify-between gap-2 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
                >
                  <span>{formatDate(r.work_date)}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{r.pdf_path ? "PDF" : "PDF not made yet"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
