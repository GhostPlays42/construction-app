// Dates are in BC time until each company can pick its own time zone
// (open question 8 in the plan).
export const TIME_ZONE = "America/Vancouver";

// Today as YYYY-MM-DD in the company's time zone.
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

// Whole days from today until a YYYY-MM-DD date (negative once it's past).
export function daysUntil(dateISO: string): number {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// Shows 2027-01-31 as "Jan 31, 2027".
export function formatDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${dateISO}T00:00:00Z`),
  );
}

// Certifications expiring within this many days are flagged.
export const EXPIRY_WARNING_DAYS = 30;

export type CertStatus = "none" | "ok" | "soon" | "expired";

export function certStatus(expiresOn: string | null): CertStatus {
  if (!expiresOn) return "none";
  const days = daysUntil(expiresOn);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "soon";
  return "ok";
}

// Shows a timestamp as "7:12 a.m." in the company's time zone.
export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeStyle: "short", timeZone: TIME_ZONE }).format(
    new Date(timestamp),
  );
}

// Moves a YYYY-MM-DD date by whole days.
export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
