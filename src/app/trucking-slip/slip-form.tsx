"use client";

import { useEffect, useRef, useState } from "react";
import { addToOutbox, outboxFor, sendWaiting } from "@/lib/offline/outbox";
import { shrinkPhoto } from "@/lib/offline/site-photo-rules";
import { SLIP_LONG_SIDE } from "@/lib/offline/slip-rules";
import type { WorkerSnapshot } from "@/lib/offline/types";

// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 20_000;

export function SlipForm({
  snapshot,
  job,
  today,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
}) {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Let go of the preview when it's replaced or the screen closes.
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  async function add(file: File | undefined) {
    if (!file) return;
    setAdding(true);
    setError("");
    try {
      const blob = await shrinkPhoto(file, SLIP_LONG_SIDE);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("The photo couldn't be read. Try taking it again.");
    }
    setAdding(false);
  }

  // Saved on the phone first, then sent. With signal the app then reads the
  // slip and opens it to check; with none it waits on the phone, and home
  // asks the worker to check it once it's sent.
  async function submit() {
    if (!photo) return setError("Take a photo of the slip first.");
    if (!snapshot.companyId) return setError("Open the app once with signal, then try again.");

    setError("");
    setPending(true);
    const id = crypto.randomUUID();
    try {
      await addToOutbox({
        id,
        kind: "trucking-slip",
        userId: snapshot.userId,
        employeeId: snapshot.employeeId,
        createdAt: new Date().toISOString(),
        status: "waiting",
        payload: {
          jobId: job.id,
          jobName: job.name,
          companyId: snapshot.companyId,
          workDate: today,
          filledAt: new Date().toISOString(),
          photo: { blob: photo.blob },
        },
      });
    } catch {
      setPending(false);
      return setError("Couldn't save on this phone. Check it has free space and try again.");
    }
    await Promise.race([
      sendWaiting(snapshot.userId).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, SEND_WAIT_MS)),
    ]);
    const sent = (await outboxFor(snapshot.userId).catch(() => [])).some((i) => i.id === id && i.status === "sent");
    // A full page load, so the phone's copy of home opens with no signal.
    window.location.href = sent ? `/trucking-slip/${id}` : "/";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <p className="text-lg">
        Take a clear photo of the whole slip. The app reads it for you, then you check what it read.
      </p>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- a photo on this phone, not a page image
        <img src={photo.url} alt="Slip photo" className="w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-800" />
      )}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose slip photo"
        onChange={(e) => {
          add(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={adding || pending}
        onClick={() => picker.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-amber-500 px-4 py-5 text-xl font-semibold active:bg-amber-50 disabled:opacity-50 dark:active:bg-amber-950"
      >
        {adding ? "Adding…" : photo ? "Retake photo" : "Take photo of slip"}
      </button>

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
          {pending ? "Sending…" : "Send slip"}
        </button>
      </div>
    </form>
  );
}
