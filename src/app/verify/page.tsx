import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { needsAppCode } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Confirm it's you" };

export default async function VerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await needsAppCode(supabase, user.id))) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <VerifyForm />
      <form action={signOut} className="text-center">
        <button type="submit" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Sign out
        </button>
      </form>
    </main>
  );
}
