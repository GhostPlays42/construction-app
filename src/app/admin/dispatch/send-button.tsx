"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendSchedule, type SendResult } from "./actions";

// Sends the plan to the crew, then shows the board again saying who was told.
export function SendButton({ notificationsReady, here }: { notificationsReady: boolean; here: string }) {
  const router = useRouter();
  const [result, setResult] = useState<SendResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const sent = await sendSchedule();
            if (sent.error) setResult(sent);
            else router.replace(`${here}&sent=${sent.changed ?? 0}&told=${sent.reached ?? 0}`);
          })
        }
        className="self-start rounded-xl bg-amber-500 px-5 py-3 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send schedule"}
      </button>
      {!notificationsReady && (
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          App notifications aren&apos;t set up yet, so workers see changes next time they open the app.
        </p>
      )}
      {result?.error && (
        <p role="alert" className="text-base text-red-700 dark:text-red-300">
          {result.error}
        </p>
      )}
    </div>
  );
}
