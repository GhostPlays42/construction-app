import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { activeJobs, describeMachine, equipmentStatus, STATUS_LABEL } from "@/lib/equipment";
import { saveEquipment } from "../actions";
import { EquipmentForm } from "../equipment-form";
import { equipmentTypes } from "../types";

export const metadata: Metadata = { title: "Edit equipment" };

export default async function EquipmentItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, { rate: rateParam }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();

  const [{ data: machine }, { data: rate }, types] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, unit_number, equipment_type, make, model, ownership, rental_company, down_for_repair, is_active, job_equipment(jobs(id, name, status))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("equipment_rates").select("hourly_rate").eq("equipment_id", id).maybeSingle(),
    equipmentTypes(supabase),
  ]);
  if (!machine) notFound();

  const status = equipmentStatus(machine);
  const jobs = activeJobs(machine.job_equipment);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{describeMachine(machine)}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          {STATUS_LABEL[status]}
          {jobs.length > 0 && (
            <>
              {status === "on_job" ? ": " : " · on "}
              {jobs.map((j, i) => (
                <span key={j.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/jobs/${j.id}`} className="text-amber-700 underline dark:text-amber-400">
                    {j.name}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          To move it to a job, open the job and tick it under Equipment.
        </p>
      </div>

      {rateParam === "failed" && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
          The machine was added, but the hourly rate didn&apos;t save. Enter it again below.
        </p>
      )}

      <EquipmentForm
        action={saveEquipment.bind(null, machine.id)}
        types={types}
        initial={{
          name: machine.name,
          unit_number: machine.unit_number ?? "",
          equipment_type: machine.equipment_type ?? "",
          make: machine.make ?? "",
          model: machine.model ?? "",
          ownership: machine.ownership,
          rental_company: machine.rental_company ?? "",
          hourly_rate: rate ? Number(rate.hourly_rate).toFixed(2) : "",
          down_for_repair: machine.down_for_repair ? "on" : "",
          is_active: machine.is_active ? "on" : "",
        }}
        isNew={false}
      />
    </main>
  );
}
