import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { certStatus } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { Badge } from "./badges";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const { supabase } = await requireAdmin();
  const { data: people, error } = await supabase
    .from("employees")
    .select("id, full_name, phone, email, trade, is_active, user_id, roles(name, is_admin, is_supervisor), certifications(expires_on)")
    .order("full_name");

  const rows = (people ?? []).map((p) => {
    const statuses = p.certifications.map((c) => certStatus(c.expires_on));
    return {
      ...p,
      certExpired: statuses.includes("expired"),
      certSoon: statuses.includes("soon"),
    };
  });
  const active = rows.filter((p) => p.is_active);
  const inactive = rows.filter((p) => !p.is_active);

  const card = (p: (typeof rows)[number]) => (
    <li key={p.id}>
      <Link
        href={`/admin/people/${p.id}`}
        className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
      >
        <span className="text-xl font-semibold">{p.full_name}</span>
        <span className="text-base text-zinc-600 dark:text-zinc-400">
          {[p.roles?.is_admin || p.roles?.is_supervisor ? p.roles.name : null, p.trade, p.phone ? formatPhone(p.phone) : p.email]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {(p.certExpired || p.certSoon || !p.user_id) && (
          <span className="mt-1 flex flex-wrap gap-2">
            {p.certExpired && <Badge color="red">Ticket expired</Badge>}
            {!p.certExpired && p.certSoon && <Badge color="amber">Ticket expires soon</Badge>}
            {!p.user_id && p.is_active && <Badge color="grey">Hasn&apos;t signed in yet</Badge>}
          </span>
        )}
      </Link>
    </li>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">People</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <Link
        href="/admin/people/new"
        className="rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Add person
      </Link>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load your people. Refresh to try again.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">{active.map(card)}</ul>
          {inactive.length > 0 && (
            <details className="flex flex-col gap-3">
              <summary className="cursor-pointer text-lg text-zinc-600 dark:text-zinc-400">
                Switched off ({inactive.length})
              </summary>
              <ul className="mt-3 flex flex-col gap-3">{inactive.map(card)}</ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
