import { needsAppCode } from "@/lib/auth";
import { SLIP_MESSAGES } from "@/lib/offline/slip-rules";
import { createClient } from "@/lib/supabase/server";

// Receives a trucking slip a worker's phone saved, possibly hours ago with
// no signal. The phone has already put the photo in storage. The database
// checks it and saves it once, however often it's sent. Reading the photo
// happens next, when the worker opens the slip to check it.
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

  let body: { id: string; employeeId: string; jobId: string; filledAt: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "missing_id" }, { status: 422 });
  }

  const { data: me } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle();
  if (!me) return Response.json({ code: "no_access" }, { status: 422 });
  if (me.id !== body.employeeId) return Response.json({ code: "wrong_person" }, { status: 409 });

  const { error } = await supabase.rpc("submit_trucking_slip", {
    p_id: body.id,
    p_job_id: body.jobId,
    p_filled_at: body.filledAt,
  });

  if (!error) return Response.json({ ok: true });
  if (error.message in SLIP_MESSAGES) return Response.json({ code: error.message }, { status: 422 });
  if (error.code === "22P02") return Response.json({ code: "missing_id" }, { status: 422 });
  return Response.json({ code: "server_error" }, { status: 500 });
}
