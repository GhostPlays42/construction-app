"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { isShorter, parseKeepYears } from "@/lib/record-keeping";

export type KeepFormState = {
  error?: string;
  // Set when a shorter setting would delete records: what it would delete.
  confirm?: { value: string; counts: Record<string, number> };
  saved?: number;
};

const TRY_AGAIN = "Something went wrong. Check your connection and try again.";

// Saves how long the company keeps records. A shorter setting that would
// delete records is only saved once the office has seen how many and confirmed.
export async function saveKeepYears(_prev: KeepFormState, fd: FormData): Promise<KeepFormState> {
  const { supabase, companyId } = await requireAdmin();
  const value = String(fd.get("keep_years") ?? "");
  const years = parseKeepYears(value);
  if (years === undefined) return { error: "Pick how long to keep records." };

  const { data: company, error: readError } = await supabase
    .from("companies")
    .select("keep_years")
    .eq("id", companyId)
    .single();
  if (readError) return { error: TRY_AGAIN };

  if (isShorter(years, company.keep_years) && fd.get("confirmed") !== value) {
    const { data: counts, error } = await supabase.rpc("retention_preview", { p_years: years as number });
    if (error) return { error: TRY_AGAIN };
    const found = counts as Record<string, number>;
    if (Object.values(found).some((n) => n > 0)) return { confirm: { value, counts: found } };
  }

  const { error } = await supabase.rpc("set_keep_years", { p_years: years as number });
  if (error) return { error: TRY_AGAIN };
  revalidatePath("/admin/settings");
  return { saved: Date.now() };
}
