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

// Equipment that can be ticked for a job, on the same terms as the crew.
export async function equipmentChoices(supabase: SupabaseClient<Database>, onJob: string[]) {
  const { data } = await supabase
    .from("equipment")
    .select("id, name, unit_number, equipment_type, down_for_repair, is_active")
    .order("unit_number", { nullsFirst: false })
    .order("name");
  return (data ?? []).filter((e) => e.is_active || onJob.includes(e.id));
}
