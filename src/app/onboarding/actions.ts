"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_VERSION } from "@/lib/beta/config";

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  const intent = String(formData.get("intent") ?? "progress");
  const step = Math.max(1, Math.min(5, Number(formData.get("step") ?? 1)));
  const acknowledged = formData.get("scientific_boundary") === "on";
  if (intent === "complete" && !acknowledged)
    redirect("/onboarding?error=Review%20and%20acknowledge%20the%20scientific%20boundary.");
  const state = intent === "complete" ? "completed" : intent === "dismiss" ? "dismissed" : "in_progress";
  const { error } = await supabase.from("onboarding_states").upsert({
    user_id: user.id,
    state,
    current_step: step,
    onboarding_version: ONBOARDING_VERSION,
    scientific_boundary_acknowledged: acknowledged,
    completed_at: intent === "complete" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) redirect(`/onboarding?error=${encodeURIComponent("Onboarding progress could not be saved.")}`);
  redirect(intent === "complete" || intent === "dismiss" ? "/dashboard" : `/onboarding?step=${step}`);
}

