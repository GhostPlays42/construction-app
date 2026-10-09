"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EquipmentFormState } from "./actions";

export type EquipmentValues = {
  name: string;
  unit_number: string;
  equipment_type: string;
  make: string;
  model: string;
  ownership: string;
  rental_company: string;
  hourly_rate: string;
  down_for_repair: string;
  is_active: string;
};

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const label = "text-lg font-medium";
const hint = "-mt-1 text-base text-zinc-600 dark:text-zinc-400";
const choice =
  "flex items-start gap-3 rounded-xl border-2 border-zinc-200 p-3 has-[:checked]:border-amber-500 dark:border-zinc-800";

export function EquipmentForm({
  action,
  types,
  initial,
  isNew,
}: {
  action: (prev: EquipmentFormState, fd: FormData) => Promise<EquipmentFormState>;
  types: string[];
  initial: EquipmentValues;
  isNew: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a failed save, keep what was entered.
  const v = state.values ?? initial;

  return (
    // The rental company box only shows while "Rented" is picked.
    <form action={formAction} className="group flex flex-col gap-3" noValidate>
      <label htmlFor="name" className={label}>
        Machine
      </label>
      <input id="name" name="name" defaultValue={v.name} autoComplete="off" className={input} />
      <p className={hint}>What crews call it, like Excavator or Service truck.</p>

      <label htmlFor="unit_number" className={label}>
        Unit number
      </label>
      <input id="unit_number" name="unit_number" defaultValue={v.unit_number} autoComplete="off" className={input} />

      <label htmlFor="equipment_type" className={label}>
        Type
      </label>
      <input
        id="equipment_type"
        name="equipment_type"
        list="equipment-types"
        defaultValue={v.equipment_type}
        autoComplete="off"
        className={input}
      />
      <datalist id="equipment-types">
        {types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="make" className={label}>
            Make
          </label>
          <input id="make" name="make" defaultValue={v.make} autoComplete="off" className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="model" className={label}>
            Model
          </label>
          <input id="model" name="model" defaultValue={v.model} autoComplete="off" className={input} />
        </div>
      </div>

      <fieldset className="mt-2 grid grid-cols-2 gap-3">
        <legend className={`${label} mb-2`}>Owned or rented</legend>
        {[
          { value: "owned", text: "Owned" },
          { value: "rented", text: "Rented" },
        ].map((o) => (
          <label key={o.value} className={`${choice} items-center`}>
            <input
              type="radio"
              id={`ownership-${o.value}`}
              name="ownership"
              value={o.value}
              defaultChecked={v.ownership === o.value}
              className="h-5 w-5 accent-amber-500"
            />
            <span className="text-lg font-medium">{o.text}</span>
          </label>
        ))}
      </fieldset>

      <div className="hidden flex-col gap-2 group-has-[#ownership-rented:checked]:flex">
        <label htmlFor="rental_company" className={label}>
          Rental company
        </label>
        <input
          id="rental_company"
          name="rental_company"
          defaultValue={v.rental_company}
          autoComplete="off"
          className={input}
        />
      </div>

      <label htmlFor="hourly_rate" className={`${label} mt-2`}>
        Hourly rate
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-zinc-500">
          $
        </span>
        <input
          id="hourly_rate"
          name="hourly_rate"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={v.hourly_rate}
          autoComplete="off"
          className={`${input} pl-9`}
        />
      </div>
      <p className={hint}>Only admins can see rates.</p>

      <label className={`${choice} mt-2`}>
        <input
          type="checkbox"
          name="down_for_repair"
          defaultChecked={v.down_for_repair === "on"}
          className="mt-0.5 h-6 w-6 accent-amber-500"
        />
        <span className="flex flex-col">
          <span className="text-lg font-medium">Down for repair</span>
          <span className="text-base text-zinc-600 dark:text-zinc-400">
            Untick when it&apos;s fixed. &quot;On a job&quot; is set by ticking it on an active job.
          </span>
        </span>
      </label>

      {!isNew && (
        <label className="mt-2 flex items-center gap-3 text-lg">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={v.is_active === "on"}
            className="h-6 w-6 accent-amber-500"
          />
          Active (switch off when it&apos;s sold or returned)
        </label>
      )}

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
          {pending ? "Saving…" : isNew ? "Add equipment" : "Save"}
        </button>
        <Link
          href="/admin/equipment"
          className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
