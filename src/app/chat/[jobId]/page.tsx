import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { needsAppCode } from "@/lib/auth";
import { CHAT_COLUMNS, CHAT_PAGE, type ChatMessage } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "./chat-room";

export const metadata: Metadata = { title: "Job chat" };

// A job's chat, for its crew and the office.
export default async function ChatPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsAppCode(supabase, user.id)) redirect("/verify");

  const [{ data: me }, { data: job }, { data: messages, error }] = await Promise.all([
    supabase.from("employees").select("id, company_id, roles(is_admin)").eq("user_id", user.id).maybeSingle(),
    // Row level security only returns jobs this person can see.
    supabase.from("jobs").select("id, name, job_number, status").eq("id", jobId).maybeSingle(),
    supabase
      .from("chat_messages")
      .select(CHAT_COLUMNS)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE),
  ]);
  if (!me) redirect("/");
  if (!job) notFound();
  const admin = me.roles?.is_admin === true;

  return (
    <ChatRoom
      job={job}
      me={{ employeeId: me.id, companyId: me.company_id, admin }}
      // The page can only post on active jobs, except for the office.
      canPost={admin || job.status === "active"}
      initial={error ? null : ((messages ?? []) as ChatMessage[]).reverse()}
      back={admin ? `/admin/jobs/${job.id}` : "/"}
    />
  );
}
