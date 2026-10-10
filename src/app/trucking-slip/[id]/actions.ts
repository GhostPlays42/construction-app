"use server";

import { redirect } from "next/navigation";
import { slipMessage } from "@/lib/offline/slip-rules";
import { createClient } from "@/lib/supabase/server";
import { rpcArgs, type SlipFormValues } from "@/lib/slip-values";

// The worker confirms or fixes what the app read from their slip.
export async function checkSlip(id: string, values: SlipFormValues): Promise<{ error?: string }> {
  const parsed = rpcArgs(id, values);
  if ("error" in parsed) return { error: slipMessage(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_trucking_slip", parsed.args);
  if (error) return { error: slipMessage(error.message) };
  redirect("/");
}
