// Where the office goes to fix an item the daily report lists as missing.
export function missingLink(item: string, jobId: string, date: string): string {
  if (item.startsWith("No FLHA from")) return `/admin/flha?date=${date}`;
  if (item.startsWith("No time card from") || item.startsWith("Time card not approved")) {
    return `/admin/time-cards?date=${date}`;
  }
  if (item === "No safety meeting") return `/admin/safety?date=${date}`;
  if (item.startsWith("Trucking slip not checked")) return `/admin/trucking-slips?date=${date}`;
  // What's left is a once-a-day report form that wasn't sent.
  return `/admin/forms/sent?job=${jobId}`;
}

// The once-a-day report forms the daily report lists as not sent.
export function missingForms(missing: string[]): string[] {
  return missing
    .filter((m) => missingLink(m, "", "").startsWith("/admin/forms/"))
    .map((m) => m.replace(/^No /, ""));
}

// Counts per day, newest first, from rows that each have a work_date.
export function byDay(rows: { work_date: string }[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.work_date, (counts.get(r.work_date) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => ({ date, count }));
}
