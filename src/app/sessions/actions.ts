"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Rename a session (sets the editable display `name`). RLS scopes the update to
 * sessions whose athlete the signed-in coach owns, so a forged id touches zero
 * rows.
 */
export async function renameSession(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) redirect("/dashboard");

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ name: name || null })
    .eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}

/**
 * Delete a session and its uploaded video. We fetch the session first (RLS-
 * scoped) to learn its storage path and athlete, remove the storage object,
 * then delete the row. Both the storage and row operations are independently
 * authorized by the athlete-ownership policies.
 */
export async function deleteSession(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, athlete_id, video_path")
    .eq("id", id)
    .single();

  // Not found or not owned (RLS) — nothing to do.
  if (!session) redirect("/dashboard");

  if (session.video_path) {
    const { error: storageError } = await supabase.storage
      .from("sprint-videos")
      .remove([session.video_path]);
    if (storageError) {
      redirect(`/sessions/${id}?error=${encodeURIComponent(storageError.message)}`);
    }
  }

  const { error: deleteError } = await supabase.from("sessions").delete().eq("id", id);
  if (deleteError) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(deleteError.message)}`);
  }

  revalidatePath(`/athletes/${session.athlete_id}`);
  redirect(`/athletes/${session.athlete_id}`);
}

/**
 * Queue an analysis for a session. Ownership is verified with the RLS-scoped
 * server client first; only then do we use the service-role client to insert
 * the `analyses` row (there is deliberately no user INSERT policy on analyses).
 * `model_version` is a placeholder the worker's result callback overwrites.
 */
export async function queueAnalysis(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const supabase = await createClient();

  // Ownership check: RLS returns the row only if the coach owns the athlete.
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", id)
    .single();
  if (!session) redirect("/dashboard");

  // Don't queue a second analysis while one is already in flight.
  const { data: active } = await supabase
    .from("analyses")
    .select("id")
    .eq("session_id", id)
    .in("status", ["queued", "running"])
    .limit(1);
  if (active && active.length > 0) {
    redirect(`/sessions/${id}?error=${encodeURIComponent("An analysis is already in progress.")}`);
  }

  const service = createServiceClient();
  const { error: insertError } = await service
    .from("analyses")
    .insert({ session_id: id, status: "queued", model_version: "pending" });
  if (insertError) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(insertError.message)}`);
  }

  await service.from("sessions").update({ status: "queued" }).eq("id", id);

  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}
