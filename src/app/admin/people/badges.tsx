import type { CertStatus } from "@/lib/dates";

const tone = {
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  grey: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
};

export function Badge({ color, children }: { color: keyof typeof tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${tone[color]}`}>
      {children}
    </span>
  );
}

export function CertBadge({ status }: { status: CertStatus }) {
  if (status === "expired") return <Badge color="red">Expired</Badge>;
  if (status === "soon") return <Badge color="amber">Expires soon</Badge>;
  return null;
}
