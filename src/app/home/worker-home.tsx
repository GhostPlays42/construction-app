import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { formatDate, todayISO } from "@/lib/dates";
import { mapLink } from "@/lib/maps";
import { pickJob, switchJob } from "./actions";
import { JOB_PICK_COOKIE, pickedJobId } from "./job-pick";

// The forms a worker fills in on a job. They unlock once the FLHA is done.
const FORMS = ["Time card", "Trucking slip", "Site photos"];

const card = "flex flex-col gap-1 rounded-xl border-2 border-zinc-200 p-4 dark:border-zinc-800";

export async function WorkerHome({
  supabase,
  firstName,
  companyName,
  signOutButton,
}: {
  supabase: SupabaseClient<Database>;
  firstName: string;
  companyName: string | undefined;
  signOutButton: React.ReactNode;
}) {
  const today = todayISO();
  // Row level security only returns jobs this worker is assigned to. Until
  // dispatch exists, those active jobs (already started) are "today's jobs".
  const [{ data: jobs, error }, store] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, job_number, address")
      .eq("status", "active")
      .or(`start_date.is.null,start_date.lte.${today}`)
      .order("name"),
    cookies(),
  ]);

  const list = jobs ?? [];
  const picked = pickedJobId(store.get(JOB_PICK_COOKIE)?.value);
  const job = list.length === 1 ? list[0] : list.find((j) => j.id === picked);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{companyName}</p>
        <h1 className="text-3xl font-bold">Hi, {firstName}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{formatDate(today)}</p>
      </div>

      {error ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load your jobs. Refresh to try again.
        </p>
      ) : list.length === 0 ? (
        <div className={card}>
          <h2 className="text-xl font-semibold">You&apos;re not on a job yet</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Your office will add you to one. It will show up here.
          </p>
        </div>
      ) : !job ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Which job are you on today?</h2>
          {list.map((j) => (
            <form key={j.id} action={pickJob.bind(null, j.id)}>
              <button
                type="submit"
                className="flex w-full flex-col items-start gap-1 rounded-xl border-2 border-zinc-300 p-4 text-left active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-900"
              >
                <span className="text-xl font-semibold">{j.name}</span>
                {(j.job_number || j.address) && (
                  <span className="text-base text-zinc-600 dark:text-zinc-400">
                    {[j.job_number && `#${j.job_number}`, j.address].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </form>
          ))}
        </section>
      ) : (
        <>
          <section className={card} aria-label="Today's job">
            <p className="text-base text-zinc-600 dark:text-zinc-400">Today&apos;s job</p>
            <h2 className="text-2xl font-bold">{job.name}</h2>
            {job.job_number && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">#{job.job_number}</p>
            )}
            {job.address && (
              <>
                <p className="text-lg">{job.address}</p>
                <a
                  href={mapLink(job.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-medium text-amber-700 underline dark:text-amber-400"
                >
                  Open in maps
                </a>
              </>
            )}
            {list.length > 1 && (
              <form action={switchJob} className="mt-2">
                <button type="submit" className="text-base text-zinc-600 underline dark:text-zinc-400">
                  Switch job
                </button>
              </form>
            )}
          </section>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-amber-500 px-4 py-5 text-2xl font-bold text-black disabled:opacity-60"
            >
              Start FLHA
            </button>
            <p className="text-center text-base text-zinc-600 dark:text-zinc-400">
              Coming soon. This is the next piece being built.
            </p>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Job forms</h2>
            <p className="-mt-2 text-base text-zinc-600 dark:text-zinc-400">
              These unlock once your FLHA is done.
            </p>
            {FORMS.map((name) => (
              <button
                key={name}
                type="button"
                disabled
                className="flex w-full items-center justify-between rounded-xl border-2 border-zinc-200 px-4 py-4 text-xl text-zinc-500 dark:border-zinc-800"
              >
                <span>{name}</span>
                <span aria-hidden className="text-base">
                  🔒
                </span>
              </button>
            ))}
          </section>
        </>
      )}

      {signOutButton}
    </main>
  );
}
