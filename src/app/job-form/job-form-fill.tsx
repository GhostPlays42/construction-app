"use client";

import { useEffect, useRef, useState } from "react";
import { SignaturePad } from "@/app/flha/signature-pad";
import { isBlank, MAX_FORM_PHOTOS, SHORT_MAX, LONG_MAX, type Answer, type Answers, type Question } from "@/lib/forms";
import { addToOutbox, sendWaiting } from "@/lib/offline/outbox";
import { answerMessage, checkAnswers } from "@/lib/offline/form-rules";
import { shrinkPhoto } from "@/lib/offline/site-photo-rules";
import type { JobFormCopy, JobFormPayload, WorkerSnapshot } from "@/lib/offline/types";

const box = "h-7 w-7 flex-none accent-amber-500";
const row =
  "flex items-center gap-3 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg has-[:checked]:border-amber-500 dark:border-zinc-800";
const text =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const small = "rounded-lg border-2 border-zinc-300 px-3 py-2 text-base dark:border-zinc-700";
// How long to try sending before going home anyway; home keeps trying.
const SEND_WAIT_MS = 4000;
const PHOTO_SEND_WAIT_MS = 8000;

type Photo = { id: string; blob: Blob; url: string };

export function JobFormFill({
  snapshot,
  job,
  today,
  form,
}: {
  snapshot: WorkerSnapshot;
  job: WorkerSnapshot["jobs"][number];
  today: string;
  form: JobFormCopy;
}) {
  // Everything as typed; numbers are read when sending.
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Let go of the photo previews when leaving the screen.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const set = (id: string, value: Answer) => setAnswers((a) => ({ ...a, [id]: value }));

  async function addPhotos(questionId: string, files: FileList | null) {
    if (!files?.length) return;
    const have = photos[questionId] ?? [];
    const room = MAX_FORM_PHOTOS - have.length;
    setAdding(questionId);
    setError("");
    const added: Photo[] = [];
    let unreadable = 0;
    for (const file of [...files].slice(0, room)) {
      try {
        const blob = await shrinkPhoto(file);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        added.push({ id: crypto.randomUUID(), blob, url });
      } catch {
        unreadable++;
      }
    }
    setPhotos((p) => ({ ...p, [questionId]: [...(p[questionId] ?? []), ...added] }));
    setAdding(null);
    if (unreadable) setError("A photo couldn't be read. Try taking it again.");
    else if (files.length > room) setError(`Up to ${MAX_FORM_PHOTOS} photos for each question.`);
  }

  // The answers as they're sent: words trimmed, numbers read, photos by id,
  // and nothing for questions left blank.
  function collect(): Answers {
    const out: Answers = {};
    for (const q of form.questions) {
      let a: Answer | undefined = answers[q.id];
      if (q.type === "photo") a = (photos[q.id] ?? []).map((p) => p.id);
      else if (q.type === "number" && typeof a === "string" && a.trim()) {
        const n = Number(a.trim().replace(",", "."));
        a = Number.isFinite(n) ? n : a;
      } else if (typeof a === "string") a = a.trim();
      if (!isBlank(a)) out[q.id] = a!;
    }
    return out;
  }

  // Saved on the phone first, then sent. With no signal it waits on the
  // phone and home shows it as waiting to send.
  async function submit() {
    if (!snapshot.companyId) return setError("Open the app once with signal, then try again.");
    const sent = collect();
    const problem = checkAnswers(form.questions, sent);
    if (problem) {
      setError(answerMessage(problem, form.questions));
      document.getElementById(`question-${problem.index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const payload: JobFormPayload = {
      jobId: job.id,
      jobName: job.name,
      companyId: snapshot.companyId,
      workDate: today,
      filledAt: new Date().toISOString(),
      formId: form.form_id,
      formName: form.name,
      versionId: form.version_id,
      answers: sent,
      photos: form.questions.flatMap((q) =>
        q.type === "photo" ? (photos[q.id] ?? []).map((p) => ({ id: p.id, blob: p.blob })) : [],
      ),
    };

    setError("");
    setPending(true);
    try {
      await addToOutbox({
        id: crypto.randomUUID(),
        kind: "job-form",
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
      new Promise((resolve) => setTimeout(resolve, payload.photos.length ? PHOTO_SEND_WAIT_MS : SEND_WAIT_MS)),
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
      {form.questions.map((q, i) => (
        <fieldset key={q.id} id={`question-${i}`} className="flex flex-col gap-3">
          <legend className="mb-1 text-xl font-semibold">
            {i + 1}. {q.label}
            {!q.required && <span className="font-normal text-zinc-600 dark:text-zinc-400"> (optional)</span>}
          </legend>
          <QuestionInput
            question={q}
            value={answers[q.id]}
            onChange={(v) => set(q.id, v)}
            photos={photos[q.id] ?? []}
            adding={adding === q.id}
            onAddPhotos={(files) => addPhotos(q.id, files)}
            onRemovePhoto={(id) => setPhotos((p) => ({ ...p, [q.id]: (p[q.id] ?? []).filter((x) => x.id !== id) }))}
          />
        </fieldset>
      ))}

      <div className="flex flex-col gap-3">
        {error && !pending && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || adding !== null}
          className="w-full rounded-xl bg-amber-500 px-4 py-5 text-2xl font-bold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Sending…" : `Send ${form.name}`}
        </button>
      </div>
    </form>
  );
}

function QuestionInput({
  question: q,
  value,
  onChange,
  photos,
  adding,
  onAddPhotos,
  onRemovePhoto,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
  photos: Photo[];
  adding: boolean;
  onAddPhotos: (files: FileList | null) => void;
  onRemovePhoto: (id: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const label = q.label;

  switch (q.type) {
    case "short":
      return (
        <input aria-label={label} value={String(value ?? "")} maxLength={SHORT_MAX} onChange={(e) => onChange(e.target.value)} className={text} />
      );
    case "long":
      return (
        <textarea
          aria-label={label}
          rows={4}
          value={String(value ?? "")}
          maxLength={LONG_MAX}
          onChange={(e) => onChange(e.target.value)}
          className={text}
        />
      );
    case "number":
      return (
        <input
          aria-label={label}
          inputMode="decimal"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={text}
        />
      );
    case "date":
      return <input aria-label={label} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={text} />;
    case "yes_no":
      return (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((yes) => (
            <label key={String(yes)} className={row}>
              <input type="radio" name={q.id} className={box} checked={value === yes} onChange={() => onChange(yes)} />
              <span>{yes ? "Yes" : "No"}</span>
            </label>
          ))}
        </div>
      );
    case "pick_one":
      return (
        <>
          {(q.options ?? []).map((o) => (
            <label key={o} className={row}>
              <input type="radio" name={q.id} className={box} checked={value === o} onChange={() => onChange(o)} />
              <span>{o}</span>
            </label>
          ))}
        </>
      );
    case "pick_many": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <>
          {(q.options ?? []).map((o) => (
            <label key={o} className={row}>
              <input
                type="checkbox"
                className={box}
                checked={picked.includes(o)}
                onChange={() =>
                  // Kept in the order the office listed them.
                  onChange((q.options ?? []).filter((x) => (x === o ? !picked.includes(o) : picked.includes(x))))
                }
              />
              <span>{o}</span>
            </label>
          ))}
        </>
      );
    }
    case "signature":
      return <SignaturePad value={typeof value === "string" ? value : ""} onChange={onChange} />;
    case "photo":
      return (
        <>
          {photos.map((p, n) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 p-3 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone, not a page image */}
              <img src={p.url} alt={`${label}: photo ${n + 1}`} className="w-full rounded-lg" />
              <button type="button" onClick={() => onRemovePhoto(p.id)} className={`${small} self-start`}>
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
            aria-label={`Choose photos: ${label}`}
            onChange={(e) => {
              onAddPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          {photos.length < MAX_FORM_PHOTOS && (
            <button
              type="button"
              disabled={adding}
              onClick={() => picker.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-amber-500 px-4 py-4 text-xl font-semibold active:bg-amber-50 disabled:opacity-50 dark:active:bg-amber-950"
            >
              {adding ? "Adding…" : photos.length ? "Add more photos" : "Take or add photos"}
            </button>
          )}
        </>
      );
  }
}
