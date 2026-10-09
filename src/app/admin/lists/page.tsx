import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { KINDS, type Kind } from "./kinds";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage() {
  const { supabase } = await requireAdmin();
  const count = (table: (typeof KINDS)[Kind]["table"]) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);
  const counts = await Promise.all((Object.keys(KINDS) as Kind[]).map((k) => count(KINDS[k].table)));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Lists</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        The choices crews pick from. Edit them any time.
      </p>
      <ul className="flex flex-col gap-3">
        {(Object.keys(KINDS) as Kind[]).map((k, i) => (
          <li key={k}>
            <Link
              href={`/admin/lists/${k}`}
              className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
            >
              <span className="text-xl font-semibold">{KINDS[k].title}</span>
              <span className="text-base text-zinc-600 dark:text-zinc-400">
                {counts[i].error ? "Couldn't count" : `${counts[i].count ?? 0} in use`} · {KINDS[k].hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
