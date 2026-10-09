import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { saveJob } from "../actions";
import { JobForm } from "../job-form";
import { crewChoices } from "../people";

export const metadata: Metadata = { title: "Add job" };

export default async function NewJobPage() {
  const { supabase } = await requireAdmin();
  const people = await crewChoices(supabase, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Add job</h1>
      <JobForm
        action={saveJob.bind(null, null)}
        people={people}
        initial={{
          name: "",
          job_number: "",
          address: "",
          client: "",
          start_date: "",
          end_date: "",
          status: "active",
          crew: "",
        }}
        isNew
      />
    </main>
  );
}
