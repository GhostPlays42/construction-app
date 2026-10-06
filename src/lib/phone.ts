// Turns what a worker types ("587 555-0101", "(587) 555 0101", "+1 587…")
// into international format (+15875550101). North American numbers only for
// now; returns null when the input can't be a valid number.
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Shows +15875550101 as (587) 555-0101.
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
