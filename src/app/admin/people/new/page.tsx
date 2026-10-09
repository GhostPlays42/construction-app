import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { savePerson } from "../actions";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Add person" };

export default async function NewPersonPage() {
  const { supabase } = await requireAdmin();
  const { data: roles } = await supabase.from("roles").select("key, name").order("name");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Add person</h1>
      <PersonForm
        action={savePerson.bind(null, null)}
        roles={roles ?? []}
        initial={{
          full_name: "",
          phone: "",
          email: "",
          role_key: "employee",
          trade: "",
          hourly_rate: "",
          is_active: "on",
        }}
        isNew
        isSelf={false}
      />
    </main>
  );
}
