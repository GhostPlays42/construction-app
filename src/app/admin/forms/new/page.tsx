import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { FormEditor } from "../form-editor";
import { jobChoices } from "../jobs";

export const metadata: Metadata = { title: "New form" };

export default async function NewFormPage() {
  const { supabase } = await requireAdmin();
  const jobs = await jobChoices(supabase, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">New form</h1>
        <Link href="/admin/forms" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Forms
        </Link>
      </div>
      <FormEditor
        formId={null}
        initial={{ name: "", frequency: "many", inDailyReport: false, allJobs: false, jobIds: [], questions: [] }}
        jobs={jobs}
        version={0}
        sentOnVersion={0}
      />
    </main>
  );
}
