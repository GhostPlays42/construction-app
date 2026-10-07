"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Setup = { qrCode: string; secret: string; uri: string };

function friendlyError(error: { message?: string; code?: string }): string {
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired") {
    return "That code didn't work. Codes change every 30 seconds, so try the newest one.";
  }
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

export function VerifyForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Setting up creates a new key each time, so start only once even if React
  // runs this effect twice (it does in development).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const mfa = createClient().auth.mfa;
    (async () => {
      const { data, error } = await mfa.listFactors();
      if (error) return setError(friendlyError(error));
      const ready = data.totp.find((f) => f.status === "verified");
      if (ready) return setFactorId(ready.id);

      // First sign-in: clear any half-finished setup, then start a new one.
      for (const f of data.all) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await mfa.unenroll({ factorId: f.id });
        }
      }
      const enrolled = await mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (enrolled.error) return setError(friendlyError(enrolled.error));
      setFactorId(enrolled.data.id);
      setSetup({
        qrCode: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
        uri: enrolled.data.totp.uri,
      });
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setBusy(false);
      setError(friendlyError(error));
      return;
    }
    // A full page load, so the server sees the upgraded session.
    window.location.replace("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">
        {setup ? "Set up your authenticator app" : "Confirm it's you"}
      </h1>

      {setup && (
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-lg">
          <li>
            Install an authenticator app on your phone, such as Google Authenticator or Microsoft
            Authenticator.
          </li>
          <li>
            In the app, add an account and scan this code.
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase */}
            <img
              src={setup.qrCode}
              alt="Code to scan with your authenticator app"
              className="mt-3 h-48 w-48 rounded-lg bg-white p-2"
            />
          </li>
          <li>
            On this phone already?{" "}
            <a href={setup.uri} className="underline">
              Open in your authenticator app
            </a>
            , or type this key into it:
            <code className="mt-2 block break-all rounded-lg bg-zinc-100 p-3 text-base dark:bg-zinc-800">
              {setup.secret}
            </code>
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {!setup && factorId && (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Enter the 6-digit code from your authenticator app.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <label htmlFor="code" className="sr-only">
          6-digit code
        </label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-4 text-2xl tracking-[0.4em] text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          autoFocus
        />
        {error && <p role="alert" className="text-base text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !factorId}
          className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Confirm"}
        </button>
      </form>
    </div>
  );
}
