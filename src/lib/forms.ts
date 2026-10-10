import { formatDate } from "@/lib/dates";

// Forms the office builds. A form's questions are kept as JSON in each
// version (see the form_builder migration); answers are keyed by question id.

export const QUESTION_TYPES = [
  { value: "short", label: "Short answer" },
  { value: "long", label: "Long answer" },
  { value: "number", label: "Number" },
  { value: "yes_no", label: "Yes / no" },
  { value: "pick_one", label: "Pick one" },
  { value: "pick_many", label: "Pick several" },
  { value: "date", label: "Date" },
  { value: "photo", label: "Photo" },
  { value: "signature", label: "Signature" },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  // Only for pick_one and pick_many.
  options?: string[];
};

// Text, a number, yes/no, picked choices, photo ids (on the phone) or photo
// paths (once saved), or a signature's SVG path.
export type Answer = string | number | boolean | string[];
export type Answers = Record<string, Answer>;

export type Frequency = "once_daily" | "many";

export const FREQUENCIES: { value: Frequency; label: string; hint: string }[] = [
  { value: "once_daily", label: "Once a day per job", hint: "One person on the crew sends it each day." },
  { value: "many", label: "As many times as needed", hint: "Anyone can send it any time." },
];

export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 50;
export const MAX_FORM_PHOTOS = 10;
export const SHORT_MAX = 500;
export const LONG_MAX = 4000;

export function isPick(type: QuestionType) {
  return type === "pick_one" || type === "pick_many";
}

export function typeLabel(type: string): string {
  return QUESTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

// Whether an answer counts as not answered.
export function isBlank(a: Answer | null | undefined): boolean {
  return (
    a === undefined ||
    a === null ||
    (typeof a === "string" && a.trim() === "") ||
    (Array.isArray(a) && a.length === 0) ||
    (typeof a === "number" && !Number.isFinite(a))
  );
}

// Short plain-words messages for the database's codes when saving a form.
const SAVE_MESSAGES: Record<string, string> = {
  no_access: "Only office admins can do this.",
  name_required: "Give the form a name.",
  name_too_long: "Keep the name under 100 characters.",
  name_taken: "Another form already has that name.",
  bad_frequency: "Pick how often the form is sent.",
  questions_required: "Add at least one question.",
  too_many_questions: `A form can have up to ${MAX_QUESTIONS} questions.`,
  bad_question: "A question isn't set up right. Check each one and try again.",
  label_required: "Every question needs words.",
  label_too_long: "Keep each question under 300 characters.",
  options_required: "Each pick question needs at least two choices.",
  too_many_options: `A pick question can have up to ${MAX_OPTIONS} choices.`,
  option_too_long: "Keep each choice under 100 characters.",
  options_repeat: "A pick question has the same choice twice.",
  job_not_found: "A job picked is gone. Refresh and pick again.",
  not_found: "This form couldn't be found.",
};

export function formSaveMessage(code: string): string {
  return SAVE_MESSAGES[code] ?? "Something went wrong. Check your connection and try again.";
}

// Checks a form before it's saved, so the office hears which question needs
// fixing. Returns the message, or null when it's ready.
export function checkForm(name: string, questions: Question[]): string | null {
  if (!name.trim()) return SAVE_MESSAGES.name_required;
  if (name.trim().length > 100) return SAVE_MESSAGES.name_too_long;
  if (questions.length === 0) return SAVE_MESSAGES.questions_required;
  if (questions.length > MAX_QUESTIONS) return SAVE_MESSAGES.too_many_questions;
  for (const [i, q] of questions.entries()) {
    const which = `Question ${i + 1}`;
    if (!q.label.trim()) return `${which} needs words.`;
    if (q.label.trim().length > 300) return `${which} is too long. Keep it under 300 characters.`;
    if (isPick(q.type)) {
      const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) return `${which} needs at least two choices, one per line.`;
      if (options.length > MAX_OPTIONS) return `${which} has too many choices. Keep it to ${MAX_OPTIONS}.`;
      if (options.some((o) => o.length > 100)) return `${which} has a choice that's too long. Keep each under 100 characters.`;
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return `${which} has the same choice twice.`;
    }
  }
  return null;
}

// The form's questions as the database keeps them: words trimmed, blank
// choices dropped, and choices only on pick questions.
export function tidyQuestions(questions: Question[]): Question[] {
  return questions.map(({ id, type, label, required, options }) => ({
    id,
    type,
    label: label.trim(),
    required,
    ...(isPick(type) ? { options: (options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
  }));
}

// An answer as words, for every type but photo and signature.
export function answerText(type: string, value: Answer | null | undefined): string {
  if (isBlank(value)) return "No answer";
  if (type === "yes_no") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (type === "date" && typeof value === "string") return formatDate(value);
  return String(value);
}
