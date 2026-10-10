"use client";

import { useState, useTransition } from "react";
import { finalizeReport, makePdf } from "../../actions";

const primary =
  "rounded-xl bg-amber-500 px-5 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-60";

// Finalizes the report. With items missing, it asks once more first.
export function FinalizeButton({ jobId, date, missing }: { jobId: string; date: string; missing: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const finalize = () =>
    start(async () => {
      setError(null);
      const result = await finalizeReport(jobId, date);
      if (result.error) setError(result.error);
      else if (result.pdfError) setError(result.pdfError);
    });

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 p-4 dark:border-amber-600">
          <p className="text-lg">
            {missing === 1 ? "1 item is" : `${missing} items are`} still missing. Once finalized, the report can&apos;t be
            changed. Finalize anyway?
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={finalize} disabled={pending} className={primary}>
              {pending ? "Finalizing…" : "Finalize anyway"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
            >
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (missing > 0 ? setConfirming(true) : finalize())}
          disabled={pending}
          className={primary}
        >
          {pending ? "Finalizing…" : "Finalize report"}
        </button>
      )}
      <p className="text-base text-zinc-600 dark:text-zinc-400">
        Finalizing saves the report as it is now and makes a PDF that&apos;s kept on the job.
      </p>
    </div>
  );
}

// Tries again to make a finalized report's PDF.
export function MakePdfButton({ reportId }: { reportId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p>The PDF hasn&apos;t been made yet.</p>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await makePdf(reportId);
            if (result.error) setError(result.error);
          })
        }
        className="self-start rounded-xl bg-amber-500 px-5 py-3 text-lg font-semibold text-black active:bg-amber-600 disabled:opacity-60"
      >
        {pending ? "Making PDF…" : "Make PDF"}
      </button>
    </div>
  );
}
