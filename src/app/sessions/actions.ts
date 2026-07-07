"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MIN_FPS, MAX_FPS } from "@/lib/video/fps";
import { calibrationGatesSchema, gatesToManualPoints } from "@/lib/calibration/gates";
import { ANALYSIS_TYPE_CONFIG, isAnalysisType } from "@/lib/analysisTypes";

/** Persist the coach's explicit mode choice before the first analysis runs. */
export async function setSessionAnalysisType(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const analysisType = String(formData.get("analysis_type") ?? "");
  if (!id) redirect("/dashboard");
  if (!isAnalysisType(analysisType)) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Choose Fly Analysis or Acceleration Analysis.")}`,
    );
  }

  const config = ANALYSIS_TYPE_CONFIG[analysisType];
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!session) redirect("/dashboard");
  const { error } = await supabase
    .from("sessions")
    .update({
      analysis_type: analysisType,
      benchmark_id: config.benchmarkId,
      // Acceleration's test title is canonical; fly keeps the coach/file name.
      name:
        analysisType === "acceleration"
          ? config.displayTitle
          : session.name === ANALYSIS_TYPE_CONFIG.acceleration.displayTitle
            ? null
            : session.name,
    })
    .eq("id", id);

  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}`);
}

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
    .select("id, analysis_type")
    .eq("id", id)
    .single();
  if (!session) redirect("/dashboard");
  if (!isAnalysisType(session.analysis_type)) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Select an analysis type before running analysis.")}`,
    );
  }

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

/** A normalized (0..1) overlay coordinate from a click, or null when blank/out of range. */
const normalizedCoord = z.preprocess(
  blankToNull,
  z.number({ invalid_type_error: "Point must be a number" }).min(0).max(1),
);

/**
 * Manual ground-based calibration points (Day 62). The coach clicks two ground
 * points on the overlay a known distance apart; we store both normalized points
 * and the distance in metres, yielding a high-confidence pixel→metre scale.
 * All five values are required together and the two points must differ. Mirrors
 * the CHECK constraints in migration 0008.
 */
const gateTime = z.preprocess(
  blankToNull,
  z.number({ invalid_type_error: "Gate time must be a number" }).min(0).nullable(),
);

const manualCalibrationSchema = z
  .object({
    calibration_point_ax: normalizedCoord,
    calibration_point_ay: normalizedCoord,
    calibration_point_bx: normalizedCoord,
    calibration_point_by: normalizedCoord,
    calibration_known_distance_m: z.preprocess(
      blankToNull,
      z
        .number({ invalid_type_error: "Known distance must be a number" })
        .positive("Known distance must be greater than 0"),
    ),
    // Clip time each gate was placed (Day 64), for world-coordinate calibration
    // under camera pan. Optional — static-camera calibrations leave them blank.
    calibration_point_a_time_s: gateTime,
    calibration_point_b_time_s: gateTime,
  })
  .superRefine((v, ctx) => {
    if (
      v.calibration_point_ax === v.calibration_point_bx &&
      v.calibration_point_ay === v.calibration_point_by
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The two calibration points must be different.",
      });
    }
  });

/**
 * Save the two clicked ground points + their known distance for a session. RLS
 * scopes the update to sessions whose athlete the coach owns. On validation
 * failure the coach is returned to the page with the reason.
 */
