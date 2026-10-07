"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, toE164 } from "@/lib/phone";

const RESEND_SECONDS = 30;

function friendlyError(error: { message?: string; code?: string }): string {
  if (error.code === "sms_send_failed") {
    return "We couldn't send a text to this number. Ask your office to check it.";
  }
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("phone_not_registered") || m.includes("signups not allowed")) {
    return "This number isn't set up yet. Ask your office to add you.";
  }
  if (m.includes("expired") || m.includes("invalid")) {
    return "That code didn't work. Check it, or send a new one.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  return "Something went wrong. Check your signal and try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(target: string) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({ phone: target });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return false;
    }
    setResendIn(RESEND_SECONDS);
    return true;
  }

  async function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phoneInput);
    if (!e164) {
      setError("Enter your 10-digit phone number.");
      return;
    }
    if (await sendCode(e164)) {
      setPhone(e164);
      setCode("");
      setStep("code");
    }
  }

  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || code.length !== 6) {
      setError("Enter the 6-digit code from your text.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error) {
      setBusy(false);
      setError(friendlyError(error));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const input =
    "w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-4 text-2xl text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const button =
    "w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-semibold text-black active:bg-amber-600 disabled:opacity-50";

  if (step === "phone") {
    return (
      <form onSubmit={onPhoneSubmit} className="flex flex-col gap-4" noValidate>
        <label htmlFor="phone" className="text-lg font-medium">
          Your phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(587) 555-0101"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          className={input}
          autoFocus
        />
        {error && <p role="alert" className="text-base text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={button}>
          {busy ? "Sending…" : "Text me a code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} className="flex flex-col gap-4" noValidate>
      <label htmlFor="code" className="text-lg font-medium">
        Enter the code we texted to {phone && formatPhone(phone)}
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
        className={`${input} tracking-[0.4em]`}
        autoFocus
      />
      {error && <p role="alert" className="text-base text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className={button}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <div className="flex justify-between text-base">
        <button
          type="button"
          className="py-2 text-zinc-600 underline dark:text-zinc-400"
          onClick={() => {
            setStep("phone");
            setError(null);
          }}
        >
          Change number
        </button>
        <button
          type="button"
          disabled={busy || resendIn > 0}
          className="py-2 text-zinc-600 underline disabled:no-underline disabled:opacity-60 dark:text-zinc-400"
          onClick={() => phone && sendCode(phone)}
        >
          {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}
