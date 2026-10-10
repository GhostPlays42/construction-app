import { createClient } from "@/lib/supabase/client";
import { formPhotoPath } from "./form-rules";
import { photoPath } from "./site-photo-rules";
import { slipPhotoPath } from "./slip-rules";
import { kv, outboxStore } from "./store";
import type { OutboxItem, WorkerSnapshot } from "./types";

// Forms are saved on the phone first and sent from here, so nothing is lost
// when there's no signal. Screens listen for "outbox-changed" to redraw.

const CHANGED = "outbox-changed";
// A send that takes longer than this is treated as no signal; it retries later.
const SEND_TIMEOUT_MS = 20_000;
// Photos are bigger, so each gets longer.
const PHOTO_TIMEOUT_MS = 90_000;

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

// Whether the office's data already shows this form (this version of it,
// for a form that can be changed).
export function officeHas(snapshot: WorkerSnapshot, item: OutboxItem): boolean {
  if (item.kind === "flha") return snapshot.flhas.some((f) => f.id === item.id);
  if (item.kind === "safety-meeting") return snapshot.safetyMeetings.some((m) => m.id === item.id);
  if (item.kind === "site-photos") return (snapshot.siteEntries ?? []).some((e) => e.id === item.id);
  if (item.kind === "trucking-slip") return (snapshot.truckingSlips ?? []).some((s) => s.id === item.id);
  if (item.kind === "job-form") return (snapshot.formSubmissions ?? []).some((s) => s.id === item.id);
  return snapshot.timeCards.some(
    (c) => c.id === item.id && Date.parse(c.filled_at) >= Date.parse(item.payload.filledAt),
  );
}

// Clears sent forms the office's data now shows, or that are a few days old.
export async function pruneSent(userId: string, snapshot: WorkerSnapshot) {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  for (const item of await outboxFor(userId)) {
    if (item.status === "sent" && (officeHas(snapshot, item) || item.createdAt < cutoff)) {
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
        let body: unknown = { id: item.id, employeeId: item.employeeId, ...item.payload };
        if (item.kind === "site-photos" || item.kind === "trucking-slip" || item.kind === "job-form") {
          // Photos go straight to storage first; the form then says which they are.
          const uploaded = await uploadPhotos(item);
          if (uploaded === "refused") {
            await outboxStore.put({ ...item, status: "failed", error: "upload_refused" });
            continue;
          }
          if (uploaded !== "sent") return uploaded;
          body =
            item.kind === "site-photos"
              ? {
                  ...(body as object),
                  photos: item.payload.photos.map((p) => ({ id: p.id, cost_code_id: p.costCodeId, caption: p.caption })),
                }
              : item.kind === "job-form"
                ? {
                    id: item.id,
                    employeeId: item.employeeId,
                    jobId: item.payload.jobId,
                    versionId: item.payload.versionId,
                    filledAt: item.payload.filledAt,
                    answers: item.payload.answers,
                  }
                : { id: item.id, employeeId: item.employeeId, jobId: item.payload.jobId, filledAt: item.payload.filledAt };
        }
        let res: Response;
        try {
          res = await fetch(`/api/outbox/${item.kind}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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

// Where each photo on a form goes in storage.
type WithPhotos = Extract<OutboxItem, { kind: "site-photos" | "trucking-slip" | "job-form" }>;

function photosOf(item: WithPhotos) {
  if (item.kind === "trucking-slip") {
    return [{ bucket: "slip-photos", path: slipPhotoPath(item.payload.companyId, item.id), photo: item.payload.photo }];
  }
  if (item.kind === "job-form") {
    return item.payload.photos.map((photo) => ({
      bucket: "form-photos",
      path: formPhotoPath(item.payload.companyId, item.id, photo.id),
      photo,
    }));
  }
  return item.payload.photos.map((photo) => ({
    bucket: "site-photos",
    path: photoPath(item.payload.companyId, item.id, photo.id),
    photo,
  }));
}

// Uploads a form's photos that haven't reached storage yet, marking each one
// on the phone as it goes, so a lost signal part way through only resends
// the rest.
async function uploadPhotos(item: WithPhotos): Promise<"sent" | "offline" | "signed_out" | "refused"> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return "signed_out";
  if (data.session.user.id !== item.userId) return "offline";
  for (const { bucket, path, photo } of photosOf(item)) {
    if (photo.uploaded) continue;
    let error: { message: string; statusCode?: string; status?: number } | null;
    try {
      ({ error } = await Promise.race([
        supabase.storage.from(bucket).upload(path, photo.blob, { contentType: "image/jpeg", upsert: false }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), PHOTO_TIMEOUT_MS)),
      ]));
    } catch {
      return "offline";
    }
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    // Already there from an earlier try that lost signal before it heard back.
    const already = status === 409 || /already exists/i.test(error?.message ?? "");
    if (error && !already) {
      const message = error.message ?? "";
      if (status === 401 || /jwt|token/i.test(message)) return "signed_out";
      // Turned away by the storage rules (wrong company, not an image, too
      // big): it will never go, so stop retrying.
      if (/row-level security|mime|size|too large/i.test(message) || status === 413 || status === 415) {
        return "refused";
      }
      return "offline";
    }
    photo.uploaded = true;
    await outboxStore.put(item);
  }
  return "sent";
}

// The last copy of the worker's job and lists this phone got from the server.
export const snapshots = {
  get: (userId: string) => kv.get<WorkerSnapshot>(`snapshot:${userId}`),
  set: (s: WorkerSnapshot) => kv.set(`snapshot:${s.userId}`, s),
  clear: (userId: string) => kv.delete(`snapshot:${userId}`),
};
