// A job chat message as the chat screen shows it.
export type ChatMessage = {
  id: string;
  job_id: string;
  employee_id: string;
  sender_name: string;
  body: string | null;
  photo_path: string | null;
  created_at: string;
  removed_at: string | null;
};

export const CHAT_COLUMNS = "id, job_id, employee_id, sender_name, body, photo_path, created_at, removed_at";

// How many earlier messages the chat screen opens with.
export const CHAT_PAGE = 100;

export const MAX_CHAT_LENGTH = 2000;

// Where a message's photo goes in storage.
export function chatPhotoPath(companyId: string, jobId: string, messageId: string) {
  return `${companyId}/${jobId}/${messageId}.jpg`;
}

// Short plain-words messages for the database's error codes.
const CHAT_MESSAGES: Record<string, string> = {
  no_access: "You can't use this chat.",
  not_on_job: "You're not on this job any more, so you can't post here.",
  too_long: `That message is too long. Keep it under ${MAX_CHAT_LENGTH} characters.`,
  photo_missing: "The photo didn't upload. Try again.",
  empty: "Type a message or add a photo.",
  not_found: "That message is gone.",
  offline: "No signal. Try again when you have signal.",
};

export function chatMessage(code: string): string {
  return CHAT_MESSAGES[code] ?? "Couldn't send. Try again.";
}
