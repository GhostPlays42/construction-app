import { kv, outboxStore } from "./store";
import type { OutboxItem, WorkerSnapshot } from "./types";

// Forms are saved on the phone first and sent from here, so nothing is lost
// when there's no signal. Screens listen for "outbox-changed" to redraw.

const CHANGED = "outbox-changed";
// A send that takes longer than this is treated as no signal; it retries later.
const SEND_TIMEOUT_MS = 20_000;

function changed() {
  window.dispatchEvent(new Event(CHANGED));
}

export function onOutboxChanged(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export async function outboxFor(userId: string): Promise<OutboxItem[]> {
  const all = await outboxStore.all<OutboxItem>();
  return all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addToOutbox(item: OutboxItem) {
  await outboxStore.put(item);
  changed();
}

export async function removeFromOutbox(id: string) {
  await outboxStore.delete(id);
  changed();
}

// Clears sent forms the office's data now shows, or that are a few days old.
export async function pruneSent(userId: string, knownIds: Set<string>) {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  for (const item of await outboxFor(userId)) {
    if (item.status === "sent" && (knownIds.has(item.id) || item.createdAt < cutoff)) {
      await outboxStore.delete(item.id);
    }
  }
  changed();
}

export type SendResult = "sent" | "offline" | "signed_out";
let sending: Promise<SendResult> | null = null;

// Sends this person's waiting forms, oldest first. Stops at the first sign
// of no signal and leaves the rest waiting. A form the office's data no
// longer allows is marked failed with the reason, so it stops retrying.
export function sendWaiting(userId: string): Promise<SendResult> {
  sending ??= (async () => {
    try {
      for (const item of await outboxFor(userId)) {
        if (item.status !== "waiting") continue;
        let res: Response;
        try {
          res = await fetch(`/api/outbox/${item.kind}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, employeeId: item.employeeId, ...item.payload }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          });
        } catch {
          return "offline";
        }
        if (res.ok) {
          await outboxStore.put({ ...item, status: "sent" });
        } else if (res.status === 401) {
          return "signed_out";
        } else if (res.status === 422) {
          const { code } = await res.json().catch(() => ({ code: "" }));
          await outboxStore.put({ ...item, status: "failed", error: String(code) });
        } else {
          // Server trouble or a different person signed in: try again later.
          return "offline";
        }
      }
      return "sent";
    } finally {
      sending = null;
      changed();
    }
  })();
  return sending;
}

// The last copy of the worker's job and lists this phone got from the server.
export const snapshots = {
  get: (userId: string) => kv.get<WorkerSnapshot>(`snapshot:${userId}`),
  set: (s: WorkerSnapshot) => kv.set(`snapshot:${s.userId}`, s),
  clear: (userId: string) => kv.delete(`snapshot:${userId}`),
};
