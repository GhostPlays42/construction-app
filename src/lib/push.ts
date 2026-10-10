import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/lib/supabase/database.types";

// App notifications (web push). The keys are set in Vercel by the platform
// owner; until they are, nothing is sent and the button to turn
// notifications on doesn't show.
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// The public key phones need to sign up for notifications, or null when
// notifications aren't set up.
export function pushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

export type PushMessage = { title: string; body: string; url: string };

// Sends a notification to every phone of the given people. Phones that no
// longer take notifications are forgotten. Returns how many phones it
// reached; never throws.
export async function notify(
  supabase: SupabaseClient<Database>,
  employeeIds: string[],
  message: PushMessage,
): Promise<number> {
  const keys = vapid();
  if (!keys || employeeIds.length === 0) return 0;
  const { data: phones } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("employee_id", employeeIds);
  if (!phones?.length) return 0;

  const payload = JSON.stringify(message);
  const gone: string[] = [];
  let reached = 0;
  await Promise.all(
    phones.map(async (p) => {
      try {
        await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, payload, {
          vapidDetails: keys,
          TTL: 24 * 60 * 60,
          timeout: 10_000,
        });
        reached++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(p.endpoint);
      }
    }),
  );
  if (gone.length) await supabase.rpc("remove_push_subscriptions", { p_endpoints: gone });
  return reached;
}
