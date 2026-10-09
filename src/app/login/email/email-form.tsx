"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function friendlyError(error: { message?: string; code?: string }): string {
  if (error.code === "invalid_credentials") {
    return "That email or password isn't right.";
  }
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

export function EmailForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      setError(friendlyError(error));
      return;
    }
    // A full page load, so admins land on /verify exactly once.
    window.location.replace("/");
  }

  const input =
    "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-4 text-xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <label htmlFor="email" className="text-lg font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
        autoFocus
      />
      <label htmlFor="password" className="text-lg font-medium">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={input}
      />
      {error && <p role="alert" className="text-base text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
