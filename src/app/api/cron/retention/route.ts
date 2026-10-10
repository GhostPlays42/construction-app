import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Up to 5 minutes; whatever's left waits for the next night.
export const maxDuration = 300;
const TIME_BUDGET_MS = 240_000;
const BATCH = 100;

// Vercel calls this once a night (vercel.json) with CRON_SECRET. For each
// company with records older than its "Keep records for" setting, it removes
// their photos and PDFs through the Storage API, then deletes the records.
// The database refuses to delete records whose files are still there, so a
// failed night is simply picked up the next.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return Response.json({ code: "not_allowed" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return Response.json({ code: "not_set_up" }, { status: 500 });

  // The secret key passes row level security: server only, never sent to a browser.
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  const { data: companies, error } = await supabase.rpc("retention_companies");
  if (error) return Response.json({ code: "server_error" }, { status: 500 });

  const done: { company: string; files: number; deleted?: unknown; error?: string }[] = [];
  for (const company of companies ?? []) {
    if (outOfTime()) break;
    const result: (typeof done)[number] = { company, files: 0 };
    done.push(result);

    // Files first, in batches, until none are left.
    let last = "";
    while (!result.error) {
      if (outOfTime()) {
        result.error = "out_of_time";
        break;
      }
      const { data: files, error: listError } = await supabase.rpc("retention_files", {
        p_company: company,
        p_limit: BATCH,
      });
      if (listError) {
        result.error = "list_failed";
        break;
      }
      if (!files.length) break;
      // The same file back again means the last removal didn't take.
      const first = `${files[0].bucket}/${files[0].name}`;
      if (first === last) {
        result.error = "remove_failed";
        break;
      }
      last = first;
      for (const bucket of new Set(files.map((f) => f.bucket))) {
        const names = files.filter((f) => f.bucket === bucket).map((f) => f.name);
        const { error: removeError } = await supabase.storage.from(bucket).remove(names);
        if (removeError) {
          result.error = "remove_failed";
          break;
        }
        result.files += names.length;
      }
    }
    if (result.error) continue;

    const { data: deleted, error: deleteError } = await supabase.rpc("retention_delete", { p_company: company });
    if (deleteError) result.error = deleteError.message;
    else result.deleted = deleted;
  }

  const failed = done.filter((d) => d.error);
  if (failed.length) console.error("Record keeping cleanup didn't finish", failed);
  return Response.json({ done }, { status: failed.length ? 500 : 200 });
}
