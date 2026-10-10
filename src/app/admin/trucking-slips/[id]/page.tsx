import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { formValues } from "@/lib/slip-values";
import { EditSlip } from "./edit-slip";

export const metadata: Metadata = { title: "Trucking slip" };

const label = "text-zinc-600 dark:text-zinc-400";

export default async function TruckingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: slip } = await supabase
    .from("trucking_slips")
    .select(
      "id, work_date, filled_at, status, read_status, read_values, photo_path, trucking_company, truck_number, ticket_number, material, loads, tonnage, slip_date, jobs(name, job_number), employees(full_name), trucking_slip_changes(id, changed_at, field, old_value, new_value, employees(full_name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!slip) notFound();
  const { data: link } = await supabase.storage.from("slip-photos").createSignedUrl(slip.photo_path, 60 * 60);
  const changes = [...slip.trucking_slip_changes].sort((a, b) => b.id - a.id);

  const values: [string, string | null][] = [
    ["Trucking company", slip.trucking_company],
    ["Truck #", slip.truck_number],
    ["Ticket #", slip.ticket_number],
    ["Material", slip.material],
    ["Loads", slip.loads == null ? null : String(Number(slip.loads))],
    ["Tonnage", slip.tonnage == null ? null : `${Number(slip.tonnage)} t`],
    ["Date on slip", slip.slip_date && formatDate(slip.slip_date)],
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Trucking slip</h1>
        <Link
          href={`/admin/trucking-slips?date=${slip.work_date}`}
          className="text-base text-zinc-600 underline dark:text-zinc-400"
        >
          Trucking slips
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">
          {slip.jobs?.name}
          {slip.jobs?.job_number && <span className={`font-normal ${label}`}> · #{slip.jobs.job_number}</span>}
        </p>
        <p className={label}>
          {formatDate(slip.work_date)} at {formatTime(slip.filled_at)} · Sent by {slip.employees?.full_name ?? "Unknown"}
        </p>
        <p className={label}>
          {slip.status === "checked"
            ? "Checked"
            : slip.read_status === "pending"
              ? "Not read or checked yet"
              : "Read, not checked yet"}
        </p>
      </div>

      {link?.signedUrl ? (
        <a href={link.signedUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
          <img src={link.signedUrl} alt="Slip photo" className="w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-800" />
        </a>
      ) : (
        <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">Couldn&apos;t load the photo. Refresh to try again.</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Values</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
          {values.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className={label}>{name}</dt>
              <dd>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <EditSlip id={slip.id} initial={formValues(slip)} />
      </section>

      {changes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Office changes</h2>
          <ul className="flex flex-col gap-2 text-lg">
            {changes.map((c) => (
              <li key={c.id} className="rounded-xl border-2 border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <p>
                  <span className="font-medium">{c.field}:</span> {c.old_value ?? "blank"} → {c.new_value ?? "blank"}
                </p>
                <p className={`text-base ${label}`}>
                  {c.employees?.full_name ?? "Unknown"} · {formatDateTime(c.changed_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
