import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/dates";
import { formValues } from "@/lib/slip-values";
import { createClient } from "@/lib/supabase/server";
import { CheckSlip } from "./check-slip";

export const metadata: Metadata = { title: "Check trucking slip" };

// The worker checks a slip they sent. This needs signal: the slip is read
// and saved on the server.
export default async function CheckSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const { data: slip } = await supabase
    .from("trucking_slips")
    .select(
      "id, filled_at, work_date, status, read_status, photo_path, trucking_company, truck_number, ticket_number, material, loads, tonnage, slip_date, jobs(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!slip) notFound();
  const { data: link } = await supabase.storage.from("slip-photos").createSignedUrl(slip.photo_path, 60 * 60);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Trucking slip</h1>
        {/* A full page load, so home opens from the phone's copy with no signal. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </a>
      </div>
      <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        {slip.jobs?.name} · {formatDate(slip.work_date)} at {formatTime(slip.filled_at)}
      </p>
      {link?.signedUrl && (
        <a href={link.signedUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
          <img src={link.signedUrl} alt="Slip photo" className="w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-800" />
        </a>
      )}
      {slip.status === "checked" ? (
        <div className="flex flex-col gap-1 text-lg">
          <p role="status" className="mb-2 rounded-xl bg-green-100 p-4 font-semibold text-green-900 dark:bg-green-950 dark:text-green-100">
            ✓ Checked
          </p>
          <p>Trucking company: {slip.trucking_company}</p>
          {slip.truck_number && <p>Truck #: {slip.truck_number}</p>}
          <p>Ticket #: {slip.ticket_number}</p>
          {slip.material && <p>Material: {slip.material}</p>}
          {slip.loads != null && <p>Loads: {Number(slip.loads)}</p>}
          {slip.tonnage != null && <p>Tonnage: {Number(slip.tonnage)} t</p>}
          {slip.slip_date && <p>Date on slip: {formatDate(slip.slip_date)}</p>}
        </div>
      ) : (
        <CheckSlip id={slip.id} readStatus={slip.read_status} initial={formValues(slip)} />
      )}
    </main>
  );
}
