import { isBlank, isPick, LONG_MAX, MAX_FORM_PHOTOS, SHORT_MAX, type Answers, type Question } from "@/lib/forms";

// Plain-words messages for the short codes the database and these checks use.
export const FORM_MESSAGES: Record<string, string> = {
  answer_required: "Answer every question that isn't marked optional.",
  answer_too_long: `An answer is too long. Keep short answers under ${SHORT_MAX} characters and long ones under ${LONG_MAX}.`,
  bad_answer: "An answer isn't right. Check the numbers and dates.",
  option_not_available: "The office changed the choices on this form while it was waiting. Check with your office.",
  too_many_photos: `Add up to ${MAX_FORM_PHOTOS} photos for each question.`,
  signature_too_big: "A signature is too long. Clear it and sign again.",
  photo_missing: "A photo didn't finish uploading. Check with your office.",
  upload_refused: "A photo was turned away when sending. Check with your office.",
  already_done: "Someone already sent this form for this job today.",
  form_not_available: "The office took this form off the job or switched it off. Check with your office.",
  flha_required: "Do your FLHA for this job first.",
  job_not_available: "You're no longer on this job. Check with your office.",
  bad_time: "Your phone's clock was wrong when you filled this in. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function formMessage(code: string): string {
  return FORM_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}

// The same checks the database makes, run on the phone so a worker with no
// signal finds out straight away. Returns the problem and which question
// (counting from 0), or null when it's ready.
export function checkAnswers(questions: Question[], answers: Answers): { code: string; index: number } | null {
  for (const [index, q] of questions.entries()) {
    const a = answers[q.id];
    if (isBlank(a)) {
      if (q.required) return { code: "answer_required", index };
      continue;
    }
    const fail = (code: string) => ({ code, index });
    switch (q.type) {
      case "short":
      case "long":
        if (typeof a !== "string") return fail("bad_answer");
        if (a.trim().length > (q.type === "short" ? SHORT_MAX : LONG_MAX)) return fail("answer_too_long");
        break;
      case "number":
        if (typeof a !== "number" || !Number.isFinite(a) || Math.abs(a) >= 1e12) return fail("bad_answer");
        break;
      case "yes_no":
        if (typeof a !== "boolean") return fail("bad_answer");
        break;
      case "pick_one":
        if (typeof a !== "string" || !q.options?.includes(a)) return fail("option_not_available");
        break;
      case "pick_many":
        if (!Array.isArray(a) || a.some((o) => !q.options?.includes(o))) return fail("option_not_available");
        break;
      case "date":
        if (typeof a !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a) || Number.isNaN(Date.parse(a))) return fail("bad_answer");
        break;
      case "photo":
        if (!Array.isArray(a) || a.length > MAX_FORM_PHOTOS) return fail("too_many_photos");
        break;
      case "signature":
        if (typeof a !== "string" || a.length > 200000) return fail("signature_too_big");
        break;
    }
  }
  return null;
}

// Plain words for a problem with one question.
export function answerMessage(problem: { code: string; index: number }, questions: Question[]): string {
  const q = questions[problem.index];
  const which = `Question ${problem.index + 1}`;
  if (problem.code === "answer_required") {
    return `${which} needs an answer${q && isPick(q.type) ? ": pick one" : ""}.`;
  }
  if (problem.code === "bad_answer" && q?.type === "number") return `${which} needs a number.`;
  if (problem.code === "bad_answer" && q?.type === "date") return `${which} needs a date.`;
  return `${which}: ${formMessage(problem.code)}`;
}

// Where a photo in a form's answers is kept in the form-photos bucket.
export function formPhotoPath(companyId: string, submissionId: string, photoId: string) {
  return `${companyId}/${submissionId}/${photoId}.jpg`;
}
