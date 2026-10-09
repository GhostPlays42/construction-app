"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { toE164 } from "@/lib/phone";

export type FormState = { error?: string; values?: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function friendlyDbError(error: { code?: string; message?: string; hint?: string }): string {
  if (error.message === "cannot_lock_yourself_out" && error.hint) return error.hint;
  if (error.code === "23505" && error.message?.includes("phone")) {
    return "That phone number already belongs to someone else.";
  }
  if (error.code === "23505" && error.message?.includes("email")) {
    return "Someone in your company already uses that email.";
  }
  return "Something went wrong. Check your connection and try again.";
}

// Adds a person (id null) or saves changes to one.
export async function savePerson(
  id: string | null,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { supabase, companyId } = await requireAdmin();
  const values = {
    full_name: text(fd, "full_name"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    role_key: text(fd, "role_key") || "employee",
    trade: text(fd, "trade"),
    hourly_rate: text(fd, "hourly_rate").replace(/^\$/, ""),
    is_active: id === null || fd.get("is_active") === "on" ? "on" : "",
  };
  const fail = (error: string): FormState => ({ error, values });

  if (!values.full_name) return fail("Enter the person's name.");
  const phone = values.phone ? toE164(values.phone) : null;
  if (values.phone && !phone) return fail("Enter a 10-digit phone number.");
  if (values.email && !EMAIL.test(values.email)) return fail("That email doesn't look right.");
  if (!phone && !values.email) {
    return fail("Add a phone number (field crew) or an email (office staff).");
  }
  const rate = values.hourly_rate === "" ? null : Number(values.hourly_rate);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate >= 10000)) {
    return fail("Enter the hourly rate as a number, like 32.50.");
  }

  const record = {
    full_name: values.full_name.slice(0, 100),
    phone,
    email: values.email || null,
    role_key: values.role_key,
    trade: values.trade.slice(0, 100) || null,
    is_active: values.is_active === "on",
  };

  let employeeId = id;
  if (id === null) {
    const { data, error } = await supabase
      .from("employees")
      .insert({ ...record, company_id: companyId })
      .select("id")
      .single();
    if (error) return fail(friendlyDbError(error));
    employeeId = data.id;
  } else {
    const { error } = await supabase.from("employees").update(record).eq("id", id);
    if (error) return fail(friendlyDbError(error));
  }

  const { error: rateError } =
    rate === null
      ? await supabase.from("employee_rates").delete().eq("employee_id", employeeId!)
      : await supabase.from("employee_rates").upsert({
          employee_id: employeeId!,
          company_id: companyId,
          hourly_rate: Math.round(rate * 100) / 100,
        });
  if (rateError) {
    // The person is saved; send them to the edit screen to try the rate again.
    revalidatePath("/admin/people");
    if (id === null) redirect(`/admin/people/${employeeId}?rate=failed`);
    return fail("Saved, but the hourly rate didn't save. Try again.");
  }

  revalidatePath("/admin/people");
  redirect("/admin/people");
}

export async function addCertification(
  employeeId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { supabase, companyId } = await requireAdmin();
  const values = { name: text(fd, "name"), expires_on: text(fd, "expires_on") };
  if (!values.name) return { error: "Enter the certification or ticket name.", values };
  if (values.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(values.expires_on)) {
    return { error: "Pick the expiry date from the calendar.", values };
  }

  const { error } = await supabase.from("certifications").insert({
    company_id: companyId,
    employee_id: employeeId,
    name: values.name.slice(0, 100),
    expires_on: values.expires_on || null,
  });
  if (error) return { error: friendlyDbError(error), values };

  revalidatePath(`/admin/people/${employeeId}`);
  revalidatePath("/admin/people");
  return {};
}

export async function removeCertification(certificationId: string, employeeId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("certifications").delete().eq("id", certificationId);
  revalidatePath(`/admin/people/${employeeId}`);
  revalidatePath("/admin/people");
}
