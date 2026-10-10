"use client";

import { useState } from "react";
import { SlipValuesForm } from "@/app/trucking-slip/slip-values-form";
import type { SlipFormValues } from "@/lib/slip-values";
import { updateSlip } from "../actions";

// The slip's values, with a button to correct them.
export function EditSlip({ id, initial }: { id: string; initial: SlipFormValues }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start rounded-lg border-2 border-zinc-300 px-4 py-2 text-lg dark:border-zinc-700"
      >
        Correct values
      </button>
    );
  }
  return (
    <SlipValuesForm
      initial={initial}
      submitLabel="Save changes"
      onSave={async (values) => {
        const result = await updateSlip(id, values);
        if (result.saved) setEditing(false);
        return result;
      }}
    />
  );
}
