"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  checkForm,
  FREQUENCIES,
  isPick,
  MAX_QUESTIONS,
  QUESTION_TYPES,
  tidyQuestions,
  type Frequency,
  type Question,
  type QuestionType,
} from "@/lib/forms";
import { saveForm, type FormInput } from "./actions";

const input =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const box = "h-6 w-6 flex-none accent-amber-500";
const row =
  "flex items-center gap-3 rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg has-[:checked]:border-amber-500 dark:border-zinc-800";
const small =
  "rounded-lg border-2 border-zinc-300 px-3 py-2 text-base active:bg-zinc-100 disabled:opacity-30 dark:border-zinc-700 dark:active:bg-zinc-900";

type Job = { id: string; name: string; status: string };

// While editing, a pick question's choices are the text box's lines.
type Draft = Omit<Question, "options"> & { choices: string };

const toDraft = (q: Question): Draft => ({
  id: q.id,
  type: q.type,
  label: q.label,
  required: q.required,
  choices: (q.options ?? []).join("\n"),
});
const fromDraft = ({ choices, ...q }: Draft): Question => ({ ...q, options: choices.split("\n") });
const newQuestion = (): Draft => ({ id: crypto.randomUUID(), type: "short", label: "", required: false, choices: "" });

export function FormEditor({
  formId,
  initial,
  jobs,
  version,
  sentOnVersion,
}: {
  formId: string | null;
  initial: FormInput;
  jobs: Job[];
  // The latest version (0 for a new form), and how many answers were sent on it.
  version: number;
  sentOnVersion: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [inReport, setInReport] = useState(initial.inDailyReport);
  const [supervisorsOnly, setSupervisorsOnly] = useState(initial.supervisorsOnly);
  const [allJobs, setAllJobs] = useState(initial.allJobs);
  const [jobIds, setJobIds] = useState(new Set(initial.jobIds));
  const [questions, setQuestions] = useState<Draft[]>(
    initial.questions.length ? initial.questions.map(toDraft) : [newQuestion()],
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const current: FormInput = {
    name: name.trim(),
    frequency,
    inDailyReport: inReport,
    allJobs,
    supervisorsOnly,
    jobIds: [...jobIds].sort(),
    questions: questions.map(fromDraft),
  };
  // What's on the server now, to tell whether there are changes.
  const [base, setBase] = useState(() => ({ ...initial, jobIds: [...initial.jobIds].sort() }));
  const same = (a: FormInput, b: FormInput) =>
    JSON.stringify({ ...a, questions: tidyQuestions(a.questions) }) ===
    JSON.stringify({ ...b, questions: tidyQuestions(b.questions) });
  const dirty = !same(current, base);
  const questionsChanged =
    JSON.stringify(tidyQuestions(current.questions)) !== JSON.stringify(tidyQuestions(base.questions));

  // Ask before leaving with changes not saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id: string, change: Partial<Draft>) => {
    setSaved(false);
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...change } : q)));
  };
  const move = (from: number, to: number) => {
    setSaved(false);
    setQuestions((list) => {
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  async function save() {
    const problem = checkForm(name, current.questions);
    if (problem) return setError(problem);
    if (!allJobs && jobIds.size === 0 && !confirm("This form isn't on any job yet, so no one will see it. Save anyway?")) {
      return;
    }
    setError("");
    setPending(true);
    const result = await saveForm(formId, current).catch(() => ({ error: "Something went wrong. Check your connection and try again.", id: undefined }));
    setPending(false);
    if (result.error || !result.id) return setError(result.error ?? "Something went wrong. Try again.");
    setBase(current);
    if (!formId) {
      router.replace(`/admin/forms/${result.id}?saved=1`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">Name</legend>
        <input
          aria-label="Form name"
          placeholder="Like Equipment inspection"
          value={name}
          maxLength={100}
          onChange={(e) => {
            setSaved(false);
            setName(e.target.value);
          }}
          className={input}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">How often</legend>
        {FREQUENCIES.map((f) => (
          <label key={f.value} className={row}>
            <input
              type="radio"
              name="frequency"
              className={box}
              checked={frequency === f.value}
              onChange={() => {
                setSaved(false);
                setFrequency(f.value);
              }}
            />
            <span>
              {f.label}
              <span className="block text-base text-zinc-600 dark:text-zinc-400">{f.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">Daily report</legend>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={inReport}
            onChange={(e) => {
              setSaved(false);
              setInReport(e.target.checked);
            }}
          />
          <span>
            Put it in the daily report
            <span className="block text-base text-zinc-600 dark:text-zinc-400">
              It gets its own section.
              {frequency === "once_daily" && " A day it isn't sent shows as missing."}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">Who fills it in</legend>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={supervisorsOnly}
            onChange={(e) => {
              setSaved(false);
              setSupervisorsOnly(e.target.checked);
            }}
          />
          <span>
            Supervisors only
            <span className="block text-base text-zinc-600 dark:text-zinc-400">
              Other workers don&apos;t see it. Make someone a supervisor in People.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">Jobs it&apos;s used on</legend>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={allJobs}
            onChange={(e) => {
              setSaved(false);
              setAllJobs(e.target.checked);
            }}
          />
          <span>
            All jobs
            <span className="block text-base text-zinc-600 dark:text-zinc-400">Including jobs you add later.</span>
          </span>
        </label>
        {!allJobs &&
          (jobs.length === 0 ? (
            <p className="text-lg text-zinc-600 dark:text-zinc-400">No jobs yet.</p>
          ) : (
            jobs.map((j) => (
              <label key={j.id} className={row}>
                <input
                  type="checkbox"
                  className={box}
                  checked={jobIds.has(j.id)}
                  onChange={() => {
                    setSaved(false);
                    const next = new Set(jobIds);
                    if (next.has(j.id)) next.delete(j.id);
                    else next.add(j.id);
                    setJobIds(next);
                  }}
                />
                <span>
                  {j.name}
                  {j.status !== "active" && (
                    <span className="text-base text-zinc-600 dark:text-zinc-400"> · {j.status}</span>
                  )}
                </span>
              </label>
            ))
          ))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-xl font-semibold">Questions</legend>
        {version > 0 && (
          <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">
            Version {version}.{" "}
            {questionsChanged
              ? `Saving makes version ${version + 1}.${
                  sentOnVersion > 0
                    ? ` The ${sentOnVersion === 1 ? "form" : `${sentOnVersion} forms`} already sent keep the questions they were answered against.`
                    : ""
                }`
              : "Changing the questions makes a new version; forms already sent keep theirs."}
          </p>
        )}
        {questions.map((q, i) => {
          const n = i + 1;
          return (
            <div key={q.id} className="flex flex-col gap-3 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">Question {n}</span>
                <select
                  aria-label={`Type of question ${n}`}
                  value={q.type}
                  onChange={(e) => update(q.id, { type: e.target.value as QuestionType })}
                  className={`${input} w-auto`}
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                aria-label={`Question ${n}`}
                placeholder="What to ask, like Tires and tracks OK?"
                value={q.label}
                maxLength={300}
                onChange={(e) => update(q.id, { label: e.target.value })}
                className={input}
              />
              {isPick(q.type) && (
                <label className="flex flex-col gap-1 text-base">
                  Choices, one per line
                  <textarea
                    aria-label={`Choices for question ${n}`}
                    rows={4}
                    value={q.choices}
                    placeholder={"Good\nNeeds repair\nNot checked"}
                    onChange={(e) => update(q.id, { choices: e.target.value })}
                    className={input}
                  />
                </label>
              )}
              <label className="flex items-center gap-3 text-lg">
                <input
                  type="checkbox"
                  className={box}
                  checked={q.required}
                  onChange={(e) => update(q.id, { required: e.target.checked })}
                />
                Must be answered
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move question ${n} up`} className={small}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === questions.length - 1}
                  aria-label={`Move question ${n} down`}
                  className={small}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaved(false);
                    setQuestions((list) => list.filter((x) => x.id !== q.id));
                  }}
                  disabled={questions.length === 1}
                  className={`${small} ml-auto`}
                >
                  Remove question {n}
                </button>
              </div>
            </div>
          );
        })}
        {questions.length < MAX_QUESTIONS && (
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setQuestions((list) => [...list, newQuestion()]);
            }}
            className="w-full rounded-xl border-2 border-dashed border-amber-500 px-4 py-4 text-xl font-semibold active:bg-amber-50 dark:active:bg-amber-950"
          >
            Add question
          </button>
        )}
      </fieldset>

      <div className="sticky bottom-0 flex flex-col gap-3 bg-white py-3 dark:bg-black">
        {error && !pending && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-lg text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        {saved && !dirty && !pending && (
          <p role="status" className="text-lg text-green-700 dark:text-green-400">
            ✓ Saved
          </p>
        )}
        <button
          type="submit"
          disabled={pending || (!dirty && !!formId)}
          className="w-full rounded-xl bg-amber-500 px-4 py-4 text-xl font-bold text-black active:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : formId ? "Save changes" : "Save form"}
        </button>
      </div>
    </form>
  );
}
