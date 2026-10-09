import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Types already in use, offered as suggestions so the list stays consistent
// (one "Excavator", not "excavator" and "Excavator").
export async function equipmentTypes(supabase: SupabaseClient<Database>) {
  const { data } = await supabase.from("equipment").select("equipment_type").not("equipment_type", "is", null);
  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    const t = row.equipment_type!;
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
