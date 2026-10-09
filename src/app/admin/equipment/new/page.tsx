import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { saveEquipment } from "../actions";
import { EquipmentForm } from "../equipment-form";
import { equipmentTypes } from "../types";

export const metadata: Metadata = { title: "Add equipment" };

export default async function NewEquipmentPage() {
  const { supabase } = await requireAdmin();
  const types = await equipmentTypes(supabase);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Add equipment</h1>
      <EquipmentForm
        action={saveEquipment.bind(null, null)}
        types={types}
        initial={{
          name: "",
          unit_number: "",
          equipment_type: "",
          make: "",
          model: "",
          ownership: "owned",
          rental_company: "",
          hourly_rate: "",
          down_for_repair: "",
          is_active: "on",
        }}
        isNew
      />
    </main>
  );
}
