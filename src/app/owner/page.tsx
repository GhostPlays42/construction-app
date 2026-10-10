import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { pushPublicKey } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { PushKeys } from "./push-keys";

export const metadata: Metadata = { title: "Owner view" };

const STATUS_LABEL: Record<string, string> = {
  trial: "Not billed yet",
  active: "Paying",
  suspended: "Access stopped",
};

const signedUp = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeZone: "America/Vancouver",
});

// Read-only list of every company on the platform, for the platform owner.
export default async function OwnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const { data: owner } = await supabase
    .from("platform_owners")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owner) redirect("/");

  // Active people are what a company will be billed for.
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, status, created_at, employees(count)")
    .eq("employees.is_active", true)
    .order("created_at", { ascending: false });

  const rows = (companies ?? []).map((c) => ({
    ...c,
    activeUsers: c.employees[0]?.count ?? 0,
  }));
  const totalUsers = rows.reduce((sum, c) => sum + c.activeUsers, 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Owner view</h1>
        <Link href="/" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load companies. Refresh to try again.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
              <p className="text-base text-zinc-600 dark:text-zinc-400">Companies</p>
              <p className="text-3xl font-bold">{rows.length}</p>
            </div>
            <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
              <p className="text-base text-zinc-600 dark:text-zinc-400">Active users</p>
              <p className="text-3xl font-bold">{totalUsers}</p>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="text-xl font-semibold">{c.name}</p>
                <p className="text-base text-zinc-600 dark:text-zinc-400">
                  Signed up {signedUp.format(new Date(c.created_at))} ·{" "}
                  {c.activeUsers} active {c.activeUsers === 1 ? "user" : "users"} ·{" "}
                  {STATUS_LABEL[c.status] ?? c.status}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-xl font-semibold">App notifications</h2>
        {pushPublicKey() ? (
          <p className="text-base text-green-700 dark:text-green-400">✓ Set up. Workers can turn them on from their home screen.</p>
        ) : (
          <>
            <p className="text-base text-zinc-600 dark:text-zinc-400">
              Not set up yet. Workers get a notification when their schedule changes once these keys are in Vercel.
            </p>
            <PushKeys />
          </>
        )}
      </section>
    </main>
  );
}
