import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatTime } from "@/lib/dates";
import type { Answers, Question } from "@/lib/forms";
import { AnswerValue, photoPaths } from "../../answer-value";

export const metadata: Metadata = { title: "Sent form" };

// How long the private photo links on this page keep working.
const LINK_SECONDS = 60 * 60;

// One sent form, read against the version of the questions it was answered on.
export default async function SentFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data: sent } = await supabase
    .from("form_submissions")
    .select(
      "id, form_id, form_name, work_date, filled_at, answers, jobs(name, job_number), employees(full_name), form_versions(version, questions)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sent) notFound();

  const answers = sent.answers as Answers;
  const items = ((sent.form_versions?.questions ?? []) as Question[]).map((q) => ({ ...q, value: answers[q.id] }));
  const paths = photoPaths(items);
  const { data: links } = paths.length
    ? await supabase.storage.from("form-photos").createSignedUrls(paths, LINK_SECONDS)
    : { data: [] };
  const photoUrl = (path: string) => links?.find((l) => l.path === path)?.signedUrl ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{sent.form_name}</h1>
        <Link href={`/admin/forms/sent?form=${sent.form_id}`} className="text-base text-zinc-600 underline dark:text-zinc-400">
          Sent forms
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">
          {sent.jobs?.name}
          {sent.jobs?.job_number && (
            <span className="font-normal text-zinc-600 dark:text-zinc-400"> · #{sent.jobs.job_number}</span>
          )}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(sent.work_date)} at {formatTime(sent.filled_at)}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sent by {sent.employees?.full_name ?? "Unknown"} · Version {sent.form_versions?.version}
        </p>
      </div>

      <ol className="flex flex-col gap-5 text-lg">
        {items.map((q, i) => (
          <li key={q.id} className="flex flex-col gap-2 border-b-2 border-zinc-100 pb-4 dark:border-zinc-900">
            <p className="font-semibold">
              {i + 1}. {q.label}
            </p>
            <AnswerValue type={q.type} value={q.value} photoUrl={photoUrl} />
          </li>
        ))}
      </ol>
    </main>
  );
}
