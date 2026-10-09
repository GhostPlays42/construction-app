import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { certStatus, formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { addCertification, removeCertification, savePerson } from "../actions";
import { CertBadge } from "../badges";
import { CertificationForm } from "../certification-form";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Edit person" };

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, { rate }] = await Promise.all([params, searchParams]);
  const { supabase, userId } = await requireAdmin();

  const [{ data: person }, { data: roles }, { data: rateRow }, { data: certs }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, phone, email, role_key, trade, is_active, user_id, roles(is_admin)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("roles").select("key, name").order("name"),
    supabase.from("employee_rates").select("hourly_rate").eq("employee_id", id).maybeSingle(),
    supabase
      .from("certifications")
      .select("id, name, expires_on")
      .eq("employee_id", id)
      .order("expires_on", { ascending: true, nullsFirst: false }),
  ]);
  if (!person) notFound();

  const isSelf = person.user_id === userId;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold">{person.full_name}</h1>

      {rate === "failed" && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
          {person.full_name} was added, but the hourly rate didn&apos;t save. Enter it again below.
        </p>
      )}
      {!person.user_id && person.is_active && (
        <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-800">
          {person.roles?.is_admin
            ? "Office staff can't sign in yet. Email sign-in invites come once the app's email is set up."
            : person.phone
              ? `${person.full_name.split(" ")[0]} can sign in now with ${formatPhone(person.phone)} and a text code.`
              : "Add a mobile phone number so they can sign in."}
        </p>
      )}

      <PersonForm
        action={savePerson.bind(null, person.id)}
        roles={roles ?? []}
        initial={{
          full_name: person.full_name,
          phone: person.phone ? formatPhone(person.phone) : "",
          email: person.email ?? "",
          role_key: person.role_key,
          trade: person.trade ?? "",
          hourly_rate: rateRow ? Number(rateRow.hourly_rate).toFixed(2) : "",
          is_active: person.is_active ? "on" : "",
        }}
        isNew={false}
        isSelf={isSelf}
      />

      <section className="mt-4 flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Certifications and tickets</h2>
        {(certs ?? []).length === 0 && (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">None added yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(certs ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border-2 border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-col gap-1">
                <span className="text-lg font-medium">{c.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-base text-zinc-600 dark:text-zinc-400">
                  {c.expires_on ? `Expires ${formatDate(c.expires_on)}` : "Doesn't expire"}
                  <CertBadge status={certStatus(c.expires_on)} />
                </span>
              </div>
              <form action={removeCertification.bind(null, c.id, person.id)}>
                <button type="submit" className="px-2 py-2 text-base text-red-700 underline dark:text-red-400">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
        <CertificationForm action={addCertification.bind(null, person.id)} />
      </section>
    </main>
  );
}
