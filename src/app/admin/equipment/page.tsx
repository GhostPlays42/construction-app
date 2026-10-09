import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { activeJobs, describeMachine, equipmentStatus, type EquipmentStatus } from "@/lib/equipment";
import { Badge } from "../people/badges";

export const metadata: Metadata = { title: "Equipment" };

export default async function EquipmentPage() {
  const { supabase } = await requireAdmin();
  const { data: machines, error } = await supabase
    .from("equipment")
    .select(
      "id, name, unit_number, equipment_type, make, model, ownership, rental_company, down_for_repair, is_active, job_equipment(jobs(id, name, status))",
    )
    .order("unit_number", { nullsFirst: false })
    .order("name");

  const rows = (machines ?? []).map((m) => ({
    ...m,
    status: equipmentStatus(m),
    jobs: activeJobs(m.job_equipment),
  }));
  const byStatus = (s: EquipmentStatus) => rows.filter((m) => m.status === s);

  const card = (m: (typeof rows)[number]) => (
    <li key={m.id}>
      <Link
        href={`/admin/equipment/${m.id}`}
        className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
      >
        <span className="text-xl font-semibold">{describeMachine(m)}</span>
        {(m.equipment_type || m.make || m.model) && (
          <span className="text-base text-zinc-600 dark:text-zinc-400">
            {[m.equipment_type, [m.make, m.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
          </span>
        )}
        {m.ownership === "rented" && (
          <span className="text-base text-zinc-600 dark:text-zinc-400">Rented from {m.rental_company}</span>
        )}
        {m.status === "on_job" && (
          <span className="text-base text-zinc-600 dark:text-zinc-400">
            On {m.jobs.map((j) => j.name).join(", ")}
          </span>
        )}
        {m.status === "down" && (
          <span className="mt-1">
            <Badge color="red">Down for repair</Badge>
          </span>
        )}
      </Link>
    </li>
  );

  const section = (title: string, list: typeof rows) =>
    list.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          {title} ({list.length})
        </h2>
        <ul className="flex flex-col gap-3">{list.map(card)}</ul>
      </section>
    );

  const off = byStatus("off");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Equipment</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <Link
        href="/admin/equipment/new"
        className="rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Add equipment
      </Link>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load your equipment. Refresh to try again.
        </p>
      ) : (
        <>
          {rows.length === off.length && (
            <p className="text-lg text-zinc-600 dark:text-zinc-400">No equipment yet.</p>
          )}
          {section("Down for repair", byStatus("down"))}
          {section("On a job", byStatus("on_job"))}
          {section("Available", byStatus("available"))}
          {off.length > 0 && (
            <details>
              <summary className="cursor-pointer text-lg text-zinc-600 dark:text-zinc-400">
                Switched off ({off.length})
              </summary>
              <ul className="mt-3 flex flex-col gap-3">{off.map(card)}</ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
