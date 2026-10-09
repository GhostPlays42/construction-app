"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export type EquipmentFormState = { error?: string; values?: Record<string, string> };

function text(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function friendlyDbError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Another machine already uses that unit number.";
  return "Something went wrong. Check your connection and try again.";
}

// Adds a machine (id null) or saves changes to one.
export async function saveEquipment(
  id: string | null,
  _prev: EquipmentFormState,
  fd: FormData,
): Promise<EquipmentFormState> {
  const { supabase, companyId } = await requireAdmin();
  const values = {
    name: text(fd, "name"),
    unit_number: text(fd, "unit_number"),
    equipment_type: text(fd, "equipment_type"),
    make: text(fd, "make"),
    model: text(fd, "model"),
    ownership: text(fd, "ownership") || "owned",
    rental_company: text(fd, "rental_company"),
    hourly_rate: text(fd, "hourly_rate").replace(/^\$/, ""),
    down_for_repair: fd.get("down_for_repair") === "on" ? "on" : "",
    is_active: id === null || fd.get("is_active") === "on" ? "on" : "",
  };
  const fail = (error: string): EquipmentFormState => ({ error, values });

  if (!values.name) return fail("Enter what the machine is, like Excavator or Pickup.");
  if (values.ownership !== "owned" && values.ownership !== "rented") {
    return fail("Pick owned or rented.");
  }
  if (values.ownership === "rented" && !values.rental_company) {
    return fail("Enter the rental company.");
  }
  const rate = values.hourly_rate === "" ? null : Number(values.hourly_rate);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate >= 100000)) {
    return fail("Enter the hourly rate as a number, like 145.00.");
  }

  const record = {
    name: values.name.slice(0, 100),
    unit_number: values.unit_number.slice(0, 40) || null,
    equipment_type: values.equipment_type.slice(0, 60) || null,
    make: values.make.slice(0, 60) || null,
    model: values.model.slice(0, 60) || null,
    ownership: values.ownership,
    rental_company:
      values.ownership === "rented" ? values.rental_company.slice(0, 100) : null,
    down_for_repair: values.down_for_repair === "on",
    is_active: values.is_active === "on",
  };

  let equipmentId = id;
  if (id === null) {
    const { data, error } = await supabase
      .from("equipment")
      .insert({ ...record, company_id: companyId })
      .select("id")
      .single();
    if (error) return fail(friendlyDbError(error));
    equipmentId = data.id;
  } else {
    const { error } = await supabase.from("equipment").update(record).eq("id", id);
    if (error) return fail(friendlyDbError(error));
  }

  const { error: rateError } =
    rate === null
      ? await supabase.from("equipment_rates").delete().eq("equipment_id", equipmentId!)
      : await supabase.from("equipment_rates").upsert({
          equipment_id: equipmentId!,
          company_id: companyId,
          hourly_rate: Math.round(rate * 100) / 100,
        });
  if (rateError) {
    // The machine is saved; send them to its screen to try the rate again.
    revalidatePath("/admin/equipment");
    if (id === null) redirect(`/admin/equipment/${equipmentId}?rate=failed`);
    return fail("Saved, but the hourly rate didn't save. Try again.");
  }

  revalidatePath("/admin/equipment");
  revalidatePath("/admin/jobs");
  redirect("/admin/equipment");
}
