"use client";

import { useActionState } from "react";
import { addItem, moveItem, saveItem, setItemActive, type ItemFormState } from "./actions";
import type { Kind, ListItem } from "./kinds";

const input =
  "min-w-0 rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const smallButton =
  "rounded-lg border-2 border-zinc-300 px-3 py-2 text-base active:bg-zinc-100 disabled:opacity-30 dark:border-zinc-700 dark:active:bg-zinc-900";

function Fields({
  hasCode,
  values,
  idPrefix,
  one,
}: {
  hasCode: boolean;
  values: { code: string; name: string };
  idPrefix: string;
  one: string;
}) {
  return (
    <div className="flex gap-2">
      {hasCode && (
        <input
          name="code"
          aria-label={`Code (${idPrefix})`}
          placeholder="Code"
          defaultValue={values.code}
          autoComplete="off"
          className={`${input} w-24 flex-none`}
        />
      )}
      <input
        name="name"
        aria-label={`${hasCode ? "Description" : "Name"} (${idPrefix})`}
        placeholder={hasCode ? "What it's for" : `New ${one}`}
        defaultValue={values.name}
        autoComplete="off"
        className={`${input} w-full flex-1`}
      />
    </div>
  );
}

export function AddItemForm({ kind, hasCode, one }: { kind: Kind; hasCode: boolean; one: string }) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(addItem.bind(null, kind), {});
  const v = state.values ?? { code: "", name: "" };

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900" noValidate>
      {/* A new key after each add clears the boxes. */}
      <div key={state.saved ?? 0}>
        <Fields hasCode={hasCode} values={{ code: v.code ?? "", name: v.name ?? "" }} idPrefix="new" one={one} />
      </div>
      {state.error && (
        <p role="alert" className="text-base text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-amber-500 px-4 py-3 text-lg font-semibold text-black active:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "Adding…" : `Add ${one}`}
      </button>
    </form>
  );
}

export function ItemRow({
  kind,
  hasCode,
  one,
  item,
  label,
  first,
  last,
}: {
  kind: Kind;
  hasCode: boolean;
  one: string;
  item: ListItem;
  label: string;
  first: boolean;
  last: boolean;
}) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(
    saveItem.bind(null, kind, item.id),
    {},
  );
  const v = state.values ?? { code: item.code ?? "", name: item.name };

  return (
    <li>
      <form
        action={formAction}
        className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-3 dark:border-zinc-800"
        noValidate
      >
        <Fields hasCode={hasCode} values={{ code: v.code ?? "", name: v.name ?? "" }} idPrefix={label} one={one} />
        {state.error && (
          <p role="alert" className="text-base text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={smallButton}>
            {pending ? "Saving…" : "Save"}
          </button>
          {item.is_active ? (
            <>
              <button
                type="submit"
                formAction={moveItem.bind(null, kind, item.id, "up")}
                disabled={first}
                aria-label={`Move ${label} up`}
                className={smallButton}
              >
                ↑
              </button>
              <button
                type="submit"
                formAction={moveItem.bind(null, kind, item.id, "down")}
                disabled={last}
                aria-label={`Move ${label} down`}
                className={smallButton}
              >
                ↓
              </button>
              <button
                type="submit"
                formAction={setItemActive.bind(null, kind, item.id, false)}
                className={`${smallButton} ml-auto`}
              >
                Switch off
              </button>
            </>
          ) : (
            <button
              type="submit"
              formAction={setItemActive.bind(null, kind, item.id, true)}
              className={`${smallButton} ml-auto`}
            >
              Switch on
            </button>
          )}
          {state.saved && !state.error && !pending && (
            <span className="text-base text-green-700 dark:text-green-400">Saved</span>
          )}
        </div>
      </form>
    </li>
  );
}
