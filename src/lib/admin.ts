import { redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// For office screens and their server actions: sends anyone who isn't a
// fully signed-in admin away. Row level security enforces the same rules in
// the database; this just keeps people off screens they can't use.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const { data: me } = await supabase
    .from("employees")
    .select("id, company_id, roles(is_admin)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.roles?.is_admin) redirect("/");

  return { supabase, userId: user.id, employeeId: me.id, companyId: me.company_id };
}
