import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { machineName } from "@/lib/offline/snapshot";
import { EditForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit time card" };

export default async function EditTimeCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: card } = await supabase
    .from("time_cards")
    .select(
      "id, job_id, employee_id, work_date, start_time, end_time, break_minutes, time_card_lines(cost_code_id, code, name, minutes, description, position), time_card_equipment(equipment_id, name, minutes, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!card) notFound();

  const [{ data: job }, { data: person }, { data: codes }, { data: machines }] = await Promise.all([
    supabase.from("jobs").select("name").eq("id", card.job_id).maybeSingle(),
    supabase.from("employees").select("full_name").eq("id", card.employee_id).maybeSingle(),
    supabase.from("cost_codes").select("id, code, name").eq("is_active", true).order("sort_order").order("code"),
    supabase.from("equipment").select("id, name, unit_number").eq("is_active", true).order("name"),
  ]);
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
  const lines = [...card.time_card_lines].sort(byPosition);
  const equipment = [...card.time_card_equipment].sort(byPosition);

  // The office can keep a cost code or machine already on the card even if
  // it has since been switched off.
  const codeOptions = [...(codes ?? [])];
  for (const l of lines) {
    if (!codeOptions.some((c) => c.id === l.cost_code_id)) {
      codeOptions.push({ id: l.cost_code_id, code: l.code, name: `${l.name} (switched off)` });
    }
  }
  const machineOptions = (machines ?? []).map((m) => ({ id: m.id, name: machineName(m) }));
  for (const e of equipment) {
    if (!machineOptions.some((m) => m.id === e.equipment_id)) {
      machineOptions.push({ id: e.equipment_id, name: `${e.name} (switched off)` });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Edit time card</h1>
        <Link href={`/admin/time-cards/${card.id}`} className="text-base text-zinc-600 underline dark:text-zinc-400">
          Cancel
        </Link>
      </div>
      <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        {person?.full_name} · {job?.name} · {formatDate(card.work_date)}
      </p>
      <EditForm
        id={card.id}
        initial={{
          start: card.start_time.slice(0, 5),
          end: card.end_time.slice(0, 5),
          breakMinutes: card.break_minutes,
          lines: lines.map(({ cost_code_id, minutes, description }) => ({ cost_code_id, minutes, description })),
          equipment: equipment.map(({ equipment_id, minutes }) => ({ equipment_id, minutes })),
        }}
        codes={codeOptions}
        machines={machineOptions}
      />
    </main>
  );
}
