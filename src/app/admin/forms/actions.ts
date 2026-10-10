"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { Json } from "@/lib/supabase/database.types";
import { checkForm, formSaveMessage, tidyQuestions, type Frequency, type Question } from "@/lib/forms";

export type FormInput = {
  name: string;
  frequency: Frequency;
  inDailyReport: boolean;
  allJobs: boolean;
  jobIds: string[];
  questions: Question[];
};

// Makes a form (id null) or saves changes to one. Changed questions become a
// new version; answers already sent keep theirs.
export async function saveForm(id: string | null, input: FormInput): Promise<{ error?: string; id?: string }> {
  const { supabase } = await requireAdmin();
  const problem = checkForm(input.name, input.questions);
  if (problem) return { error: problem };

  const { data, error } = await supabase.rpc("save_form", {
    // Null makes a new form.
    p_id: id as string,
    p_name: input.name,
    p_frequency: input.frequency,
    p_in_daily_report: input.inDailyReport,
    p_all_jobs: input.allJobs,
    p_job_ids: input.allJobs ? [] : input.jobIds,
    p_questions: tidyQuestions(input.questions) as unknown as Json,
  });
  if (error || !data) return { error: formSaveMessage(error?.message ?? "") };

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${data}`);
  return { id: data };
}

export async function setFormActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.rpc("set_form_active", { p_id: id, p_active: active });
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${id}`);
}
