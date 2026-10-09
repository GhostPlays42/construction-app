import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

// Where the link in a sign-up email lands. Confirming the email signs the
// person in; for a new company, the database creates it at this moment.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  // The new session's cookies go on the redirect itself, so the next page
  // sees the person signed in.
  const pending: { name: string; value: string; options: object }[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          pending.push(...cookiesToSet);
        },
      },
    },
  );

  // token_hash works in any browser, so the email can be opened on a phone.
  // code is Supabase's default link, which only works in the browser that
  // signed up.
  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  // A relative address keeps the person on the same site they opened.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: error ? "/login/email?link=expired" : "/" },
  });
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
