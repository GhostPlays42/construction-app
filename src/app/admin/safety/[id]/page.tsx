import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Signature } from "@/app/flha/signature-pad";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Safety meeting" };

const section = "flex flex-col gap-2";
const heading = "text-xl font-semibold";
const item = "rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg dark:border-zinc-800";

export default async function SafetyMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: meeting } = await supabase
    .from("safety_meetings")
    .select(
      "id, job_id, led_by, work_date, filled_at, topic, other_hazard, safety_meeting_hazards(name, position), safety_meeting_attendees(employee_id, name, signature, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!meeting) notFound();

  const [{ data: job }, { data: people }] = await Promise.all([
    supabase.from("jobs").select("name, job_number, job_assignments(employee_id)").eq("id", meeting.job_id).maybeSingle(),
    supabase.from("employees").select("id, full_name, is_active"),
  ]);
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
  const attendees = [...meeting.safety_meeting_attendees].sort(byPosition);
  // Crew on the job now who aren't on the sign-off.
  const absent = (job?.job_assignments ?? [])
    .map((a) => (people ?? []).find((p) => p.id === a.employee_id))
    .filter((p) => p?.is_active && !attendees.some((a) => a.employee_id === p.id))
    .map((p) => p!.full_name)
    .sort();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Safety meeting</h1>
        <Link
          href={`/admin/safety?date=${meeting.work_date}`}
          className="text-base text-zinc-600 underline dark:text-zinc-400"
        >
          Safety meetings
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">
          {job?.name}
          {job?.job_number && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · #{job.job_number}</span>}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(meeting.work_date)} at {formatTime(meeting.filled_at)}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          Run by {(people ?? []).find((p) => p.id === meeting.led_by)?.full_name ?? "Unknown"}
        </p>
      </div>

      <section className={section}>
        <h2 className={heading}>Topic</h2>
        <p className={`${item} whitespace-pre-line`}>{meeting.topic}</p>
      </section>

      <section className={section}>
        <h2 className={heading}>Hazards talked about</h2>
        <p className="text-lg">
          {[
            ...[...meeting.safety_meeting_hazards].sort(byPosition).map((h) => h.name),
            ...(meeting.other_hazard ? [`Other: ${meeting.other_hazard}`] : []),
          ].join(", ")}
        </p>
      </section>

      <section className={section}>
        <h2 className={heading}>Who was there ({attendees.length})</h2>
        {attendees.map((a) => (
          <div key={a.employee_id} className={item}>
            <p className="flex justify-between gap-2">
              <span className="font-medium">{a.name}</span>
              <span className="text-base text-zinc-600 dark:text-zinc-400">{a.signature ? "Signed" : "Name tapped"}</span>
            </p>
            {a.signature && <Signature path={a.signature} />}
          </div>
        ))}
      </section>

      {absent.length > 0 && (
        <section className={section}>
          <h2 className={heading}>Crew not on the sign-off</h2>
          <p className="text-lg">{absent.join(", ")}</p>
        </section>
      )}
    </main>
  );
}
