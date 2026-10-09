"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

function friendlyError(error: { message?: string; code?: string }): string {
  if (error.code === "weak_password") {
    return "Pick a stronger password. Use at least 8 characters, mixing letters and numbers.";
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return "That email address doesn't look right.";
  }
  if (error.code === "email_address_not_authorized") {
    // Supabase's built-in sender only mails the project's own team.
    return "We can't send email to that address yet. Please try again later.";
  }
  if (error.code === "over_email_send_rate_limit") {
    return "We can't send another email right now. Try again in an hour.";
  }
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

export function SignupForm() {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !fullName.trim() || !email.trim() || !password) {
      setError("Fill in every box.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    // The company is created when the email is confirmed (see the
    // company_sign_up migration), from the details sent along here.
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { company_name: companyName.trim(), full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setBusy(false);
      setError(friendlyError(error));
      return;
    }
    if (data.session) {
      // Email confirmation is switched off, so they are already signed in.
      window.location.replace("/");
      return;
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-5 text-lg dark:bg-zinc-800">
        <p className="text-xl font-semibold">Check your email</p>
        <p>
          We sent a link to <span className="font-medium">{sentTo}</span>. Open it to finish setting
          up {companyName.trim()}.
        </p>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Nothing there after a few minutes? Check your junk folder.
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-4 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <label htmlFor="company" className="text-lg font-medium">
        Company name
      </label>
      <input
        id="company"
        type="text"
        autoComplete="organization"
        maxLength={100}
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        className={input}
        autoFocus
      />
      <label htmlFor="name" className="text-lg font-medium">
        Your name
      </label>
      <input
        id="name"
        type="text"
        autoComplete="name"
        maxLength={100}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className={input}
      />
      <label htmlFor="email" className="text-lg font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />
      <label htmlFor="password" className="text-lg font-medium">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={input}
      />
      <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">At least {MIN_PASSWORD} characters.</p>
      {error && <p role="alert" className="text-base text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}
