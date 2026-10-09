import { needsAppCode } from "@/lib/auth";
import { buildSnapshot } from "@/lib/offline/snapshot";
import { createClient } from "@/lib/supabase/server";

// A worker's phone fetches this whenever it has signal, and keeps the copy.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsAppCode(supabase, user.id))) {
    return Response.json({ code: "signed_out" }, { status: 401 });
  }
  try {
    const snapshot = await buildSnapshot(supabase, user.id);
    if (!snapshot) return Response.json({ code: "no_access" }, { status: 403 });
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ code: "server_error" }, { status: 500 });
  }
}
