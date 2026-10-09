"use client";

import { useState, useTransition } from "react";
import { approveTimeCard } from "../actions";

export function ApproveButton({ id }: { id: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-base text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await approveTimeCard(id);
            setError(result.error ?? "");
          })
        }
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
    </div>
  );
}
