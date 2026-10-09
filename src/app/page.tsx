import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { needsAppCode } from "@/lib/auth";
import { buildSnapshot } from "@/lib/offline/snapshot";
import { createClient } from "@/lib/supabase/server";
import { WorkerHome } from "./home/worker-home";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  // Row level security returns nothing when the person is inactive or their
  // company is suspended, so a missing row means "no access".
  const [{ data: me, error: meError }, { data: owner }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, role_key, companies(name), roles(is_admin)")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("platform_owners").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  // The platform owner may not belong to any company.
  if (!me && owner) redirect("/owner");

  const signOutButton = (
    <form action={signOut}>
      <button
        type="submit"
        className="w-full rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700"
      >
        Sign out
      </button>
    </form>
  );

  // A lookup that failed is not the same as no access; don't tell a worker
  // their access is off because the server hiccuped.
  if (meError) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load your account. Refresh to try again.
        </p>
        {signOutButton}
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
        <h1 className="text-2xl font-bold">Your access is turned off</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Contact your office if you think this is a mistake.
        </p>
        {signOutButton}
      </main>
    );
  }

  const firstName = me.full_name.split(" ")[0];

  if (!me.roles?.is_admin) {
    const snapshot = await buildSnapshot(supabase, user.id).catch(() => null);
    if (!snapshot) {
      return (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
          <p role="alert" className="text-lg text-red-600 dark:text-red-400">
            Couldn&apos;t load your jobs. Refresh to try again.
          </p>
          {signOutButton}
        </main>
      );
    }
    return <WorkerHome initial={snapshot} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{me.companies?.name}</p>
        <h1 className="text-3xl font-bold">Hi, {firstName}</h1>
      </div>
      <Link
        href="/admin/people"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        People
      </Link>
      <Link
        href="/admin/jobs"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Job sites
      </Link>
      <Link
        href="/admin/equipment"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Equipment
      </Link>
      <Link
        href="/admin/flha"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        FLHAs
      </Link>
      <Link
        href="/admin/safety"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Safety meetings
      </Link>
      <Link
        href="/admin/time-cards"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Time cards
      </Link>
      <Link
        href="/admin/lists"
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-center text-xl font-semibold text-black active:bg-amber-600"
      >
        Lists
      </Link>
      {owner && (
        <Link
          href="/owner"
          className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-center text-lg font-medium dark:bg-zinc-800"
        >
          Owner view
        </Link>
      )}
      {signOutButton}
    </main>
  );
}
