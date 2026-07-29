import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export async function requireAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "admin";
}

export function safeOperationalReference(id: string, prefix: string): string {
  return `${prefix}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

