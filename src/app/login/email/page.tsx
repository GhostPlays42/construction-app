import type { Metadata } from "next";
import Link from "next/link";
import { EmailForm } from "./email-form";

export const metadata: Metadata = { title: "Office sign in" };

export default function EmailLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold">Office sign in</h1>
      <EmailForm />
      <Link href="/login" className="text-center text-base text-zinc-600 underline dark:text-zinc-400">
        Field crew? Sign in with your phone
      </Link>
    </main>
  );
}
