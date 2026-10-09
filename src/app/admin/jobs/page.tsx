import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Job sites" };

export default async function JobsPage() {
  const { supabase } = await requireAdmin();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, name, job_number, client, address, status, job_assignments(count)")
    .order("name");

  const rows = (jobs ?? []).map((j) => ({ ...j, crewCount: j.job_assignments[0]?.count ?? 0 }));
  const byStatus = (s: string) => rows.filter((j) => j.status === s);

  const card = (j: (typeof rows)[number]) => (
    <li key={j.id}>
      <Link
        href={`/admin/jobs/${j.id}`}
        className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
      >
        <span className="text-xl font-semibold">
          {j.job_number ? `${j.job_number} · ` : ""}
          {j.name}
        </span>
        {(j.client || j.address) && (
          <span className="text-base text-zinc-600 dark:text-zinc-400">
            {[j.client, j.address?.split("\n")[0]].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="text-base text-zinc-600 dark:text-zinc-400">
          {j.crewCount === 0 ? "No crew assigned" : `${j.crewCount} on the crew`}
        </span>
      </Link>
    </li>
  );

  const paused = byStatus("paused");
  const complete = byStatus("complete");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Job sites</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <Link
        href="/admin/jobs/new"
        className="rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Add job
      </Link>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load your jobs. Refresh to try again.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Active ({byStatus("active").length})</h2>
            {byStatus("active").length === 0 && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">No active jobs.</p>
            )}
            <ul className="flex flex-col gap-3">{byStatus("active").map(card)}</ul>
          </section>
          {paused.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Paused ({paused.length})</h2>
              <ul className="flex flex-col gap-3">{paused.map(card)}</ul>
            </section>
          )}
          {complete.length > 0 && (
            <details>
              <summary className="cursor-pointer text-lg text-zinc-600 dark:text-zinc-400">
                Complete ({complete.length})
              </summary>
              <ul className="mt-3 flex flex-col gap-3">{complete.map(card)}</ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
