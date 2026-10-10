import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Sent forms" };

const PAGE = 50;
const UUID = /^[0-9a-f-]{36}$/i;
const select =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

// Every form sent, newest first, narrowed to a job and/or a form.
export default async function SentFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const job = typeof params.job === "string" && UUID.test(params.job) ? params.job : "";
  const form = typeof params.form === "string" && UUID.test(params.form) ? params.form : "";
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const { supabase } = await requireAdmin();

  let query = supabase
    .from("form_submissions")
    .select("id, form_name, work_date, filled_at, jobs(name), employees(full_name)")
    .order("filled_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  if (job) query = query.eq("job_id", job);
  if (form) query = query.eq("form_id", form);

  const [sent, jobs, forms] = await Promise.all([
    query,
    supabase.from("jobs").select("id, name").order("name"),
    supabase.from("forms").select("id, name").order("name"),
  ]);
  // One extra row was asked for, to know whether there's an older page.
  const rows = (sent.data ?? []).slice(0, PAGE);
  const older = (sent.data ?? []).length > PAGE;
  const link = (p: number) => `/admin/forms/sent?${new URLSearchParams({ ...(job && { job }), ...(form && { form }), page: String(p) })}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Sent forms</h1>
        <Link href="/admin/forms" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Forms
        </Link>
      </div>

      <form className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-3 sm:flex-row sm:items-end dark:bg-zinc-900">
        <label className="flex flex-1 flex-col gap-1 text-base">
          Job
          <select name="job" defaultValue={job} className={select}>
            <option value="">All jobs</option>
            {(jobs.data ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-base">
          Form
          <select name="form" defaultValue={form} className={select}>
            <option value="">All forms</option>
            {(forms.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl bg-amber-500 px-5 py-3 text-lg font-semibold text-black active:bg-amber-600"
        >
          Show
        </button>
      </form>

      {sent.error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load sent forms. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          {page > 1 ? "No older forms." : job || form ? "Nothing sent that matches." : "No forms sent yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/forms/sent/${s.id}`}
                className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:active:bg-zinc-900"
              >
                <span className="flex items-center justify-between gap-2 text-lg">
                  <span className="font-semibold">{s.form_name}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{formatDate(s.work_date)}</span>
                </span>
                <span className="text-base text-zinc-600 dark:text-zinc-400">
                  {s.jobs?.name} · {s.employees?.full_name ?? "Unknown"} at {formatTime(s.filled_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || older) && (
        <nav className="flex justify-between gap-2" aria-label="More forms">
          {page > 1 ? (
            <Link href={link(page - 1)} className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {older && (
            <Link href={link(page + 1)} className="rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700">
              Older →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
