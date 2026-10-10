"use client";

import { useEffect, useState } from "react";
import { formValues, type SlipFormValues } from "@/lib/slip-values";
import { SlipValuesForm } from "../slip-values-form";
import { checkSlip } from "./actions";

// Reads the slip the first time it's opened (a few seconds), then shows what
// was read for the worker to confirm or fix.
export function CheckSlip({
  id,
  readStatus,
  initial,
}: {
  id: string;
  readStatus: string;
  initial: SlipFormValues;
}) {
  const [state, setState] = useState<{ status: string; values: SlipFormValues }>({
    status: readStatus,
    values: initial,
  });

  useEffect(() => {
    if (readStatus !== "pending") return;
    fetch(`/api/slips/${id}/read`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((slip) => setState({ status: slip.read_status, values: formValues(slip) }))
      .catch(() => setState((s) => ({ ...s, status: "failed" })));
  }, [id, readStatus]);

  if (state.status === "pending") {
    return (
      <p role="status" className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
        Reading your slip…
      </p>
    );
  }
  return (
    <>
      <p
        role="status"
        className={`rounded-xl p-4 text-lg ${
          state.status === "read"
            ? "bg-zinc-100 dark:bg-zinc-900"
            : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        }`}
      >
        {state.status === "read"
          ? "Check what the app read against the photo. Fix anything that's wrong."
          : "The app couldn't read this slip. Fill in the values from the photo."}
      </p>
      <SlipValuesForm
        key={state.status}
        initial={state.values}
        submitLabel="Confirm slip"
        onSave={(values) => checkSlip(id, values)}
      />
    </>
  );
}
