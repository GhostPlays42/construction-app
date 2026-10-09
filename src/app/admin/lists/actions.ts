"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { loadList } from "./data";
import { isKind, KINDS, type Kind } from "./kinds";

export type ItemFormState = { error?: string; values?: Record<string, string>; saved?: number };

function text(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function friendlyDbError(kind: Kind, error: { code?: string }): string {
  if (error.code === "23505") {
    return KINDS[kind].hasCode
      ? "Another cost code already uses that code."
      : `That ${KINDS[kind].one} is already on the list.`;
  }
  return "Something went wrong. Check your connection and try again.";
}

function readItem(kind: Kind, fd: FormData) {
  const values = { code: text(fd, "code"), name: text(fd, "name") };
  if (KINDS[kind].hasCode && !values.code) return { values, error: "Enter the code, like 200." };
  if (!values.name) {
    return { values, error: KINDS[kind].hasCode ? "Enter what the code is for." : `Enter the ${KINDS[kind].one}.` };
  }
  return { values, error: undefined };
}

function refresh(kind: Kind) {
  revalidatePath("/admin/lists");
  revalidatePath(`/admin/lists/${kind}`);
}

// Adds an item to the end of a list.
export async function addItem(kind: Kind, _prev: ItemFormState, fd: FormData): Promise<ItemFormState> {
  if (!isKind(kind)) return { error: "That list doesn't exist." };
  const { supabase, companyId } = await requireAdmin();
  const { values, error } = readItem(kind, fd);
  if (error) return { error, values };

  const { items } = await loadList(supabase, kind);
  const sort_order = items.reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;
  const name = values.name.slice(0, 100);

  const { error: dbError } = KINDS[kind].hasCode
    ? await supabase
        .from("cost_codes")
        .insert({ company_id: companyId, code: values.code.slice(0, 20), name, sort_order })
    : await supabase
        .from(KINDS[kind].table as "hazards" | "ppe_items")
        .insert({ company_id: companyId, name, sort_order });
  if (dbError) return { error: friendlyDbError(kind, dbError), values };

  refresh(kind);
  // A fresh number each time tells the form to clear itself.
  return { saved: Date.now() };
}

// Renames an item (and, for cost codes, changes its code).
export async function saveItem(
  kind: Kind,
  id: string,
  _prev: ItemFormState,
  fd: FormData,
): Promise<ItemFormState> {
  if (!isKind(kind)) return { error: "That list doesn't exist." };
  const { supabase } = await requireAdmin();
  const { values, error } = readItem(kind, fd);
  if (error) return { error, values };
  const name = values.name.slice(0, 100);

  const { error: dbError } = KINDS[kind].hasCode
    ? await supabase.from("cost_codes").update({ code: values.code.slice(0, 20), name }).eq("id", id)
    : await supabase
        .from(KINDS[kind].table as "hazards" | "ppe_items")
        .update({ name })
        .eq("id", id);
  if (dbError) return { error: friendlyDbError(kind, dbError), values };

  refresh(kind);
  return { saved: Date.now(), values };
}

export async function setItemActive(kind: Kind, id: string, active: boolean) {
  if (!isKind(kind)) return;
  const { supabase } = await requireAdmin();
  await supabase
    .from(KINDS[kind].table)
    .update({ is_active: active })
    .eq("id", id);
  refresh(kind);
}

// Moves an item one place up or down among the items in use, then numbers
// the whole list again so the order stays clean.
export async function moveItem(kind: Kind, id: string, direction: "up" | "down") {
  if (!isKind(kind)) return;
  const { supabase } = await requireAdmin();
  const { items } = await loadList(supabase, kind);
  const active = items.filter((i) => i.is_active);
  const from = active.findIndex((i) => i.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= active.length) return;

  [active[from], active[to]] = [active[to], active[from]];
  const ordered = [...active, ...items.filter((i) => !i.is_active)];
  await Promise.all(
    ordered.flatMap((item, index) =>
      item.sort_order === index + 1
        ? []
        : [supabase.from(KINDS[kind].table).update({ sort_order: index + 1 }).eq("id", item.id)],
    ),
  );
  refresh(kind);
}
