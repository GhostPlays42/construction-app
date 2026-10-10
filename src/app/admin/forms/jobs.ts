import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// The jobs a form can be put on: every job not yet complete, plus any it's
// already on.
export async function jobChoices(supabase: SupabaseClient<Database>, onForm: string[]) {
  const { data } = await supabase.from("jobs").select("id, name, status").order("name");
  return (data ?? []).filter((j) => j.status !== "complete" || onForm.includes(j.id));
}
