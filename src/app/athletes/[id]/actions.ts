"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PROFILE_FIELDS, athleteProfileSchema } from "@/lib/athletes/profile";

/**
 * Update an athlete's physical & performance profile. RLS restricts the update
 * to athletes the signed-in coach owns, so a bad id simply matches no row. The
 * payload is validated (units + reasonable ranges) with Zod before it reaches
 * the DB, mirroring the CHECK constraints in migration 0006.
 *
 * Storage only: none of these values feed metric calculation yet.
 */
export async function updateAthleteProfile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const parsed = athleteProfileSchema.safeParse(
    Object.fromEntries(PROFILE_FIELDS.map((def) => [def.key, formData.get(def.key)])),
  );

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid profile values";
    redirect(`/athletes/${id}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("athletes")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    redirect(`/athletes/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/athletes/${id}`);
  redirect(`/athletes/${id}?saved=1`);
}
