import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Signature } from "@/app/flha/signature-pad";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "FLHA" };

const section = "flex flex-col gap-2";
const heading = "text-xl font-semibold";
const item = "rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg dark:border-zinc-800";

export default async function FlhaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: flha } = await supabase
    .from("flhas")
    .select(
      "id, job_id, employee_id, work_date, filled_at, submitted_at, other_hazard, other_control, signature, flha_tasks(code, name, position), flha_hazards(name, control, position), flha_ppe(name, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!flha) notFound();

  const [{ data: job }, { data: person }] = await Promise.all([
    supabase.from("jobs").select("name, job_number").eq("id", flha.job_id).maybeSingle(),
    supabase.from("employees").select("full_name").eq("id", flha.employee_id).maybeSingle(),
  ]);
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">FLHA</h1>
        <Link
          href={`/admin/flha?date=${flha.work_date}`}
          className="text-base text-zinc-600 underline dark:text-zinc-400"
        >
          FLHAs
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">{person?.full_name}</p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {job?.name}
          {job?.job_number && ` · #${job.job_number}`}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(flha.work_date)} at {formatTime(flha.filled_at)}
        </p>
      </div>

      <section className={section}>
        <h2 className={heading}>Tasks</h2>
        {[...flha.flha_tasks].sort(byPosition).map((t) => (
          <p key={t.code} className={item}>
            <span className="font-medium">{t.code}</span> {t.name}
          </p>
        ))}
      </section>

      <section className={section}>
        <h2 className={heading}>Hazards and controls</h2>
        {[...flha.flha_hazards].sort(byPosition).map((h) => (
          <div key={h.name} className={item}>
            <p className="font-medium">{h.name}</p>
            <p className="text-zinc-700 dark:text-zinc-300">{h.control}</p>
          </div>
        ))}
        {flha.other_hazard && (
          <div className={item}>
            <p className="font-medium">Other: {flha.other_hazard}</p>
            <p className="text-zinc-700 dark:text-zinc-300">{flha.other_control}</p>
          </div>
        )}
      </section>

      <section className={section}>
        <h2 className={heading}>PPE</h2>
        <p className="text-lg">
          {[...flha.flha_ppe]
            .sort(byPosition)
            .map((p) => p.name)
            .join(", ")}
        </p>
      </section>

      <section className={section}>
        <h2 className={heading}>Signature</h2>
        <Signature path={flha.signature} />
      </section>
    </main>
  );
}
