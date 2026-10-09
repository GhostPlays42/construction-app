"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export type JobFormState = { error?: string; values?: Record<string, string> };

const STATUSES = ["active", "paused", "complete"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function friendlyDbError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Another job already uses that job number.";
  if (error.code === "23514") return "The end date can't be before the start date.";
  if (error.code === "23503") return "Someone or something picked can't be put on this job. Refresh and try again.";
  return "Something went wrong. Check your connection and try again.";
}

// Adds a job (id null) or saves changes to one, along with its crew.
export async function saveJob(
  id: string | null,
  _prev: JobFormState,
  fd: FormData,
): Promise<JobFormState> {
  const { supabase, companyId } = await requireAdmin();
  const crew = fd.getAll("crew").map(String);
  const equipment = fd.getAll("equipment").map(String);
  const values = {
    name: text(fd, "name"),
    job_number: text(fd, "job_number"),
    address: text(fd, "address"),
    client: text(fd, "client"),
    start_date: text(fd, "start_date"),
    end_date: text(fd, "end_date"),
    status: text(fd, "status") || "active",
    crew: crew.join(","),
    equipment: equipment.join(","),
  };
  const fail = (error: string): JobFormState => ({ error, values });

  if (!values.name) return fail("Enter the job name.");
  if ((values.start_date && !DATE.test(values.start_date)) || (values.end_date && !DATE.test(values.end_date))) {
    return fail("Pick the dates from the calendar.");
  }
  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    return fail("The end date can't be before the start date.");
  }
  if (!STATUSES.includes(values.status as (typeof STATUSES)[number])) {
    return fail("Pick a status.");
  }

  const record = {
    name: values.name.slice(0, 120),
    job_number: values.job_number.slice(0, 40) || null,
    address: values.address.slice(0, 300) || null,
    client: values.client.slice(0, 120) || null,
    start_date: values.start_date || null,
    end_date: values.end_date || null,
    status: values.status,
  };

  let jobId = id;
  if (id === null) {
    const { data, error } = await supabase
      .from("jobs")
      .insert({ ...record, company_id: companyId })
      .select("id")
      .single();
    if (error) return fail(friendlyDbError(error));
    jobId = data.id;
  } else {
    const { error } = await supabase.from("jobs").update(record).eq("id", id);
    if (error) return fail(friendlyDbError(error));
  }

  const [{ error: crewError }, { error: equipmentError }] = await Promise.all([
    supabase.rpc("set_job_crew", { p_job_id: jobId!, p_employee_ids: crew }),
    supabase.rpc("set_job_equipment", { p_job_id: jobId!, p_equipment_ids: equipment }),
  ]);
  const listError = crewError ?? equipmentError;
  if (listError) {
    // The job is saved; send them to it to try the crew and equipment again.
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/equipment");
    if (id === null) redirect(`/admin/jobs/${jobId}?crew=failed`);
    return fail(`Saved, but the crew or equipment didn't save. ${friendlyDbError(listError)}`);
  }

  revalidatePath("/admin/jobs");
  revalidatePath("/admin/equipment");
  redirect("/admin/jobs");
}
