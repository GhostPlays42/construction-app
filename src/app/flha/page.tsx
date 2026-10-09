import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadTodaysJob } from "@/lib/todays-job";
import { FlhaForm } from "./flha-form";

export const metadata: Metadata = { title: "FLHA" };

export default async function FlhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const { data: me } = await supabase
    .from("employees")
    .select("id, roles(is_admin)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.roles?.is_admin) redirect("/");

  // The FLHA is always for the job on the worker's home screen.
  const { job } = await loadTodaysJob(supabase);
  if (!job) redirect("/");

  const today = todayISO();
  const [{ data: done }, codes, hazards, ppe] = await Promise.all([
    supabase
      .from("flhas")
      .select("id")
      .eq("job_id", job.id)
      .eq("employee_id", me.id)
      .eq("work_date", today)
      .maybeSingle(),
    supabase.from("cost_codes").select("id, code, name").eq("is_active", true).order("sort_order").order("code"),
    supabase.from("hazards").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("ppe_items").select("id, name").eq("is_active", true).order("sort_order").order("name"),
  ]);
  if (done) redirect("/");

  const failed = codes.error || hazards.error || ppe.error;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">FLHA</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        {job.name} · {formatDate(today)}
      </p>
      {failed ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load the form. Refresh to try again.
        </p>
      ) : (
        <FlhaForm
          id={crypto.randomUUID()}
          jobId={job.id}
          codes={codes.data ?? []}
          hazards={hazards.data ?? []}
          ppe={ppe.data ?? []}
        />
      )}
    </main>
  );
}
