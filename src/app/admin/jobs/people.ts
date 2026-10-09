import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// People who can be picked for a job's crew: everyone active, plus anyone
// already on the crew who has since been switched off (so saving the job
// doesn't quietly drop them).
export async function crewChoices(supabase: SupabaseClient<Database>, onCrew: string[]) {
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, trade, is_active")
    .order("full_name");
  return (data ?? []).filter((p) => p.is_active || onCrew.includes(p.id));
}
