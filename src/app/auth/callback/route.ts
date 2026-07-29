import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/auth/returnTo";

/**
 * OAuth / magic-link callback. Supabase redirects here with a `code` that we
 * exchange for a session cookie, then forward the user on.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeReturnTo(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
