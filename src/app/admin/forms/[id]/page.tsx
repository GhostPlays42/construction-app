import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import type { Frequency, Question } from "@/lib/forms";
import { setFormActive } from "../actions";
import { FormEditor } from "../form-editor";
import { jobChoices } from "../jobs";

export const metadata: Metadata = { title: "Edit form" };

export default async function FormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const [{ data: form }, { data: latest }] = await Promise.all([
    supabase
      .from("forms")
      .select("id, name, frequency, in_daily_report, all_jobs, is_active, form_jobs(job_id)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("form_versions")
      .select("id, version, questions")
      .eq("form_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!form || !latest) notFound();

  const onForm = form.form_jobs.map((j) => j.job_id);
  const [jobs, { count: sentOnVersion }] = await Promise.all([
    jobChoices(supabase, onForm),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("version_id", latest.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{form.name}</h1>
        <Link href="/admin/forms" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Forms
        </Link>
      </div>

      {saved === "1" && (
        <p role="status" className="-mt-3 text-lg text-green-700 dark:text-green-400">
          ✓ Saved. Workers on its jobs see it under Job forms after their FLHA.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/forms/sent?form=${form.id}`}
          className="rounded-xl border-2 border-amber-500 px-4 py-3 text-lg font-semibold active:bg-amber-50 dark:active:bg-amber-950"
        >
          Sent answers
        </Link>
        <form action={setFormActive.bind(null, form.id, !form.is_active)} className="ml-auto">
          <button
            type="submit"
            className="rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-900"
          >
            {form.is_active ? "Switch off" : "Switch on"}
          </button>
        </form>
      </div>
      {!form.is_active && (
        <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
          Switched off: workers don&apos;t see this form. Answers already sent are kept.
        </p>
      )}

      <FormEditor
        formId={form.id}
        initial={{
          name: form.name,
          frequency: form.frequency as Frequency,
          inDailyReport: form.in_daily_report,
          allJobs: form.all_jobs,
          jobIds: onForm,
          questions: latest.questions as Question[],
        }}
        jobs={jobs}
        version={latest.version}
        sentOnVersion={sentOnVersion ?? 0}
      />
    </main>
  );
}
