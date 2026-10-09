"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { JobFormState } from "./actions";

export type JobValues = {
  name: string;
  job_number: string;
  address: string;
  client: string;
  start_date: string;
  end_date: string;
  status: string;
  crew: string;
  equipment: string;
};
type Person = { id: string; full_name: string; trade: string | null; is_active: boolean };
type Machine = {
  id: string;
  name: string;
  unit_number: string | null;
  equipment_type: string | null;
  down_for_repair: boolean;
  is_active: boolean;
};

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const label = "text-lg font-medium";
const hint = "-mt-1 text-base text-zinc-600 dark:text-zinc-400";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", hint: "Work is happening. Gets a daily report." },
  { value: "paused", label: "Paused", hint: "On hold. No daily report." },
  { value: "complete", label: "Complete", hint: "Finished. Kept for the records." },
];

export function JobForm({
  action,
  people,
  machines,
  initial,
  isNew,
}: {
  action: (prev: JobFormState, fd: FormData) => Promise<JobFormState>;
  people: Person[];
  machines: Machine[];
  initial: JobValues;
  isNew: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a failed save, keep what was entered.
  const v = state.values ?? initial;
  const crew = new Set(v.crew ? v.crew.split(",") : []);
  const equipment = new Set(v.equipment ? v.equipment.split(",") : []);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <label htmlFor="name" className={label}>
        Job name
      </label>
      <input id="name" name="name" defaultValue={v.name} autoComplete="off" className={input} />

      <label htmlFor="job_number" className={label}>
        Job number
      </label>
      <input id="job_number" name="job_number" defaultValue={v.job_number} autoComplete="off" className={input} />

      <label htmlFor="client" className={label}>
        Client
      </label>
      <input id="client" name="client" defaultValue={v.client} autoComplete="off" className={input} />

      <label htmlFor="address" className={label}>
        Site address
      </label>
      <textarea
        id="address"
        name="address"
        rows={2}
        defaultValue={v.address}
        autoComplete="off"
        className={input}
      />
      <p className={hint}>Crew get a map link to this address.</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="start_date" className={label}>
            Start date
          </label>
          <input id="start_date" name="start_date" type="date" defaultValue={v.start_date} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="end_date" className={label}>
            End date
          </label>
          <input id="end_date" name="end_date" type="date" defaultValue={v.end_date} className={input} />
        </div>
      </div>

      <fieldset className="mt-2 flex flex-col gap-2">
        <legend className={`${label} mb-2`}>Status</legend>
        {STATUS_OPTIONS.map((s) => (
          <label
            key={s.value}
            className="flex items-start gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800"
          >
            <input
              type="radio"
              name="status"
              value={s.value}
              defaultChecked={v.status === s.value}
              className="mt-1 h-5 w-5 accent-amber-500"
            />
            <span className="flex flex-col">
              <span className="text-lg font-medium">{s.label}</span>
              <span className="text-base text-zinc-600 dark:text-zinc-400">{s.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-2 flex flex-col gap-2">
        <legend className={`${label} mb-2`}>Crew on this job</legend>
        {people.length === 0 && (
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Add people first, then come back to assign them.
          </p>
        )}
        {people.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800"
          >
            <input
              type="checkbox"
              name="crew"
              value={p.id}
              defaultChecked={crew.has(p.id)}
              className="h-6 w-6 accent-amber-500"
            />
            <span className="flex flex-col">
              <span className="text-lg">{p.full_name}</span>
              <span className="text-base text-zinc-600 dark:text-zinc-400">
                {[p.trade, p.is_active ? null : "Switched off"].filter(Boolean).join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-2 flex flex-col gap-2">
        <legend className={`${label} mb-2`}>Equipment on this job</legend>
        {machines.length === 0 && (
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Add equipment first, then come back to put it on this job.
          </p>
        )}
        {machines.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800"
          >
            <input
              type="checkbox"
              name="equipment"
              value={m.id}
              defaultChecked={equipment.has(m.id)}
              className="h-6 w-6 accent-amber-500"
            />
            <span className="flex flex-col">
              <span className="text-lg">{m.unit_number ? `${m.unit_number} · ${m.name}` : m.name}</span>
              <span className="text-base text-zinc-600 dark:text-zinc-400">
                {[
                  m.equipment_type,
                  m.down_for_repair ? "Down for repair" : null,
                  m.is_active ? null : "Switched off",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p role="alert" className="text-base text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="mt-2 flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : isNew ? "Add job" : "Save"}
        </button>
        <Link
          href="/admin/jobs"
          className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
