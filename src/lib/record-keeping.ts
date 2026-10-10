// How long a company keeps its records. Null keeps them forever.
export type KeepYears = 2 | 3 | 5 | 7 | 10 | null;

export const KEEP_CHOICES: { value: string; years: KeepYears; text: string }[] = [
  { value: "2", years: 2, text: "2 years" },
  { value: "3", years: 3, text: "3 years" },
  { value: "5", years: 5, text: "5 years" },
  { value: "7", years: 7, text: "7 years" },
  { value: "10", years: 10, text: "10 years" },
  { value: "forever", years: null, text: "Forever" },
];

// The CRA asks businesses to keep records for six years.
export const CRA_YEARS = 6;

export function parseKeepYears(value: string): KeepYears | undefined {
  return KEEP_CHOICES.find((c) => c.value === value)?.years;
}

export function keepValue(years: number | null): string {
  return years === null ? "forever" : String(years);
}

// Whether the new setting removes records the old one kept.
export function isShorter(next: KeepYears, current: number | null): boolean {
  return next !== null && (current === null || next < current);
}

// What the preview counts, in the order the office reads them.
export const RECORD_KINDS: { key: string; one: string; many: string }[] = [
  { key: "time_cards", one: "time card", many: "time cards" },
  { key: "flhas", one: "FLHA", many: "FLHAs" },
  { key: "safety_meetings", one: "safety meeting", many: "safety meetings" },
  { key: "trucking_slips", one: "trucking slip", many: "trucking slips" },
  { key: "site_entries", one: "site photos & notes entry", many: "site photos & notes entries" },
  { key: "form_submissions", one: "sent form", many: "sent forms" },
  { key: "chat_messages", one: "chat message", many: "chat messages" },
  { key: "daily_reports", one: "finalized daily report", many: "finalized daily reports" },
  { key: "dispatches", one: "dispatch day", many: "dispatch days" },
];

export function countLines(counts: Record<string, number>): string[] {
  return RECORD_KINDS.filter((k) => (counts[k.key] ?? 0) > 0).map(
    (k) => `${counts[k.key]} ${counts[k.key] === 1 ? k.one : k.many}`,
  );
}
