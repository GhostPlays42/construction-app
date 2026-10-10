import { needsAppCode } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// A worker's phone signs up for app notifications (POST) or stops them when
// they sign out (DELETE). 200 done, 401 not signed in, 422 not a usable
// subscription, 500 try again later.
async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsAppCode(supabase, user.id))) return null;
  return supabase;
}

async function body(request: Request): Promise<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return Response.json({ code: "signed_out" }, { status: 401 });
  const { endpoint, keys } = await body(request);
  if (typeof endpoint !== "string" || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return Response.json({ code: "bad_subscription" }, { status: 422 });
  }
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) {
    const code = error.message === "bad_subscription" || error.message === "no_access" ? error.message : "server_error";
    return Response.json({ code }, { status: code === "server_error" ? 500 : 422 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return Response.json({ code: "signed_out" }, { status: 401 });
  const { endpoint } = await body(request);
  if (typeof endpoint !== "string") return Response.json({ code: "bad_subscription" }, { status: 422 });
  const { error } = await supabase.rpc("remove_push_subscriptions", { p_endpoints: [endpoint] });
  if (error) return Response.json({ code: "server_error" }, { status: 500 });
  return Response.json({ ok: true });
}
