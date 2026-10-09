import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { loadList } from "../data";
import { isKind, KINDS } from "../kinds";
import { AddItemForm, ItemRow } from "../list-editor";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: isKind(kind) ? KINDS[kind].title : "Lists" };
}

export default async function ListPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isKind(kind)) notFound();
  const config = KINDS[kind];
  const { supabase } = await requireAdmin();
  const { items, failed } = await loadList(supabase, kind);

  const active = items.filter((i) => i.is_active);
  const off = items.filter((i) => !i.is_active);
  const label = (i: (typeof items)[number]) => (i.code ? `${i.code} ${i.name}` : i.name);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{config.title}</h1>
        <Link href="/admin/lists" className="text-base text-zinc-600 underline dark:text-zinc-400">
          Lists
        </Link>
      </div>
      <p className="-mt-3 text-lg text-zinc-600 dark:text-zinc-400">
        {config.hint} Changes show up for crews right away.
      </p>

      <AddItemForm kind={kind} hasCode={config.hasCode} one={config.one} />

      {failed ? (
        <p role="alert" className="text-lg text-red-600 dark:text-red-400">
          Couldn&apos;t load this list. Refresh to try again.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">In use ({active.length})</h2>
            {active.length === 0 && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">Nothing on this list yet.</p>
            )}
            <ul className="flex flex-col gap-3">
              {active.map((item, index) => (
                <ItemRow
                  key={item.id}
                  kind={kind}
                  hasCode={config.hasCode}
                  one={config.one}
                  item={item}
                  label={label(item)}
                  first={index === 0}
                  last={index === active.length - 1}
                />
              ))}
            </ul>
          </section>
          {off.length > 0 && (
            <details>
              <summary className="cursor-pointer text-lg text-zinc-600 dark:text-zinc-400">
                Switched off ({off.length})
              </summary>
              <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
                Crews can&apos;t pick these, but past entries still show them.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {off.map((item) => (
                  <ItemRow
                    key={item.id}
                    kind={kind}
                    hasCode={config.hasCode}
                    one={config.one}
                    item={item}
                    label={label(item)}
                    first
                    last
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
