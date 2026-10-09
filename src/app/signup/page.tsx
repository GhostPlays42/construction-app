import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Start your company" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Start your company</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          You&apos;ll be the company&apos;s admin. You can add your crew after you sign in.
        </p>
      </div>
      <SignupForm />
      <Link href="/login/email" className="text-center text-base text-zinc-600 underline dark:text-zinc-400">
        Already set up? Sign in
      </Link>
    </main>
  );
}
