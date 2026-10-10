"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHAT_COLUMNS, CHAT_PAGE, chatMessage, chatPhotoPath, MAX_CHAT_LENGTH, type ChatMessage } from "@/lib/chat";
import { formatDate, formatTime, TIME_ZONE } from "@/lib/dates";
import { shrinkPhoto } from "@/lib/offline/site-photo-rules";
import { createClient } from "@/lib/supabase/client";

type Me = { employeeId: string; companyId: string; admin: boolean };
// A message from this phone that hasn't reached the office yet.
type Outgoing = { id: string; body: string; photo: Blob | null; preview: string | null; state: "sending" | "failed"; error?: string };

const muted = "text-zinc-600 dark:text-zinc-400";
const LINK_SECONDS = 60 * 60;

// The day a timestamp falls on, in the company's time zone.
const dayOf = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(ts));

function newId() {
  return crypto.randomUUID();
}

// A job's chat: earlier messages, new ones as they arrive, and a box to send.
export function ChatRoom({
  job,
  me,
  canPost,
  initial,
  back,
}: {
  job: { id: string; name: string; job_number: string | null };
  me: Me;
  canPost: boolean;
  initial: ChatMessage[] | null;
  back: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initial ?? []);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(initial ? null : "Couldn't load the chat. Refresh to try again.");
  const [live, setLive] = useState(true);
  const listEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Adds or updates messages, keeping them in time order.
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    setOutgoing((current) => current.filter((o) => !incoming.some((m) => m.id === o.id)));
  }, []);

  // Fetches anything newer than what's on screen, after a lost connection.
  const latest = useRef<string | null>(null);
  useEffect(() => {
    latest.current = messages.at(-1)?.created_at ?? null;
  }, [messages]);
  const catchUp = useCallback(async () => {
    let query = supabase.from("chat_messages").select(CHAT_COLUMNS).eq("job_id", job.id).order("created_at");
    if (latest.current) query = query.gte("created_at", latest.current);
    const { data } = await query.limit(200);
    if (data) merge(data as ChatMessage[]);
  }, [supabase, job.id, merge]);

  // New and changed messages, as they happen.
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${job.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `job_id=eq.${job.id}` },
        (payload) => {
          if (payload.new && "id" in payload.new) merge([payload.new as ChatMessage]);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive(true);
          catchUp();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive(false);
        }
      });
    const back = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", back);
      supabase.removeChannel(channel);
    };
  }, [supabase, job.id, merge, catchUp]);

  // Viewable links for photos on screen.
  useEffect(() => {
    const missing = messages.map((m) => m.photo_path).filter((p): p is string => !!p && !photoUrls[p]);
    if (!missing.length) return;
    supabase.storage
      .from("chat-photos")
      .createSignedUrls(missing, LINK_SECONDS)
      .then(({ data }) => {
        const found: Record<string, string> = {};
        for (const l of data ?? []) if (l.path && l.signedUrl) found[l.path] = l.signedUrl;
        if (Object.keys(found).length) setPhotoUrls((u) => ({ ...u, ...found }));
      });
  }, [supabase, messages, photoUrls]);

  // Keeps the newest message in view, and marks the chat as read.
  const count = messages.length + outgoing.length;
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
    if (document.visibilityState === "visible") {
      supabase.rpc("mark_chat_read", { p_job_id: job.id }).then(() => {});
    }
  }, [supabase, job.id, count]);

  const deliver = useCallback(
    async (o: Outgoing) => {
      const fail = (code: string) =>
        setOutgoing((cur) => cur.map((x) => (x.id === o.id ? { ...x, state: "failed", error: chatMessage(code) } : x)));
      setOutgoing((cur) => cur.map((x) => (x.id === o.id ? { ...x, state: "sending", error: undefined } : x)));
      if (!navigator.onLine) return fail("offline");
      try {
        if (o.photo) {
          const { error } = await supabase.storage
            .from("chat-photos")
            .upload(chatPhotoPath(me.companyId, job.id, o.id), o.photo, { contentType: "image/jpeg", upsert: false });
          if (error && !/already exists|duplicate/i.test(error.message)) return fail("photo_missing");
        }
        const res = await fetch(`/api/chat/${job.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: o.id, body: o.body, photo: !!o.photo }),
        });
        if (res.status === 401) return fail("no_access");
        if (!res.ok) return fail(((await res.json().catch(() => ({}))) as { code?: string }).code ?? "");
        // Show it now; the live update may also bring it.
        const { data } = await supabase.from("chat_messages").select(CHAT_COLUMNS).eq("id", o.id).maybeSingle();
        if (data) merge([data as ChatMessage]);
        else setOutgoing((cur) => cur.filter((x) => x.id !== o.id));
      } catch {
        fail("offline");
      }
    },
    [supabase, me.companyId, job.id, merge],
  );

  const send = () => {
    const body = text.trim();
    if (!body && !photo) return;
    if (body.length > MAX_CHAT_LENGTH) return setNotice(chatMessage("too_long"));
    const o: Outgoing = { id: newId(), body, photo: photo?.blob ?? null, preview: photo?.preview ?? null, state: "sending" };
    setOutgoing((cur) => [...cur, o]);
    setText("");
    setPhoto(null);
    setNotice(null);
    deliver(o);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await shrinkPhoto(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setNotice("That photo couldn't be used. Try another.");
    }
  };

  const remove = async (m: ChatMessage) => {
    if (!confirm("Remove this message for everyone? This can't be undone.")) return;
    const { error } = await supabase.rpc("remove_chat_message", { p_id: m.id });
    if (error) return setNotice(chatMessage(error.message));
    merge([{ ...m, body: null, photo_path: null, removed_at: new Date().toISOString() }]);
  };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b-2 border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{job.name}</h1>
          <p className={`text-base ${muted}`}>Job chat{live ? "" : " · reconnecting…"}</p>
        </div>
        {/* A plain link, so the phone's copy of home opens without signal. */}
        <a href={back} className={`shrink-0 text-base underline ${muted}`}>
          Back
        </a>
      </header>

      <section aria-label="Messages" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {(initial?.length ?? 0) >= CHAT_PAGE && (
          <p className={`self-center text-base ${muted}`}>Showing the latest {CHAT_PAGE} messages.</p>
        )}
        {messages.length === 0 && outgoing.length === 0 && (
          <p className={`text-lg ${muted}`}>No messages yet. Everyone on this job and the office can see what&apos;s posted here.</p>
        )}
        {messages.map((m, i) => {
          const day = dayOf(m.created_at);
          const showDay = i === 0 || dayOf(messages[i - 1].created_at) !== day;
          const mine = m.employee_id === me.employeeId;
          return (
            <div key={m.id} className="flex flex-col gap-1">
              {showDay && <p className={`self-center text-base ${muted}`}>{formatDate(day)}</p>}
              <article
                className={`flex max-w-[85%] flex-col gap-1 rounded-2xl px-4 py-2 ${
                  mine ? "self-end bg-amber-100 dark:bg-amber-950" : "self-start bg-zinc-100 dark:bg-zinc-900"
                }`}
              >
                <p className={`text-sm font-semibold ${muted}`}>
                  {mine ? "You" : m.sender_name} · {formatTime(m.created_at)}
                </p>
                {m.removed_at ? (
                  <p className={`text-lg italic ${muted}`}>Message removed by the office</p>
                ) : (
                  <>
                    {m.photo_path &&
                      (photoUrls[m.photo_path] ? (
                        <a href={photoUrls[m.photo_path]} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
                          <img src={photoUrls[m.photo_path]} alt={`Photo from ${m.sender_name}`} className="max-h-80 rounded-lg" />
                        </a>
                      ) : (
                        <p className={`text-base ${muted}`}>Loading photo…</p>
                      ))}
                    {m.body && <p className="whitespace-pre-line break-words text-lg">{m.body}</p>}
                  </>
                )}
                {me.admin && !m.removed_at && (
                  <button type="button" onClick={() => remove(m)} className={`self-start text-sm underline ${muted}`}>
                    Remove
                  </button>
                )}
              </article>
            </div>
          );
        })}
        {outgoing.map((o) => (
          <article key={o.id} className="flex max-w-[85%] flex-col gap-1 self-end rounded-2xl bg-amber-50 px-4 py-2 dark:bg-amber-950/50">
            {o.preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a photo on this phone
              <img src={o.preview} alt="Your photo" className="max-h-80 rounded-lg opacity-70" />
            )}
            {o.body && <p className="whitespace-pre-line break-words text-lg">{o.body}</p>}
            {o.state === "sending" ? (
              <p className={`text-sm ${muted}`}>Sending…</p>
            ) : (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                Not sent. {o.error}{" "}
                <button type="button" onClick={() => deliver(o)} className="font-semibold underline">
                  Try again
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setOutgoing((cur) => cur.filter((x) => x.id !== o.id))}
                  className="underline"
                >
                  Delete
                </button>
              </p>
            )}
          </article>
        ))}
        <div ref={listEnd} />
      </section>

      {notice && (
        <p role="alert" className="px-4 pb-2 text-base text-red-700 dark:text-red-300">
          {notice}
        </p>
      )}
      {canPost ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex flex-col gap-2 border-t-2 border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          {photo && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a photo on this phone */}
              <img src={photo.preview} alt="Photo to send" className="h-16 w-16 rounded-lg object-cover" />
              <button type="button" onClick={() => setPhoto(null)} className="text-base underline">
                Remove photo
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Add a photo"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Add a photo"
              className="rounded-xl border-2 border-zinc-300 px-3 py-3 text-xl dark:border-zinc-700"
            >
              📷
            </button>
            <label htmlFor="message" className="sr-only">
              Message
            </label>
            <textarea
              id="message"
              rows={1}
              value={text}
              maxLength={MAX_CHAT_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message"
              className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={!text.trim() && !photo}
              className="rounded-xl bg-amber-500 px-4 py-3 text-lg font-semibold text-black active:bg-amber-600 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <p className={`border-t-2 border-zinc-200 px-4 py-3 text-base dark:border-zinc-800 ${muted}`}>
          This job isn&apos;t active, so the chat is read-only.
        </p>
      )}
    </main>
  );
}
