import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { needsAppCode } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  // Row level security returns nothing when the person is inactive or their
  // company is suspended, so a missing row means "no access".
  const { data: me } = await supabase
    .from("employees")
    .select("full_name, role_key, companies(name)")
    .eq("user_id", user.id)
    .maybeSingle();

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

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{me.companies?.name}</p>
        <h1 className="text-3xl font-bold">Hi, {me.full_name.split(" ")[0]}</h1>
      </div>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        You&apos;re signed in. Your jobs and forms will show up here.
      </p>
      {signOutButton}
    </main>
  );
}
