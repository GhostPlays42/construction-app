"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FlhaFormState = { error?: string };

// The database checks everything; these turn its short codes into plain words.
const ERRORS: Record<string, string> = {
  task_required: "Pick at least one task.",
  hazard_required: "Tick at least one hazard, or describe one under Other.",
  control_required: "Say how you'll control each hazard you ticked.",
  ppe_required: "Tick the PPE you're wearing.",
  signature_required: "Sign in the box.",
  signature_too_big: "Your signature is too long. Clear it and sign again.",
  job_not_available: "You're no longer on this job. Go back home and check with your office.",
  item_not_available: "The office just changed one of these lists. Refresh the page and try again.",
  bad_time: "Your phone's clock looks wrong. Check the time and try again.",
};

function ids(value: FormDataEntryValue | null): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function submitFlha(
  id: string,
  jobId: string,
  _prev: FlhaFormState,
  formData: FormData,
): Promise<FlhaFormState> {
  const supabase = await createClient();
  let hazards: unknown = [];
  try {
    hazards = JSON.parse(String(formData.get("hazards") ?? "[]"));
  } catch {}

  const filledAt = String(formData.get("filled_at") ?? "");
  const { error } = await supabase.rpc("submit_flha", {
    p_id: id,
    p_job_id: jobId,
    p_cost_code_ids: ids(formData.get("tasks")),
    p_hazards: Array.isArray(hazards) ? hazards : [],
    p_other_hazard: String(formData.get("other_hazard") ?? ""),
    p_other_control: String(formData.get("other_control") ?? ""),
    p_ppe_ids: ids(formData.get("ppe")),
    p_signature: String(formData.get("signature") ?? ""),
    ...(filledAt && !Number.isNaN(Date.parse(filledAt)) ? { p_filled_at: filledAt } : {}),
  });

  // Already done counts as done: the worker just goes home to the check mark.
  if (error && error.message !== "already_done") {
    return { error: ERRORS[error.message] ?? "Couldn't send your FLHA. Check your signal and try again." };
  }
  redirect("/");
}
