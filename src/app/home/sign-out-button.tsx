"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/app/actions";
import { snapshots } from "@/lib/offline/outbox";
import { stopNotifications } from "./notifications";

// Signing out clears this person's copy from the phone and stops its
// notifications. It's blocked while
// forms are still waiting to send, since signing out would strand them.
export function SignOutButton({ userId, waiting }: { userId: string; waiting: number }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {message && (
        <p role="alert" className="text-base text-red-700 dark:text-red-300">
          {message}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (waiting > 0) {
            return setMessage(
              `You have ${waiting === 1 ? "a form" : `${waiting} forms`} waiting to send. Get signal and let ${waiting === 1 ? "it" : "them"} send before signing out.`,
            );
          }
          if (!navigator.onLine) return setMessage("Signing out needs signal.");
          await stopNotifications();
          await snapshots.clear(userId).catch(() => {});
          navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
          startTransition(() => signOut());
        }}
        className="w-full rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg disabled:opacity-50 dark:border-zinc-700"
      >
        Sign out
      </button>
    </div>
  );
}
