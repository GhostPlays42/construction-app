import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { buildSnapshot } from "@/lib/offline/snapshot";
import { createClient } from "@/lib/supabase/server";
import { TimeCardScreen } from "./time-card-screen";

export const metadata: Metadata = { title: "Time card" };

export default async function TimeCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const { data: me } = await supabase
    .from("employees")
    .select("roles(is_admin)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.roles?.is_admin) redirect("/");

  const snapshot = await buildSnapshot(supabase, user.id).catch(() => null);
  if (!snapshot) redirect("/");

  // Which job and what has been sent are worked out on the phone, from its
  // own copy when there's no signal.
  return <TimeCardScreen initial={snapshot} />;
}
