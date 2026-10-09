"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function CertificationForm({
  action,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? { name: "", expires_on: "" };

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800" noValidate>
      <p className="text-lg font-medium">Add a certification or ticket</p>
      <label htmlFor="cert_name" className="sr-only">
        Name
      </label>
      <input
        id="cert_name"
        name="name"
        placeholder="First Aid, H2S Alive, WHMIS…"
        defaultValue={v.name}
        autoComplete="off"
        className={input}
      />
      <label htmlFor="expires_on" className="text-base">
        Expiry date (leave blank if it doesn&apos;t expire)
      </label>
      <input id="expires_on" name="expires_on" type="date" defaultValue={v.expires_on} className={input} />
      {state.error && (
        <p role="alert" className="text-base text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
