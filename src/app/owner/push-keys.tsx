"use client";

import { useState } from "react";

function base64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Makes a new pair of app notification keys right here in the browser, for
// the owner to paste into Vercel. They're never sent anywhere by this page.
export function PushKeys() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [error, setError] = useState(false);

  const make = async () => {
    try {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const publicKey = base64url(await crypto.subtle.exportKey("raw", pair.publicKey));
      const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
      if (!d) throw new Error("no private key");
      setKeys({ publicKey, privateKey: d });
    } catch {
      setError(true);
    }
  };

  const field = "w-full break-all rounded-lg bg-zinc-100 p-3 font-mono text-sm select-all dark:bg-zinc-800";

  if (!keys) {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-base text-red-700 dark:text-red-300">
            This browser couldn&apos;t make keys. Try Chrome, Edge or Safari.
          </p>
        )}
        <button
          type="button"
          onClick={make}
          className="self-start rounded-xl bg-amber-500 px-5 py-3 text-lg font-semibold text-black active:bg-amber-600"
        >
          Make keys
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-base">
      <p>
        Add these in Vercel (Project, Settings, Environment Variables), then redeploy. Don&apos;t share the private key
        with anyone, and don&apos;t make new keys once workers have turned notifications on.
      </p>
      <p className="font-semibold">VAPID_PUBLIC_KEY</p>
      <p className={field}>{keys.publicKey}</p>
      <p className="font-semibold">VAPID_PRIVATE_KEY</p>
      <p className={field}>{keys.privateKey}</p>
      <p className="font-semibold">VAPID_SUBJECT</p>
      <p>
        <span className="font-mono">mailto:</span> followed by your email address, for example{" "}
        <span className="font-mono">mailto:you@example.com</span>. Push services use it to contact you if there&apos;s a
        problem.
      </p>
    </div>
  );
}
