"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "./actions";

type Role = { key: string; name: string };
export type PersonValues = {
  full_name: string;
  phone: string;
  email: string;
  role_key: string;
  trade: string;
  hourly_rate: string;
  is_active: string;
};

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const label = "text-lg font-medium";
const hint = "-mt-1 text-base text-zinc-600 dark:text-zinc-400";

export function PersonForm({
  action,
  roles,
  initial,
  isNew,
  isSelf,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  roles: Role[];
  initial: PersonValues;
  isNew: boolean;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a failed save, keep what was typed.
  const v = state.values ?? initial;

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <label htmlFor="full_name" className={label}>
        Name
      </label>
      <input id="full_name" name="full_name" defaultValue={v.full_name} autoComplete="off" className={input} />

      <label htmlFor="phone" className={label}>
        Mobile phone
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        placeholder="(587) 555-0101"
        defaultValue={v.phone}
        autoComplete="off"
        className={input}
      />
      <p className={hint}>Field crew sign in with this number and a text code.</p>

      <label htmlFor="email" className={label}>
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        defaultValue={v.email}
        autoComplete="off"
        className={input}
      />
      <p className={hint}>Office staff sign in with their email.</p>

      <label htmlFor="role_key" className={label}>
        Role
      </label>
      <select
        id="role_key"
        name="role_key"
        defaultValue={v.role_key}
        disabled={isSelf}
        className={input}
      >
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.name}
          </option>
        ))}
      </select>
      {isSelf && (
        <>
          <input type="hidden" name="role_key" value={v.role_key} />
          <p className={hint}>You can&apos;t change your own role.</p>
        </>
      )}

      <label htmlFor="trade" className={label}>
        Trade or position
      </label>
      <input
        id="trade"
        name="trade"
        placeholder="Labourer, Operator, Foreman…"
        defaultValue={v.trade}
        autoComplete="off"
        className={input}
      />

      <label htmlFor="hourly_rate" className={label}>
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

      {!isNew && (
        <label className="mt-2 flex items-center gap-3 text-lg">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={v.is_active === "on"}
            disabled={isSelf}
            className="h-6 w-6 accent-amber-500"
          />
          Active (can sign in and use the app)
        </label>
      )}
      {!isNew && isSelf && <input type="hidden" name="is_active" value="on" />}

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
          {pending ? "Saving…" : isNew ? "Add person" : "Save"}
        </button>
        <Link
          href="/admin/people"
          className="rounded-xl border-2 border-zinc-300 px-5 py-4 text-xl dark:border-zinc-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
