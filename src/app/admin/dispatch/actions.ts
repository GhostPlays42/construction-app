"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { DATE, dispatchMessage, START_TIMES } from "@/lib/dispatch";
import { notify } from "@/lib/push";

export type Conflict = { kind: string; id: string; name: string; other_job: string };
export type DispatchFormState = {
  error?: string;
  // People or machines also planned on another job that day. Saving again
  // with "confirm" set goes ahead anyway.
  conflicts?: Conflict[];
  values?: { start: string; notes: string; people: string[]; equipment: string[] };
};

// Saves the plan for a job and day, warning first about double bookings.
export async function saveDispatch(
  jobId: string,
  date: string,
  _prev: DispatchFormState,
  fd: FormData,
): Promise<DispatchFormState> {
  const { supabase } = await requireAdmin();
  const values = {
    start: String(fd.get("start") ?? ""),
    notes: String(fd.get("notes") ?? "").trim(),
    people: fd.getAll("people").map(String),
    equipment: fd.getAll("equipment").map(String),
  };
  const fail = (code: string): DispatchFormState => ({ error: dispatchMessage(code), values });

  if (!DATE.test(date)) return fail("");
  if (values.start && !START_TIMES.some((t) => t.value === values.start)) return fail("bad_time");
  if (values.notes.length > 1000) return fail("notes_too_long");

  if (fd.get("confirm") !== "1") {
    const { data: conflicts, error } = await supabase.rpc("dispatch_conflicts", {
      p_job_id: jobId,
      p_date: date,
      p_people: values.people,
      p_equipment: values.equipment,
    });
    if (error) return fail("");
    if (conflicts.length) return { conflicts, values };
  }

  const { error } = await supabase.rpc("save_dispatch", {
    p_job_id: jobId,
    p_date: date,
    // The generated types don't allow null here, but the database does.
    p_start_time: (values.start || null) as string,
    p_notes: values.notes,
    p_people: values.people,
    p_equipment: values.equipment,
  });
  if (error) return fail(error.message);

  revalidatePath("/admin/dispatch");
  redirect(`/admin/dispatch?date=${date}`);
}

export type SendResult = { error?: string; changed?: number; reached?: number };

// Sends the plan to everyone whose schedule changed and notifies their phones.
export async function sendSchedule(): Promise<SendResult> {
  const { supabase } = await requireAdmin();
  const { data: changed, error } = await supabase.rpc("send_schedule");
  if (error) return { error: dispatchMessage(error.message) };
  revalidatePath("/admin/dispatch");
  const reached = await notify(supabase, changed, {
    title: "Your schedule changed",
    body: "Tap to see where you're working.",
    url: "/",
  }).catch(() => 0);
  return { changed: changed.length, reached };
}
