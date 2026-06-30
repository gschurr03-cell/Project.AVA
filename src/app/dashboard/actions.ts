"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Create an athlete owned by the signed-in coach. RLS enforces
 * `coach_id = auth.uid()`, but we set it explicitly so the insert satisfies the
 * NOT NULL column and the WITH CHECK policy.
 */
export async function createAthlete(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) {
    redirect(`/dashboard?error=${encodeURIComponent("Athlete name is required")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("athletes")
    .insert({ coach_id: user.id, full_name: fullName });

  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
