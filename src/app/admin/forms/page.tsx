import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { FREQUENCIES } from "@/lib/forms";

export const metadata: Metadata = { title: "Forms" };

export default async function FormsPage() {
  const { supabase } = await requireAdmin();
  const { data: forms, error } = await supabase
    .from("forms")
    .select("id, name, frequency, in_daily_report, all_jobs, supervisors_only, is_active, form_jobs(count), form_versions(version)")
    .order("name");

  const rows = (forms ?? []).map((f) => ({
    ...f,
    version: Math.max(0, ...f.form_versions.map((v) => v.version)),
    jobs: f.form_jobs[0]?.count ?? 0,
  }));
  const inUse = rows.filter((f) => f.is_active);
  const off = rows.filter((f) => !f.is_active);

  const row = (f: (typeof rows)[number]) => (
    <Link
      key={f.id}
      href={`/admin/forms/${f.id}`}
      className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
    >
      <span className="flex items-center justify-between gap-2 text-lg">
        <span className="font-semibold">{f.name}</span>
        <span className="text-base text-zinc-600 dark:text-zinc-400">Version {f.version}</span>
      </span>
      <span className="text-base text-zinc-600 dark:text-zinc-400">
        {[
          FREQUENCIES.find((x) => x.value === f.frequency)?.label,
          f.all_jobs ? "All jobs" : f.jobs === 0 ? "No jobs yet" : f.jobs === 1 ? "1 job" : `${f.jobs} jobs`,
          f.supervisors_only && "Supervisors only",
          f.in_daily_report && "In daily report",
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Forms</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/admin/forms/new"
          className="flex-1 rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
        >
          New form
        </Link>
        <Link
          href="/admin/forms/sent"
          className="flex-1 rounded-xl border-2 border-amber-500 px-4 py-4 text-center text-xl font-semibold active:bg-amber-50 dark:active:bg-amber-950"
        >
          Sent forms
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load forms. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          No forms yet. Make one for anything your crews fill in, like an equipment inspection or a site sign-in.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">In use</h2>
            {inUse.length === 0 ? <p className="text-lg text-zinc-600 dark:text-zinc-400">None.</p> : inUse.map(row)}
          </section>
          {off.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Switched off</h2>
              {off.map(row)}
            </section>
          )}
        </>
      )}
    </main>
  );
}
