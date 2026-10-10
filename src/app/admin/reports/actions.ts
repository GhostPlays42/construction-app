"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { reportMessage, type ReportContent } from "@/lib/daily-report";
import { reportPdf } from "@/lib/report-pdf";

type Admin = Awaited<ReturnType<typeof requireAdmin>>;

// Makes a finalized report's PDF and keeps it on the report. Safe to run
// again if it failed part way.
async function savePdf({ supabase, companyId }: Admin, reportId: string): Promise<string | null> {
  const { data: report } = await supabase
    .from("daily_reports")
    .select("id, content, finalized_at, pdf_path, employees(full_name)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return "not_found";
  if (report.pdf_path) return null;

  const bytes = await reportPdf(
    report.content as ReportContent,
    { at: report.finalized_at, by: report.employees?.full_name ?? "Unknown" },
    async (bucket, path) => {
      const { data } = await supabase.storage.from(bucket).download(path);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
  );

  const path = `${companyId}/${report.id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("daily-reports")
    .upload(path, bytes, { contentType: "application/pdf" });
  // Already there from an earlier try that stopped before it was recorded.
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) return "pdf_missing";

  const { error } = await supabase.rpc("set_daily_report_pdf", { p_id: report.id });
  return error ? error.message : null;
}

// Finalizes a job's report for a day, then makes its PDF.
export async function finalizeReport(jobId: string, date: string): Promise<{ error?: string; pdfError?: string }> {
  const admin = await requireAdmin();
  const { data: id, error } = await admin.supabase.rpc("finalize_daily_report", { p_job_id: jobId, p_date: date });
  if (error || !id) return { error: reportMessage(error?.message ?? "") };

  let pdfError: string | null;
  try {
    pdfError = await savePdf(admin, id);
  } catch {
    pdfError = "pdf_failed";
  }
  revalidatePath("/admin/reports", "layout");
  revalidatePath(`/admin/jobs/${jobId}`);
  return pdfError ? { pdfError: "The report is finalized, but its PDF couldn't be made. Tap Make PDF to try again." } : {};
}

// Tries again to make the PDF of a finalized report.
export async function makePdf(reportId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  let error: string | null;
  try {
    error = await savePdf(admin, reportId);
  } catch {
    error = "pdf_failed";
  }
  revalidatePath("/admin/reports", "layout");
  return error ? { error: "The PDF couldn't be made. Try again." } : {};
}
