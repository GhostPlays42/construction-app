"use client";

import { useEffect, useState } from "react";

type State = "loading" | "hidden" | "add-to-home" | "off" | "blocked" | "on" | "failed";

// Whether this is an iPhone or iPad browser tab rather than the app added
// to the home screen. iPhones only allow notifications for the added app.
function iPhoneTab() {
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return apple && !standalone;
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Keys come as base64url text; the browser wants bytes.
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function tellServer(sub: PushSubscription) {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(String(res.status));
}

// Turns on app notifications so the worker hears when their schedule
// changes. Hidden when notifications aren't set up or are already on.
export function Notifications({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    const set = (s: State) => live && setState(s);
    (async () => {
      if (!publicKey) return set("hidden");
      if (!supported()) return set(iPhoneTab() ? "add-to-home" : "hidden");
      if (Notification.permission === "denied") return set("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Make sure the office still has this phone; it may have forgotten it.
        if (navigator.onLine) tellServer(sub).catch(() => {});
        return set("on");
      }
      set("off");
    })().catch(() => set("hidden"));
    return () => {
      live = false;
    };
  }, [publicKey]);

  const turnOn = async () => {
    if (!publicKey) return;
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await tellServer(sub);
      setState("on");
    } catch {
      setState("failed");
    } finally {
      setPending(false);
    }
  };

  const box = "flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800";
  const muted = "text-base text-zinc-600 dark:text-zinc-400";

  if (state === "add-to-home") {
    return (
      <section className={box} aria-label="Notifications">
        <h2 className="text-lg font-semibold">Get schedule notifications</h2>
        <p className={muted}>
          On iPhone, add this app to your home screen first: tap the Share button, then Add to Home Screen. Open the app
          from there to turn on notifications.
        </p>
      </section>
    );
  }
  if (state === "blocked") {
    return (
      <section className={box} aria-label="Notifications">
        <h2 className="text-lg font-semibold">Notifications are blocked</h2>
        <p className={muted}>To hear when your schedule changes, allow notifications for this app in your phone&apos;s settings.</p>
      </section>
    );
  }
  if (state === "off" || state === "failed") {
    return (
      <section className={box} aria-label="Notifications">
        <h2 className="text-lg font-semibold">Get schedule notifications</h2>
        <p className={muted}>Your phone will tell you when the office changes where you&apos;re working.</p>
        {state === "failed" && (
          <p role="alert" className="text-base text-red-700 dark:text-red-300">
            Couldn&apos;t turn them on. Check your signal and try again.
          </p>
        )}
        <button
          type="button"
          onClick={turnOn}
          disabled={pending}
          className="self-start rounded-xl border-2 border-amber-500 px-4 py-3 text-lg font-semibold disabled:opacity-50"
        >
          {pending ? "Turning on…" : "Turn on notifications"}
        </button>
      </section>
    );
  }
  return null;
}

// Stops notifications to this phone, for signing out. Never throws.
export async function stopNotifications() {
  try {
    if (!supported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  } catch {}
}
