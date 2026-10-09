import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hoursText, timeLabel } from "@/lib/offline/time-card-rules";
import { ApproveButton } from "./approve-button";

export const metadata: Metadata = { title: "Time card" };

const section = "flex flex-col gap-2";
const heading = "text-xl font-semibold";
const item = "rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg dark:border-zinc-800";

export default async function TimeCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: card } = await supabase
    .from("time_cards")
    .select(
      "id, job_id, employee_id, work_date, start_time, end_time, break_minutes, worked_minutes, status, submitted_at, approved_by, approved_at, time_card_lines(code, name, minutes, description, position), time_card_equipment(name, minutes, position), time_card_changes(id, changed_by, changed_at, field, old_value, new_value)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!card) notFound();

  const [{ data: job }, { data: people }] = await Promise.all([
    supabase.from("jobs").select("name, job_number").eq("id", card.job_id).maybeSingle(),
    supabase.from("employees").select("id, full_name"),
  ]);
  const nameOf = (employeeId: string | null) =>
    (people ?? []).find((p) => p.id === employeeId)?.full_name ?? "Someone";
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

  // Changes saved together share a time; show them as one entry.
  const changes = new Map<string, typeof card.time_card_changes>();
  for (const c of [...card.time_card_changes].sort((a, b) => b.id - a.id)) {
    const key = `${c.changed_at}|${c.changed_by}`;
    changes.set(key, [...(changes.get(key) ?? []), c]);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Time card</h1>
        <Link
          href={`/admin/time-cards?date=${card.work_date}`}
          className="text-base text-zinc-600 underline dark:text-zinc-400"
        >
          Time cards
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">{nameOf(card.employee_id)}</p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {job?.name}
          {job?.job_number && ` · #${job.job_number}`}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">{formatDate(card.work_date)}</p>
      </div>

      {card.status === "approved" ? (
        <p role="status" className="rounded-xl bg-green-100 p-4 text-lg text-green-900 dark:bg-green-950 dark:text-green-100">
          Approved by {nameOf(card.approved_by)}, {formatDateTime(card.approved_at!)}
        </p>
      ) : (
        <ApproveButton id={card.id} />
      )}

      <section className={section}>
        <h2 className={heading}>Hours</h2>
        <p className={item}>
          {timeLabel(card.start_time)} to {timeLabel(card.end_time)}, {card.break_minutes} min break
          <span className="block font-semibold">{hoursText(card.worked_minutes)} worked</span>
        </p>
      </section>

      <section className={section}>
        <h2 className={heading}>Work</h2>
        {[...card.time_card_lines].sort(byPosition).map((l) => (
          <div key={l.position} className={item}>
            <p className="font-medium">
              {l.code} {l.name} · {hoursText(l.minutes)}
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">{l.description}</p>
          </div>
        ))}
      </section>

      <section className={section}>
        <h2 className={heading}>Equipment</h2>
        {card.time_card_equipment.length === 0 ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">None.</p>
        ) : (
          [...card.time_card_equipment].sort(byPosition).map((e) => (
            <p key={e.position} className={item}>
              {e.name} · {hoursText(e.minutes)}
            </p>
          ))
        )}
      </section>

      <Link
        href={`/admin/time-cards/${card.id}/edit`}
        className="w-full rounded-xl border-2 border-zinc-300 px-4 py-3 text-center text-lg dark:border-zinc-700"
      >
        Edit
      </Link>

      <section className={section}>
        <h2 className={heading}>History</h2>
        <ul className="flex flex-col gap-3">
          {[...changes.values()].map((group) => (
            <li key={group[0].id} className="flex flex-col gap-1 border-l-4 border-zinc-200 pl-3 dark:border-zinc-800">
              <p className="text-base text-zinc-600 dark:text-zinc-400">
                {formatDateTime(group[0].changed_at)} · {nameOf(group[0].changed_by)}
              </p>
              {[...group].reverse().map((c) =>
                c.field === "Status" ? (
                  <p key={c.id} className="text-lg">
                    Approved
                  </p>
                ) : (
                  <div key={c.id} className="text-lg">
                    <p className="font-medium">Changed {c.field.toLowerCase()}</p>
                    <p className="whitespace-pre-line text-base text-zinc-600 line-through dark:text-zinc-400">
                      {c.old_value || "None"}
                    </p>
                    <p className="whitespace-pre-line text-base">{c.new_value || "None"}</p>
                  </div>
                ),
              )}
            </li>
          ))}
          <li className="flex flex-col gap-1 border-l-4 border-zinc-200 pl-3 dark:border-zinc-800">
            <p className="text-base text-zinc-600 dark:text-zinc-400">
              {formatDateTime(card.submitted_at)} · {nameOf(card.employee_id)}
            </p>
            <p className="text-lg">Sent from the phone</p>
          </li>
        </ul>
      </section>
    </main>
  );
}
