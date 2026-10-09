import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
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
  const [people, machines] = await Promise.all([crewChoices(supabase, onCrew), equipmentChoices(supabase, onJob)]);

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
    </main>
  );
}
