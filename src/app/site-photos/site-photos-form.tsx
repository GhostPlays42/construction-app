"use client";

import { useEffect, useRef, useState } from "react";
import { addToOutbox, sendWaiting } from "@/lib/offline/outbox";
import { checkSitePhotos, MAX_PHOTOS, shrinkPhoto, sitePhotoMessage } from "@/lib/offline/site-photo-rules";
import type { SitePhotosPayload, WorkerSnapshot } from "@/lib/offline/types";

const text =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const small = "rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700";
// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 8000;

type Photo = { id: string; blob: Blob; url: string; costCodeId: string; caption: string };

export function SitePhotosForm({
  snapshot,
  job,
  today,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Let go of the photo previews when leaving the screen.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const update = (id: string, change: Partial<Photo>) =>
    setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const chosen = [...files].slice(0, room);
    setAdding(true);
    setError("");
    const added: Photo[] = [];
    let unreadable = 0;
    for (const file of chosen) {
      try {
        const blob = await shrinkPhoto(file);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        added.push({ id: crypto.randomUUID(), blob, url, costCodeId: "", caption: "" });
      } catch {
        unreadable++;
      }
    }
    setPhotos((list) => [...list, ...added]);
    setAdding(false);
    if (unreadable) setError("A photo couldn't be read. Try taking it again.");
    else if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos at a time. Send these, then add the rest.`);
  }

  // Saved on the phone first, then sent. With no signal it waits on the
  // phone and home shows it as waiting to send.
  async function submit() {
    if (!snapshot.companyId) {
      return setError("Open the app once with signal, then try again.");
    }
    const payload: SitePhotosPayload = {
      jobId: job.id,
      jobName: job.name,
      companyId: snapshot.companyId,
      workDate: today,
      filledAt: new Date().toISOString(),
      notes: notes.trim(),
      photos: photos.map((p) => ({
        id: p.id,
        blob: p.blob,
        costCodeId: p.costCodeId || null,
        caption: p.caption.trim(),
      })),
    };
    const problem = checkSitePhotos(payload);
    if (problem) return setError(sitePhotoMessage(problem));

    setError("");
    setPending(true);
    try {
      await addToOutbox({
        id: crypto.randomUUID(),
        kind: "site-photos",
        userId: snapshot.userId,
        employeeId: snapshot.employeeId,
        createdAt: new Date().toISOString(),
        status: "waiting",
        payload,
      });
    } catch {
      setPending(false);
      return setError("Couldn't save on this phone. Check it has free space and try again.");
    }
    await Promise.race([
      sendWaiting(snapshot.userId).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, SEND_WAIT_MS)),
    ]);
    // A full page load, so the phone's copy of home opens with no signal.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">1. Photos</legend>
        {photos.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-3 dark:border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone, not a page image */}
            <img src={p.url} alt={`Photo ${i + 1}`} className="w-full rounded-lg" />
            <select
              aria-label={`Cost code for photo ${i + 1}`}
              value={p.costCodeId}
              onChange={(e) => update(p.id, { costCodeId: e.target.value })}
              className={text}
            >
              <option value="">Cost code (optional)</option>
              {snapshot.lists.codes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Caption for photo ${i + 1}`}
              placeholder="Caption (optional)"
              value={p.caption}
              maxLength={300}
              onChange={(e) => update(p.id, { caption: e.target.value })}
              className={text}
            />
            <button
              type="button"
              onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
              className={`${small} self-start`}
            >
              Remove photo
            </button>
          </div>
        ))}
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Choose photos"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            disabled={adding}
            onClick={() => picker.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-amber-500 px-4 py-5 text-xl font-semibold active:bg-amber-50 disabled:opacity-50 dark:active:bg-amber-950"
          >
            {adding ? "Adding…" : photos.length ? "Add more photos" : "Take or add photos"}
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">2. Notes</legend>
        <textarea
          aria-label="Notes"
          rows={5}
          maxLength={4000}
          placeholder="Work done, delays, weather, issues"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={text}
        />
      </fieldset>

      <div className="flex flex-col gap-3">
        {error && !pending && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || adding}
          className="w-full rounded-xl bg-amber-500 px-4 py-5 text-2xl font-bold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send photos & notes"}
        </button>
      </div>
    </form>
  );
}
