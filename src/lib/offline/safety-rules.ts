import type { SafetyMeetingPayload } from "./types";

// Plain-words messages for the short codes the database and these checks use.
export const SAFETY_MESSAGES: Record<string, string> = {
  hazard_required: "Tick at least one hazard you talked about, or describe one under Other.",
  other_too_long: "Keep the other hazard under 500 characters.",
  topic_required: "Write the topic you talked about.",
  topic_too_long: "Keep the topic under 2000 characters.",
  crew_required: "Mark who was at the meeting: each person signs, or tap their name.",
  crew_changed: "The crew on this job changed while this was waiting. Check with your office.",
  signature_too_big: "A signature is too long. Clear it and sign again.",
  supervisors_only: "Only a supervisor can send the safety meeting. Check with your office.",
  already_done: "Someone already sent today's safety meeting for this job.",
  job_not_available: "You're no longer on this job. Check with your office.",
  item_not_available: "The office changed the hazards list while this was waiting. Check with your office.",
  bad_time: "Your phone's clock was wrong when you filled this in. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function safetyMessage(code: string): string {
  return SAFETY_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}

// The same checks the database makes, run on the phone so a crew with no
// signal finds out straight away. Returns a code, or null when it's ready.
export function checkSafetyMeeting(p: SafetyMeetingPayload): string | null {
  if (p.hazards.length === 0 && !p.otherHazard.trim()) return "hazard_required";
  if (p.otherHazard.trim().length > 500) return "other_too_long";
  if (!p.topic.trim()) return "topic_required";
  if (p.topic.trim().length > 2000) return "topic_too_long";
  if (p.attendees.length === 0) return "crew_required";
  if (p.attendees.some((a) => a.signature !== null && (!a.signature.trim() || a.signature.length > 200000))) {
    return "signature_too_big";
  }
  return null;
}