export async function saveManualCalibration(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const parsed = manualCalibrationSchema.safeParse({
    calibration_point_ax: formData.get("calibration_point_ax"),
    calibration_point_ay: formData.get("calibration_point_ay"),
    calibration_point_bx: formData.get("calibration_point_bx"),
    calibration_point_by: formData.get("calibration_point_by"),
    calibration_known_distance_m: formData.get("calibration_known_distance_m"),
    calibration_point_a_time_s: formData.get("calibration_point_a_time_s"),
    calibration_point_b_time_s: formData.get("calibration_point_b_time_s"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid calibration points";
    redirect(`/sessions/${id}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update(parsed.data).eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Revalidate in place (no happy-path redirect) so the gates appear immediately
  // without triggering the Next.js dev error-overlay redirect crash.
  revalidatePath(`/sessions/${id}`);
}

/** Parse a form coordinate/number field (blank → NaN so validation rejects it). */
const numField = (formData: FormData, key: string): number => Number(formData.get(key) ?? "");

/**
 * Save timing-gate BAR calibration (Day 66). The coach marks two physical timing
 * gates, each a bar drawn cone-to-cone across the lane (start gate + finish gate),
 * a known distance apart. We store the full bar geometry in `calibration_gates`
 * (jsonb, for rendering the bars) AND its reduction to the existing two-point
 * midpoint columns (`calibration_point_*` + times), so every downstream engine
 * (scale, zone, timing, benchmark) keeps working unchanged — only the INPUT is
 * richer. RLS scopes the update to sessions the coach owns.
 */
export async function saveGateCalibration(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const gates = {
    startGate: {
      c1: { x: numField(formData, "gate_start_c1x"), y: numField(formData, "gate_start_c1y") },
      c2: { x: numField(formData, "gate_start_c2x"), y: numField(formData, "gate_start_c2y") },
      timeS: numField(formData, "gate_start_time_s"),
    },
    finishGate: {
      c1: { x: numField(formData, "gate_finish_c1x"), y: numField(formData, "gate_finish_c1y") },
      c2: { x: numField(formData, "gate_finish_c2x"), y: numField(formData, "gate_finish_c2y") },
      timeS: numField(formData, "gate_finish_time_s"),
    },
    distanceM: numField(formData, "calibration_known_distance_m"),
  };

  const parsed = calibrationGatesSchema.safeParse(gates);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid calibration gates";
    redirect(`/sessions/${id}?error=${encodeURIComponent(message)}`);
  }

  // Reduce the two bars to the two midpoint points the math already consumes.
  const points = gatesToManualPoints(parsed.data);
  if (points.ax === points.bx && points.ay === points.by) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("The start and finish gates must be in different places.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      calibration_gates: parsed.data,
      calibration_point_ax: points.ax,
      calibration_point_ay: points.ay,
      calibration_point_bx: points.bx,
      calibration_point_by: points.by,
      calibration_known_distance_m: points.distanceM,
      calibration_point_a_time_s: points.aTimeS ?? null,
      calibration_point_b_time_s: points.bTimeS ?? null,
    })
    .eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Revalidate in place (no happy-path redirect) so the gate bars appear
  // immediately without the Next.js dev error-overlay redirect crash.
  revalidatePath(`/sessions/${id}`);
}

/**
 * Recompute the zone-derived metrics from the session's SAVED timing gates
 * (Day 67). AVA's benchmark/measurement layer is derived LIVE from the pose
 * artifact + the current `calibration_gates` (and known distance), so
 * "recomputing from the zone" needs no worker rerun and no re-upload — it just
 * re-runs the server render against the EXISTING pose with the latest gates. The
 * original pose artifact is untouched; a full re-detection is a separate action
 * (`queueAnalysis`). Requires a zone to be set. Revalidates in place (no redirect,
 * so it can't trip the Next.js dev error-overlay crash on NEXT_REDIRECT).
 */
export async function recomputeFromZone(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, calibration_gates, calibration_point_ax, calibration_known_distance_m")
    .eq("id", id)
    .single();
  if (!session) redirect("/dashboard");

  const hasZone =
    session.calibration_gates != null ||
    (session.calibration_point_ax != null && session.calibration_known_distance_m != null);
  if (!hasZone) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Set the timing gates and known distance first, then recompute.")}`,
    );
  }

  revalidatePath(`/sessions/${id}`);
}

/**
 * Link (or unlink) a session to a benchmark reference (Day 62). An empty value
 * clears the link. The `benchmarks` FK rejects unknown ids at the DB level; RLS
 * scopes the update to sessions the coach owns. Only linked sessions show the
 * benchmark validation panel, keeping comparisons honest.
 */
export async function setSessionBenchmark(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const raw = String(formData.get("benchmark_id") ?? "").trim();
  const benchmark_id = raw === "" ? null : raw;

  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ benchmark_id }).eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}?saved=1`);
}

/**
 * Remove ALL of a session's calibration in one go (Day 66): both calibration
 * gates (A/B points + their placement times), the known distance, and the
 * known-distance calibration zone — so the coach can re-add gates from scratch.
 * The FPS override is intentionally left untouched (it isn't part of the gate
 * calibration).
 *
 * On success it revalidates the page in place (no redirect) so the overlay + panel
 * update immediately. Avoiding the happy-path `redirect()` also sidesteps the
 * Next.js dev error-overlay crash ("frame.join is not a function") that fires when
 * a Server Action throws the NEXT_REDIRECT control signal.
 */
export async function removeCalibration(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      calibration_gates: null,
      calibration_point_ax: null,
      calibration_point_ay: null,
      calibration_point_bx: null,
      calibration_point_by: null,
      calibration_known_distance_m: null,
      calibration_point_a_time_s: null,
      calibration_point_b_time_s: null,
      calibration_zone_start_s: null,
      calibration_zone_end_s: null,
      calibration_zone_distance_m: null,
    })
    .eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sessions/${id}`);
}
