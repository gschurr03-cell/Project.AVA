"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MIN_FPS, MAX_FPS } from "@/lib/video/fps";

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
 * Save the coach's freeform note for a session. RLS scopes the update to
 * sessions whose athlete the signed-in coach owns; an empty note is stored as
 * null. Mirrors renameSession.
 */
export async function updateSessionNotes(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!id) redirect("/dashboard");

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ notes: notes.slice(0, 1000) || null })
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

/** A blank form field → null, otherwise a finite number (kept as string if not). */
function blankToNull(raw: unknown): number | null | string {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

/**
 * Coach-controlled calibration inputs for a session (Day 61): the manual FPS
 * override and the known-distance calibration zone. Every field is independently
 * optional; leaving a field blank clears it. The zone is all-or-nothing and must
 * be well-ordered (end after start, positive distance). Validated with Zod before
 * it reaches the DB, mirroring the CHECK constraints in migration 0007.
 */
const sessionCalibrationSchema = z
  .object({
    fps_override: z.preprocess(
      blankToNull,
      z
        .number({ invalid_type_error: "FPS must be a number" })
        .min(MIN_FPS, `FPS must be at least ${MIN_FPS}`)
        .max(MAX_FPS, `FPS must be at most ${MAX_FPS}`)
        .nullable(),
    ),
    calibration_zone_start_s: z.preprocess(
      blankToNull,
      z.number({ invalid_type_error: "Zone start must be a number" }).min(0).nullable(),
    ),
    calibration_zone_end_s: z.preprocess(
      blankToNull,
      z.number({ invalid_type_error: "Zone end must be a number" }).min(0).nullable(),
    ),
    calibration_zone_distance_m: z.preprocess(
      blankToNull,
      z
        .number({ invalid_type_error: "Zone distance must be a number" })
        .positive("Zone distance must be greater than 0")
        .nullable(),
    ),
  })
  .superRefine((v, ctx) => {
    const zoneFields = [
      v.calibration_zone_start_s,
      v.calibration_zone_end_s,
      v.calibration_zone_distance_m,
    ];
    const set = zoneFields.filter((x) => x != null).length;
    if (set > 0 && set < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set the zone start, end, and distance together (or clear all three).",
      });
    }
    if (
      v.calibration_zone_start_s != null &&
      v.calibration_zone_end_s != null &&
      v.calibration_zone_end_s <= v.calibration_zone_start_s
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Zone end time must be after the start time.",
      });
    }
  });

export async function updateSessionCalibration(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const parsed = sessionCalibrationSchema.safeParse({
    fps_override: formData.get("fps_override"),
    calibration_zone_start_s: formData.get("calibration_zone_start_s"),
    calibration_zone_end_s: formData.get("calibration_zone_end_s"),
    calibration_zone_distance_m: formData.get("calibration_zone_distance_m"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid calibration values";
    redirect(`/sessions/${id}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update(parsed.data).eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}?saved=1`);
}
