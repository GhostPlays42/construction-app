"use client";

import { useState } from "react";
import type { SlipFormValues } from "@/lib/slip-values";

const text =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const FIELDS: { key: keyof SlipFormValues; label: string; numeric?: boolean; date?: boolean }[] = [
  { key: "trucking_company", label: "Trucking company" },
  { key: "truck_number", label: "Truck #" },
  { key: "ticket_number", label: "Ticket #" },
  { key: "material", label: "Material" },
  { key: "loads", label: "Loads", numeric: true },
  { key: "tonnage", label: "Tonnage (t)", numeric: true },
  { key: "slip_date", label: "Date on slip", date: true },
];

// The slip's values to check or correct. Used by the worker's check screen
// and the office's edit screen.
export function SlipValuesForm({
  initial,
  submitLabel,
  onSave,
}: {
  initial: SlipFormValues;
  submitLabel: string;
  onSave: (values: SlipFormValues) => Promise<{ error?: string } | void>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        const result = await onSave(values).catch(() => ({
          error: "Couldn't save. Check your signal and try again.",
        }));
        if (result?.error) {
          setError(result.error);
          setPending(false);
        }
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-lg font-medium">{f.label}</span>
          <input
            value={values[f.key]}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            type={f.date ? "date" : "text"}
            inputMode={f.numeric ? "decimal" : undefined}
            maxLength={200}
            className={text}
          />
        </label>
      ))}
      <p className="-mt-1 text-base text-zinc-600 dark:text-zinc-400">Fill in loads, tonnage, or both.</p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-amber-500 px-4 py-5 text-2xl font-bold text-black active:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
