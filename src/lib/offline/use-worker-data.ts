"use client";

import { useCallback, useEffect, useState } from "react";
import { onOutboxChanged, outboxFor, pruneSent, sendWaiting, snapshots } from "./outbox";
import type { OutboxItem, WorkerSnapshot } from "./types";

const SEND_EVERY_MS = 30_000;
const REFRESH_EVERY_MS = 5 * 60_000;

// Puts the app on the phone (the service worker) and keeps a copy of the
// worker's screens there, so they open with no signal.
function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (navigator.onLine) reg.active?.postMessage({ type: "warm", paths: ["/", "/flha", "/time-card", "/safety-meeting"] });
      })
      .catch(() => {});
  }, []);
}

// The worker's job, lists and unsent forms: the server's copy when there's
// signal, the phone's copy when there isn't.
export function useWorkerData(initial: WorkerSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [offline, setOffline] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const userId = initial.userId;
  useServiceWorker();

  const loadOutbox = useCallback(() => {
    outboxFor(userId)
      .then(setOutbox)
      .catch(() => {});
  }, [userId]);

  const send = useCallback(async () => {
    const result = await sendWaiting(userId).catch(() => "offline" as const);
    if (result === "offline") setOffline(true);
    if (result === "signed_out") setSignedOut(true);
    if (result === "sent") setOffline(false);
    return result;
  }, [userId]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/worker/snapshot", { signal: AbortSignal.timeout(15_000) });
      if (res.status === 401) return setSignedOut(true);
      if (!res.ok) return;
      const fresh = (await res.json()) as WorkerSnapshot;
      if (fresh.userId !== userId) return;
      setSnapshot(fresh);
      setOffline(false);
      setSignedOut(false);
      await snapshots.set(fresh).catch(() => {});
      await pruneSent(userId, fresh).catch(() => {});
    } catch {
      setOffline(true);
    }
  }, [userId]);

  useEffect(() => {
    // The page may have come from the phone's copy, so prefer whichever is newer.
    snapshots
      .get(userId)
      .then((local) => {
        if (local && local.fetchedAt > initial.fetchedAt) setSnapshot(local);
        else return snapshots.set(initial);
      })
      .catch(() => {});
    loadOutbox();
    // Send first, so the refreshed copy already includes what just went out.
    const start = setTimeout(() => send().then(refresh), 0);

    const goneOnline = () => send().then(refresh);
    const goneOffline = () => setOffline(true);
    window.addEventListener("online", goneOnline);
    window.addEventListener("offline", goneOffline);
    const stop = onOutboxChanged(loadOutbox);
    const sender = setInterval(send, SEND_EVERY_MS);
    const refresher = setInterval(refresh, REFRESH_EVERY_MS);
    return () => {
      window.removeEventListener("online", goneOnline);
      window.removeEventListener("offline", goneOffline);
      stop();
      clearTimeout(start);
      clearInterval(sender);
      clearInterval(refresher);
    };
  }, [userId, initial, loadOutbox, send, refresh]);

  return { snapshot, outbox, offline, signedOut, send, refresh };
}
