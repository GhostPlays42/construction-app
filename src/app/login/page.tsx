import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <LoginForm />
      <Link href="/login/email" className="text-center text-base text-zinc-600 underline dark:text-zinc-400">
        Office staff? Sign in with email
      </Link>
    </main>
  );
}
