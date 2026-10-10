import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { ReportContent } from "@/lib/daily-report";
import { ReportView } from "../../report-view";
import { FinalizeButton, MakePdfButton } from "./report-buttons";

export const metadata: Metadata = { title: "Daily report" };

// How long the private photo and PDF links on this page keep working.
const LINK_SECONDS = 60 * 60;

export default async function ReportPage({ params }: { params: Promise<{ jobId: string; date: string }> }) {
  const { jobId, date } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const { supabase } = await requireAdmin();

  const { data: saved } = await supabase
    .from("daily_reports")
    .select("id, content, finalized_at, pdf_path, employees(full_name)")
    .eq("job_id", jobId)
    .eq("work_date", date)
    .maybeSingle();

  let report: ReportContent;
  if (saved) {
    report = saved.content as ReportContent;
  } else {
    // Not finalized: the draft, worked out from what's there now. Only days
    // whose report is ready are listed.
    const { data: days } = await supabase.rpc("daily_report_days", { p_days: 90 });
    if (!days?.some((d) => d.job_id === jobId && d.work_date === date)) notFound();
    const { data, error } = await supabase.rpc("daily_report_content", { p_job_id: jobId, p_date: date });
    if (error || !data) notFound();
    report = data as ReportContent;
  }

  // Viewable links for every photo in the report.
  const sitePaths = report.site_entries.flatMap((e) => e.photos.map((p) => p.path));
  const slipPaths = report.trucking.map((s) => s.photo_path);
  const [siteLinks, slipLinks, pdfLink] = await Promise.all([
    sitePaths.length ? supabase.storage.from("site-photos").createSignedUrls(sitePaths, LINK_SECONDS) : null,
    slipPaths.length ? supabase.storage.from("slip-photos").createSignedUrls(slipPaths, LINK_SECONDS) : null,
    saved?.pdf_path
      ? supabase.storage.from("daily-reports").createSignedUrl(saved.pdf_path, LINK_SECONDS, {
          download: `Daily report ${report.job.name} ${date}.pdf`.replace(/[^\w .-]/g, ""),
        })
      : null,
  ]);
  const links = [...(siteLinks?.data ?? []), ...(slipLinks?.data ?? [])];
  const photoUrl = (path: string) => links.find((l) => l.path === path)?.signedUrl ?? null;

  const muted = "text-zinc-600 dark:text-zinc-400";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Daily report</h1>
        <Link href="/admin/reports" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Daily reports
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">
          {report.job.name}
          {report.job.job_number && <span className={`font-normal ${muted}`}> · #{report.job.job_number}</span>}
        </p>
        <p className={muted}>{formatDate(report.date)}</p>
        {report.job.address && <p className={muted}>{report.job.address}</p>}
        {report.job.client && <p className={muted}>Client: {report.job.client}</p>}
      </div>

      {saved ? (
        <div className="flex flex-col gap-3 rounded-xl bg-green-50 p-4 text-lg dark:bg-green-950">
          <p className="text-green-800 dark:text-green-200">
            ✓ Finalized {formatDateTime(saved.finalized_at)} by {saved.employees?.full_name ?? "Unknown"}. It can&apos;t be
            changed.
          </p>
          {pdfLink?.data?.signedUrl ? (
            <a
              href={pdfLink.data.signedUrl}
              className="self-start rounded-xl bg-amber-500 px-5 py-3 text-lg font-semibold text-black active:bg-amber-600"
            >
              Download PDF
            </a>
          ) : saved.pdf_path ? (
            <p>Couldn&apos;t load the PDF link. Refresh to try again.</p>
          ) : (
            <MakePdfButton reportId={saved.id} />
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
          This is the draft. It updates as things are fixed on the other office screens (time cards, trucking slips).
        </p>
      )}

      {report.missing.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 p-4 text-lg dark:border-amber-600">
          <h2 className="text-xl font-semibold">{saved ? "Missing when finalized" : "Missing"}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-6">
            {report.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      <ReportView report={report} photoUrl={photoUrl} />

      {!saved && <FinalizeButton jobId={jobId} date={date} missing={report.missing.length} />}
    </main>
  );
}
