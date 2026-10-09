import type { FlhaPayload } from "./types";

// Plain-words messages for the short codes the database and these checks use.
export const FLHA_MESSAGES: Record<string, string> = {
  task_required: "Pick at least one task.",
  hazard_required: "Tick at least one hazard, or describe one under Other.",
  control_required: "Say how you'll control each hazard you ticked.",
  ppe_required: "Tick the PPE you're wearing.",
  signature_required: "Sign in the box.",
  signature_too_big: "Your signature is too long. Clear it and sign again.",
  job_not_available: "You're no longer on this job. Check with your office.",
  item_not_available: "The office changed one of the lists while this was waiting. Check with your office.",
  bad_time: "Your phone's clock was wrong when you filled this in. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function flhaMessage(code: string): string {
  return FLHA_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}

// The same checks the database makes, run on the phone so a worker with no
// signal finds out straight away. Returns a code, or null when it's ready.
export function checkFlha(p: FlhaPayload): string | null {
  if (p.tasks.length === 0) return "task_required";
  if (p.hazards.length === 0 && !p.otherHazard.trim()) return "hazard_required";
  if (p.hazards.some((h) => !h.control.trim())) return "control_required";
  if (p.otherHazard.trim() && !p.otherControl.trim()) return "control_required";
  if (p.ppe.length === 0) return "ppe_required";
  if (!p.signature.trim()) return "signature_required";
  if (p.signature.length > 200000) return "signature_too_big";
  return null;
}
