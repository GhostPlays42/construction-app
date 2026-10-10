import { needsAppCode } from "@/lib/auth";
import { SITE_PHOTO_MESSAGES } from "@/lib/offline/site-photo-rules";
import { createClient } from "@/lib/supabase/server";

// Receives site photos & notes a worker's phone saved, possibly hours ago
// with no signal. The phone has already put the photos in storage; this
// says which they are. The database checks it and saves it once, however
// often it's sent.
//
// 200 saved (or already saved), 401 not signed in, 409 a different person is
// signed in on this phone, 422 the office's data won't allow it (with a
// code), 500 try again later.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsAppCode(supabase, user.id))) {
    return Response.json({ code: "signed_out" }, { status: 401 });
  }

  let body: {
    id: string;
    employeeId: string;
    jobId: string;
    notes: string;
    filledAt: string;
    photos: { id: string; cost_code_id: string | null; caption: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "missing_id" }, { status: 422 });
  }

  const { data: me } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return Response.json({ code: "no_access" }, { status: 422 });
  if (me.id !== body.employeeId) return Response.json({ code: "wrong_person" }, { status: 409 });

  const { error } = await supabase.rpc("submit_site_entry", {
    p_id: body.id,
    p_job_id: body.jobId,
    p_notes: body.notes ?? "",
    p_photos: body.photos ?? [],
    p_filled_at: body.filledAt,
  });

  if (!error) return Response.json({ ok: true });
  if (error.message in SITE_PHOTO_MESSAGES) return Response.json({ code: error.message }, { status: 422 });
  // A badly formed id or list item can never succeed, so don't retry it.
  if (error.code === "22P02") return Response.json({ code: "missing_id" }, { status: 422 });
  return Response.json({ code: "server_error" }, { status: 500 });
}
