import type { Metadata } from "next";
import Link from "next/link";
import { EmailForm } from "./email-form";

export const metadata: Metadata = { title: "Office sign in" };

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { link } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold">Office sign in</h1>
      {link === "expired" && (
        <p role="alert" className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-800">
          That email link has expired or was already used. If you&apos;ve already confirmed your
          email, sign in below.
        </p>
      )}
      <EmailForm />
      <div className="flex flex-col gap-3 text-center text-base text-zinc-600 dark:text-zinc-400">
        <Link href="/signup" className="underline">
          New company? Start here
        </Link>
        <Link href="/login" className="underline">
          Field crew? Sign in with your phone
        </Link>
      </div>
    </main>
  );
}
