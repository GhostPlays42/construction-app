import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { keepValue } from "@/lib/record-keeping";
import { KeepRecordsForm } from "./keep-records-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, companyId } = await requireAdmin();
  const { data: company, error } = await supabase
    .from("companies")
    .select("keep_years")
    .eq("id", companyId)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      <section className="flex flex-col gap-3" aria-label="Record keeping">
        <h2 className="text-xl font-semibold">Record keeping</h2>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Time cards, FLHAs, safety meetings, trucking slips, site photos &amp; notes, sent forms, job chat,
          dispatch and finalized daily reports, with their photos and PDFs. Once a night, anything older than
          this is deleted for good.
        </p>
        {error || !company ? (
          <p role="alert" className="text-lg text-red-600 dark:text-red-400">
            This couldn&apos;t load. Refresh to try again.
          </p>
        ) : (
          <KeepRecordsForm current={keepValue(company.keep_years)} />
        )}
      </section>
    </main>
  );
}
