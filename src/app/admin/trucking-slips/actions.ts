"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { slipMessage } from "@/lib/offline/slip-rules";
import { rpcArgs, type SlipFormValues } from "@/lib/slip-values";

// The office corrects a slip's values. The database logs every change.
export async function updateSlip(id: string, values: SlipFormValues): Promise<{ error?: string; saved?: boolean }> {
  const { supabase } = await requireAdmin();
  const parsed = rpcArgs(id, values);
  if ("error" in parsed) return { error: slipMessage(parsed.error) };
  const { error } = await supabase.rpc("update_trucking_slip", parsed.args);
  if (error) return { error: slipMessage(error.message) };
  revalidatePath("/admin/trucking-slips", "layout");
  return { saved: true };
}
