import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Admins and platform owners must confirm each sign-in with a code from an
// authenticator app. The database withholds admin powers until they do; this
// tells the app when to send them to /verify.
export async function needsAppCode(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const [{ data: me }, { data: owner }, { data: aal }] = await Promise.all([
    supabase
      .from("employees")
      .select("roles(is_admin)")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const privileged = Boolean(me?.roles?.is_admin) || Boolean(owner);
  return privileged && aal?.currentLevel !== "aal2";
}
