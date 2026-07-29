import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { z } from "zod";

import { MobileAPIError, mobileResponse, withMobileRoute } from "@/lib/mobile/api";

const schema = z.object({ refreshToken: z.string().min(20).max(4_000) }).strict();

export async function POST(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MobileAPIError(401, "AUTH_EXPIRED", "Sign in again.");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.auth.refreshSession({ refresh_token: parsed.data.refreshToken });
    if (error || !data.session || !data.user) throw new MobileAPIError(401, "AUTH_EXPIRED", "Sign in again.");
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-auth-v1", accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: new Date(data.session.expires_at! * 1000).toISOString(), accountId: data.user.id,
    });
  });
}
