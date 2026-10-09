import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { KINDS, type Kind, type ListItem } from "./kinds";

// Every item in one list, in the order crews will see them.
export async function loadList(
  supabase: SupabaseClient<Database>,
  kind: Kind,
): Promise<{ items: ListItem[]; failed: boolean }> {
  if (KINDS[kind].hasCode) {
    const { data, error } = await supabase
      .from("cost_codes")
      .select("id, code, name, sort_order, is_active")
      .order("sort_order")
      .order("created_at");
    return { items: data ?? [], failed: !!error };
  }
  const { data, error } = await supabase
    .from(KINDS[kind].table as "hazards" | "ppe_items")
    .select("id, name, sort_order, is_active")
    .order("sort_order")
    .order("created_at");
  return { items: (data ?? []).map((i) => ({ ...i, code: null })), failed: !!error };
}
