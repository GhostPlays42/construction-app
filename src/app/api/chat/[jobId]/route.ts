import { needsAppCode } from "@/lib/auth";
import { sendToPhones } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

// Sends a chat message (its photo already uploaded), then notifies everyone
// else in the job's chat. 200 sent (or already sent), 401 not signed in, 422
// refused with a code, 500 try again.
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsAppCode(supabase, user.id))) {
    return Response.json({ code: "signed_out" }, { status: 401 });
  }

  let body: { id?: unknown; body?: unknown; photo?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (typeof body.id !== "string") return Response.json({ code: "missing_id" }, { status: 422 });
  const text = typeof body.body === "string" ? body.body : "";

  const { data: sentAt, error } = await supabase.rpc("send_chat_message", {
    p_id: body.id,
    p_job_id: jobId,
    p_body: text,
    p_photo: body.photo === true,
  });
  if (error) {
    const known = /^[a-z_]+$/.test(error.message);
    return Response.json({ code: known ? error.message : "server_error" }, { status: known ? 422 : 500 });
  }

  // Who to tell. Empty when this message was already announced.
  const { data: phones } = await supabase.rpc("chat_message_targets", { p_id: body.id });
  if (phones?.length) {
    const { data: job } = await supabase.from("jobs").select("name").eq("id", jobId).maybeSingle();
    const { data: me } = await supabase.from("employees").select("full_name").eq("user_id", user.id).maybeSingle();
    const said = text.trim() ? text.trim().slice(0, 120) : "Sent a photo";
    await sendToPhones(supabase, phones, {
      title: job?.name ?? "Job chat",
      body: `${me?.full_name ?? "Someone"}: ${said}`,
      url: `/chat/${jobId}`,
      tag: `chat-${jobId}`,
    });
  }
  return Response.json({ created_at: sentAt });
}
