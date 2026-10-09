"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { checkTimeCard, timeCardMessage } from "@/lib/offline/time-card-rules";
import type { TimeCardPayload } from "@/lib/offline/types";

type Parts = Pick<TimeCardPayload, "start" | "end" | "breakMinutes" | "lines" | "equipment">;

function dbMessage(error: { message?: string }): string {
  return error.message ? timeCardMessage(error.message) : "Something went wrong. Check your connection and try again.";
}

// The office approves a time card. The worker can't change it after this.
export async function approveTimeCard(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("approve_time_card", { p_id: id });
  if (error) return { error: dbMessage(error) };
  revalidatePath("/admin/time-cards", "layout");
  return {};
}

// The office changes a time card's hours, work lines or equipment. The
// database records what changed.
export async function updateTimeCard(id: string, parts: Parts): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();
  const problem = checkTimeCard(parts);
  if (problem) return { error: timeCardMessage(problem) };
  const { error } = await supabase.rpc("update_time_card", {
    p_id: id,
    p_start: parts.start,
    p_end: parts.end,
    p_break: parts.breakMinutes,
    p_lines: parts.lines,
    p_equipment: parts.equipment,
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath("/admin/time-cards", "layout");
  redirect(`/admin/time-cards/${id}`);
}
