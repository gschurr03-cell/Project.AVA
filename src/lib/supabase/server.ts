import { cookies } from "next/headers";

import { createServerClient, type CookieOptions } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Wires Supabase auth into Next.js cookies so the session refreshes correctly.
 * Still uses the anon key — RLS applies. Use {@link createServiceClient} only
 * for trusted server-side jobs that must bypass RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component, which cannot write
            // cookies. Safe to ignore when middleware refreshes the session.
          }
        },
      },
    },
  );
}
