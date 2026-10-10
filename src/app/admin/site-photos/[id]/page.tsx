import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Site photos & notes" };

// How long the private photo links on this page keep working.
const LINK_SECONDS = 60 * 60;

export default async function SiteEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: entry } = await supabase
    .from("site_entries")
    .select(
      "id, work_date, filled_at, notes, jobs(name, job_number), employees(full_name), site_photos(id, path, code, code_name, caption, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!entry) notFound();

  const photos = [...entry.site_photos].sort((a, b) => a.position - b.position);
  const { data: links } = photos.length
    ? await supabase.storage.from("site-photos").createSignedUrls(
        photos.map((p) => p.path),
        LINK_SECONDS,
      )
    : { data: [] };
  const urlFor = (path: string) => links?.find((l) => l.path === path)?.signedUrl ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Site photos &amp; notes</h1>
        <Link
          href={`/admin/site-photos?date=${entry.work_date}`}
          className="text-base text-zinc-600 underline dark:text-zinc-400"
        >
          Site photos
        </Link>
      </div>
      <div className="-mt-3 text-lg">
        <p className="font-semibold">
          {entry.jobs?.name}
          {entry.jobs?.job_number && (
            <span className="font-normal text-zinc-600 dark:text-zinc-400"> · #{entry.jobs.job_number}</span>
          )}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(entry.work_date)} at {formatTime(entry.filled_at)}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">Sent by {entry.employees?.full_name ?? "Unknown"}</p>
      </div>

      {entry.notes && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Notes</h2>
          <p className="whitespace-pre-line rounded-xl border-2 border-zinc-200 px-4 py-3 text-lg dark:border-zinc-800">
            {entry.notes}
          </p>
        </section>
      )}

      {photos.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Photos ({photos.length})</h2>
          {photos.map((p, i) => {
            const url = urlFor(p.path);
            return (
              <figure key={p.id} className="flex flex-col gap-2">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
                    <img src={url} alt={p.caption ?? `Photo ${i + 1}`} className="w-full rounded-xl" />
                  </a>
                ) : (
                  <p className="rounded-xl bg-zinc-100 p-4 text-lg dark:bg-zinc-900">
                    Couldn&apos;t load this photo. Refresh to try again.
                  </p>
                )}
                {(p.code || p.caption) && (
                  <figcaption className="text-lg">
                    {p.code && (
                      <span className="font-medium">
                        {p.code} {p.code_name}
                      </span>
                    )}
                    {p.code && p.caption && " · "}
                    {p.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </section>
      )}
    </main>
  );
}
