"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ANALYSIS_SUBMISSION_ENABLED, BETA_LIMITS } from "@/lib/beta/config";
import type { Json } from "@/lib/supabase/database.types";
import { MIN_FPS, MAX_FPS } from "@/lib/video/fps";
import { calibrationGatesSchema, gatesToManualPoints } from "@/lib/calibration/gates";
import { manualConfirmedAuthorityFields } from "@/lib/calibration/authority";
import { resetToAutoAuthority } from "@/lib/calibration/lifecycle";
import {
  GROUND_ANCHOR_PROPAGATION_VERSION,
  GROUND_ANCHOR_SCHEMA_VERSION,
} from "@/lib/calibration/zoneAnchors";
import {
  LANDMARK_PLANE_MODEL_VERSION,
  MANUAL_TIMING_MODEL_VERSION,
  TIMING_SETUP_SCHEMA_VERSION,
  timingTrust,
  timingSetupModeSchema,
  timingSetupSchema,
} from "@/lib/calibration/timingSetup";
import { timingWorkspaceSchema } from "@/lib/calibration/timingWorkspace";
import { WORLD_COORDINATE_SCHEMA_VERSION } from "@/lib/video/worldProjection";
import { ANALYSIS_TYPE_CONFIG, isAnalysisType } from "@/lib/analysisTypes";
import {
  ANALYSIS_PIPELINE_VERSION,
  EXPLAINABILITY_SCHEMA_VERSION,
  METRIC_SCHEMA_VERSION,
  inputSnapshotSchema,
} from "@/lib/analysis/resultContract";

/** Select the experimental fly pose backend. Acceleration is intentionally excluded. */
export async function setFlyPoseEngine(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const poseEngine = String(formData.get("pose_engine") ?? "");
  if (!id) redirect("/dashboard");
  if (poseEngine !== "mediapipe" && poseEngine !== "rtmpose") {
    redirect(`/sessions/${id}?error=${encodeURIComponent("Unknown pose engine.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ pose_engine: poseEngine })
    .eq("id", id)
    .eq("analysis_type", "fly");
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}`);
}

/** Save the acceleration finish distance before the analysis is queued. */
export async function setAccelerationFinishDistance(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const distance = Number(formData.get("finish_distance_m"));
  if (!id) redirect("/dashboard");
  if (![10, 20, 30].includes(distance)) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Choose a 10m, 20m, or 30m finish distance.")}`,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ distance_m: distance, calibration_known_distance_m: distance })
    .eq("id", id)
    .eq("analysis_type", "acceleration");
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}`);
}

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

  const { error: deleteError } = await supabase.from("sessions").delete().eq("id", id);
  if (deleteError) {
    redirect(`/sessions/${id}?error=${encodeURIComponent("Session could not be deleted. Try again or contact support.")}`);
  }

  // Delete the database record first so a transient Storage error cannot leave a visible
  // session pointing to a missing source video. A failed object cleanup is private and
  // recoverable by the orphan-storage maintenance process.
  if (session.video_path) {
    const { error: storageError } = await supabase.storage
      .from("sprint-videos")
      .remove([session.video_path]);
    if (storageError) {
      console.error("[session-delete] orphaned private video requires cleanup", {
        sessionId: id,
        athleteId: session.athlete_id,
        errorCode: storageError.name,
      });
    }
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
    .select(
      "id, video_path, analysis_type, distance_m, benchmark_id, pose_engine, fps, fps_classification, fps_override, calibration_zone_start_s, calibration_zone_end_s, calibration_zone_distance_m, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, timing_mode, timing_direction, timing_body_reference, timing_splits, timing_setup, athletes!inner(id, sex, date_of_birth, height_cm, weight_kg, leg_length_cm, trochanter_height_m, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m)",
    )
    .eq("id", id)
    .single();
  if (!session) redirect("/dashboard");
  if (!session.video_path) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Upload must finish before analysis can begin. Return to the athlete profile and retry the video upload.")}`,
    );
  }
  if (!ANALYSIS_SUBMISSION_ENABLED) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("New analyses are temporarily paused. Your existing analyses and reports remain available.")}`,
    );
  }
  if (!isAnalysisType(session.analysis_type)) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Select an analysis type before running analysis.")}`,
    );
  }
  if (
    session.analysis_type === "acceleration" &&
    ![10, 20, 30].includes(session.calibration_known_distance_m ?? session.distance_m ?? 0)
  ) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("Set finish distance before running acceleration analysis.")}`,
    );
  }

  const service = createServiceClient();
  const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const { data: ownedAthletes } = await supabase.from("athletes").select("id");
  const athleteIds = (ownedAthletes ?? []).map((item) => item.id);
  if (athleteIds.length) {
    const activeStatuses = ["queued","claimed","downloading","validating","processing","generating_results","uploading_artifacts","completing","retry_scheduled"] as const;
    const [{ count: activeCount }, { count: dailyCount }] = await Promise.all([
      service.from("analysis_jobs").select("id", { count: "exact", head: true })
        .in("athlete_id", athleteIds).in("status", [...activeStatuses]),
      service.from("analysis_jobs").select("id", { count: "exact", head: true })
        .in("athlete_id", athleteIds).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    if ((activeCount ?? 0) >= BETA_LIMITS.maxActiveAnalysesPerUser)
      redirect(`/sessions/${id}?error=${encodeURIComponent(`You already have ${BETA_LIMITS.maxActiveAnalysesPerUser} active analyses. Wait for one to finish before submitting another.`)}`);
    if ((dailyCount ?? 0) >= BETA_LIMITS.maxDailyAnalysisSubmissionsPerUser)
      redirect(`/sessions/${id}?error=${encodeURIComponent(`The beta limit of ${BETA_LIMITS.maxDailyAnalysisSubmissionsPerUser} analyses in 24 hours has been reached. Try again later or contact support if this looks incorrect.`)}`);
  }
  const capturedAt = new Date().toISOString();
  const requestedAnalysisFps = session.fps_classification === "experimental_30_fps_class" ? 30 : 60;
  const parsedTimingSetup = timingSetupSchema.safeParse(session.timing_setup);
  const timingCompatibilityGroup = parsedTimingSetup.success
    ? timingTrust(parsedTimingSetup.data, requestedAnalysisFps).compatibilityGroup
    : "legacy-unspecified";
  const inputSnapshot = inputSnapshotSchema.parse({
    capturedAt,
    athlete: {
      id: athlete.id,
      sex: athlete.sex,
      dateOfBirth: athlete.date_of_birth,
      heightCm: athlete.height_cm,
      weightKg: athlete.weight_kg,
      legLengthCm: athlete.leg_length_cm,
      trochanterHeightM: athlete.trochanter_height_m,
      personalBests: {
        "60m": athlete.personal_best_60m,
        "100m": athlete.personal_best_100m,
        "200m": athlete.personal_best_200m,
      },
      goals: { "60m": athlete.goal_60m, "100m": athlete.goal_100m, "200m": athlete.goal_200m },
    },
    session: {
      analysisType: session.analysis_type,
      distanceM: session.distance_m,
      benchmarkId: session.benchmark_id,
      recordingMode: "uploaded_video",
      timingZone: {
        startS: session.calibration_zone_start_s,
        endS: session.calibration_zone_end_s,
        distanceM: session.calibration_zone_distance_m,
        mode: session.timing_mode,
        direction: session.timing_direction,
        bodyReference: session.timing_body_reference,
        splits: session.timing_splits,
      },
      timingSetup: session.timing_setup,
      calibrationInputs: {
        pointA: [session.calibration_point_ax, session.calibration_point_ay],
        pointB: [session.calibration_point_bx, session.calibration_point_by],
        knownDistanceM: session.calibration_known_distance_m,
        pointATimeS: session.calibration_point_a_time_s,
        pointBTimeS: session.calibration_point_b_time_s,
        gates: session.calibration_gates,
      },
      requestedOptions: {
        analysisFps: requestedAnalysisFps,
        poseEngine: "mediapipe",
        fpsOverride: session.fps_override,
      },
    },
  });
  const { data: workingAnalysisId, error: replaceError } = await service.rpc("replace_working_analysis", {
    p_session_id: id,
    p_input_snapshot: inputSnapshot as unknown as Json,
    p_analysis_fps: requestedAnalysisFps,
    p_pipeline_version: ANALYSIS_PIPELINE_VERSION,
    p_metric_schema_version: METRIC_SCHEMA_VERSION,
    p_explainability_schema_version: EXPLAINABILITY_SCHEMA_VERSION,
    p_timing_compatibility_group: timingCompatibilityGroup,
  });
  if (replaceError || !workingAnalysisId) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(replaceError?.message ?? "Working analysis could not be queued.")}`);
  }
  console.info("[working-analysis] rerun queued", {
    sessionId: id,
    currentWorkingAnalysisId: workingAnalysisId,
    queuedJobAnalysisId: workingAnalysisId,
  });

  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}

/** Clone the completed working result into an explicit immutable saved version. */
export async function saveAnalysisVersion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("version_notes") ?? "").trim().slice(0, 1000) || null;
  if (!id) redirect("/dashboard");
  const supabase = await createClient();
  const { data: owned } = await supabase.from("sessions").select("id,current_working_analysis_id").eq("id", id).single();
  if (!owned?.current_working_analysis_id) {
    redirect(`/sessions/${id}?error=${encodeURIComponent("Complete a working analysis before saving a version.")}`);
  }
  const service = createServiceClient();
  const { data: source } = await service.from("analyses")
    .select("id,status,keypoints_path")
    .eq("id", owned.current_working_analysis_id)
    .single();
  if (!source || source.status !== "complete") {
    redirect(`/sessions/${id}?error=${encodeURIComponent("Only a completed working analysis can be saved.")}`);
  }
  const { data: savedId, error: snapshotError } = await service.rpc("save_working_analysis_snapshot", {
    p_session_id: id,
    p_notes: notes ?? undefined,
  });
  if (snapshotError || !savedId) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(snapshotError?.message ?? "Version could not be saved.")}`);
  }
  if (source.keypoints_path) {
    const slash = source.keypoints_path.lastIndexOf("/");
    const destination = `${source.keypoints_path.slice(0, slash + 1)}${savedId}.pose.json`;
    const { error: copyError } = await service.storage.from(process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts")
      .copy(source.keypoints_path, destination);
    if (copyError) {
      await service.from("analyses").delete().eq("id", savedId).eq("analysis_kind", "saved");
      redirect(`/sessions/${id}?error=${encodeURIComponent(`Pose snapshot could not be copied: ${copyError.message}`)}`);
    }
    await service.from("analyses").update({ keypoints_path: destination }).eq("id", savedId);
  }
  console.info("[working-analysis] explicit version saved", {
    sessionId: id,
    currentWorkingAnalysisId: source.id,
    latestSavedVersionId: savedId,
  });
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}?saved_version=1`);
}

/** Clear only mutable working state; original media and explicit snapshots remain. */
export async function resetWorkingAnalysis(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");
  const supabase = await createClient();
  const { data: owned } = await supabase.from("sessions").select("id,video_path").eq("id", id).single();
  if (!owned) redirect("/dashboard");
  const sourceVideoPath = owned.video_path;
  const service = createServiceClient();
  const { error } = await service.rpc("reset_working_analysis", { p_session_id: id });
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  // The reset RPC predates the professional Timing Workspace. Clear its
  // reversible draft separately so rejected gates/keyframes cannot reappear
  // after an otherwise clean reset. This does not touch source media or saves.
  const { error: workspaceError } = await service
    .from("sessions")
    .update({ timing_workspace: {} })
    .eq("id", id);
  if (workspaceError) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(workspaceError.message)}`);
  }
  console.info("[working-analysis] reset", { sessionId: id, sourceVideoPath, preserved: true });
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}?reset=1`);
}

/** Persist reversible Timing Workspace UI/draft state; no timing math is executed. */
export async function saveTimingWorkspace(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("workspace") ?? "{}")); }
  catch { redirect(`/sessions/${id}/timing?error=${encodeURIComponent("Workspace data was invalid.")}`); }
  const parsed = timingWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/sessions/${id}/timing?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Workspace data was invalid.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("sessions")
    .update({ timing_workspace: parsed.data as unknown as Json }).eq("id", id);
  if (error) redirect(`/sessions/${id}/timing?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}/timing`);
  redirect(`/sessions/${id}/timing?saved=1`);
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
    timing_mode: z.enum(["fly", "split", "custom"]),
    timing_direction: z.enum(["auto", "left_to_right", "right_to_left"]),
    timing_body_reference: z.enum(["torso", "hips", "head"]),
    timing_splits: z.preprocess(
      (raw) => String(raw ?? "").split(",").map((value) => value.trim()).filter(Boolean).map(Number),
      z.array(z.number().positive()).max(12),
    ),
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
    timing_mode: formData.get("timing_mode"),
    timing_direction: formData.get("timing_direction"),
    timing_body_reference: formData.get("timing_body_reference"),
    timing_splits: formData.get("timing_splits"),
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

  // Calibration is editable session-draft state. Capturing it in a new analysis
  // row preserves every prior input/result/artifact version unchanged.
  await queueAnalysis(formData);
}

const optionalFinite = (formData: FormData, name: string): number | null => {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const requiredFinite = (formData: FormData, name: string): number => {
  const value = optionalFinite(formData, name);
  return value ?? Number.NaN;
};

/** Save one boundary-setup draft and immediately capture it in a new immutable analysis version. */
export async function updateTimingSetup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");
  const modeResult = timingSetupModeSchema.safeParse(formData.get("timing_setup_mode"));
  if (!modeResult.success) redirect(`/sessions/${id}?error=${encodeURIComponent("Choose a timing setup mode.")}`);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("sessions")
    .select("timing_setup,calibration_gates,timing_body_reference")
    .eq("id", id)
    .single();
  if (!current) redirect("/dashboard");

  const previous = timingSetupSchema.safeParse(current.timing_setup);
  const setupVersion = previous.success ? previous.data.setupVersion + 1 : 1;
  const bodyReference = current.timing_body_reference === "hips" || current.timing_body_reference === "head"
    ? current.timing_body_reference
    : "torso";
  const distanceM = optionalFinite(formData, "setup_distance_m");
  const distanceStatusRaw = String(formData.get("distance_status") ?? "unknown");
  const distanceStatus = ["surveyed", "verified_track_marking", "hardware_defined", "user_measured", "user_asserted", "unknown"].includes(distanceStatusRaw)
    ? distanceStatusRaw
    : "unknown";
  const distance = {
    distanceM,
    status: distanceStatus,
    measurementMethod: String(formData.get("distance_method") ?? "").trim() || null,
    uncertaintyM: optionalFinite(formData, "distance_uncertainty_m"),
    evidence: String(formData.get("distance_evidence") ?? "").trim() || null,
    confirmedAt: distanceStatus === "unknown" ? null : new Date().toISOString(),
  };
  const common = { schemaVersion: TIMING_SETUP_SCHEMA_VERSION, setupVersion, distance, bodyReference };

  let candidate: unknown;
  if (modeResult.data === "technique_only") {
    candidate = { ...common, setupMode: "technique_only", validationStatus: "eligible" };
  } else if (modeResult.data === "manual_crossing") {
    const bracket = (prefix: "start" | "finish") => ({
      beforeFrame: requiredFinite(formData, `${prefix}_before_frame`),
      beforeTimestampS: requiredFinite(formData, `${prefix}_before_time_s`),
      afterFrame: optionalFinite(formData, `${prefix}_after_frame`),
      afterTimestampS: optionalFinite(formData, `${prefix}_after_time_s`),
      interpolation: optionalFinite(formData, `${prefix}_interpolation`),
    });
    candidate = {
      ...common, setupMode: "manual_crossing", modelVersion: MANUAL_TIMING_MODEL_VERSION,
      validationStatus: "experimental_ready", start: bracket("start"), finish: bracket("finish"),
      notes: String(formData.get("manual_notes") ?? "").trim() || null,
    };
  } else if (modeResult.data === "fixed_landmarks") {
    const definition = (prefix: "start" | "finish") => {
      const points = [
        { x: requiredFinite(formData, `${prefix}_c1x`), y: requiredFinite(formData, `${prefix}_c1y`) },
        { x: requiredFinite(formData, `${prefix}_c2x`), y: requiredFinite(formData, `${prefix}_c2y`) },
      ];
      return {
        construction: "two_fixed_points", referenceType: String(formData.get(`${prefix}_reference_type`) ?? "fixed_points"),
        points, laneOrientationDeg: optionalFinite(formData, "lane_orientation_deg"),
        analyticalPlane: { c1: points[0], c2: points[1] },
        physicalEvidence: String(formData.get(`${prefix}_physical_evidence`) ?? "").trim(),
        confidence: 1, confirmed: formData.get(`${prefix}_confirmed`) === "on",
        readiness: "needs_confirmation",
      };
    };
    candidate = {
      ...common, setupMode: "fixed_landmarks", modelVersion: LANDMARK_PLANE_MODEL_VERSION,
      validationStatus: "pending_validation", laneIdentity: String(formData.get("lane_identity") ?? "").trim(),
      start: definition("start"), finish: definition("finish"),
    };
  } else {
    const gates = calibrationGatesSchema.safeParse(current.calibration_gates);
    const boundary = (which: "start" | "finish") => {
      const line = gates.success
        ? which === "start"
          ? gates.data.startBoundary?.sourceFrameLine ?? gates.data.startGate
          : gates.data.finishBoundary?.sourceFrameLine ?? gates.data.finishGate
        : null;
      const normalizedLine = line && "c1" in line ? { c1: line.c1, c2: line.c2 } : null;
      return {
        confirmed: formData.get(`${which}_confirmed`) === "on",
        readiness: normalizedLine ? "needs_confirmation" : "unsupported",
        line: normalizedLine,
      };
    };
    candidate = {
      ...common, setupMode: "marked_zone", validationStatus: "pending_validation",
      start: boundary("start"), finish: boundary("finish"),
    };
  }

  const parsed = timingSetupSchema.safeParse(candidate);
  if (!parsed.success) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid timing setup.")}`);
  }
  const { error } = await supabase.from("sessions").update({ timing_setup: parsed.data as unknown as Json }).eq("id", id);
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  await queueAnalysis(formData);
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

  await queueAnalysis(formData);
}

/** Parse a form coordinate/number field (blank → NaN so validation rejects it). */
const numField = (formData: FormData, key: string): number => Number(formData.get(key) ?? "");

/** Save an optional fly-only anatomical anchor. It is consumed only by rendering. */
export async function saveTrochanterOverlayPoint(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const x = numField(formData, "trochanter_x");
  const y = numField(formData, "trochanter_y");
  const timeS = numField(formData, "trochanter_time_s");
  if (!id) redirect("/dashboard");
  if (![x, y, timeS].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1 || timeS < 0) {
    redirect(`/sessions/${id}?error=${encodeURIComponent("Invalid trochanter overlay point.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ overlay_trochanter_x: x, overlay_trochanter_y: y, overlay_trochanter_time_s: timeS })
    .eq("id", id)
    .eq("analysis_type", "fly");
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}`);
}

export async function clearTrochanterOverlayPoint(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      overlay_trochanter_x: null,
      overlay_trochanter_y: null,
      overlay_trochanter_time_s: null,
    })
    .eq("id", id)
    .eq("analysis_type", "fly");
  if (error) redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/sessions/${id}`);
}

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

  const startFrame = numField(formData, "gate_start_frame");
  const finishFrame = numField(formData, "gate_finish_frame");
  const sourcePoints = [0, 1, 2, 3].map((index) => ({
    x: numField(formData, index === 0 ? "gate_start_c1x" : index === 1 ? "gate_start_c2x" : index === 2 ? "gate_finish_c1x" : "gate_finish_c2x"),
    y: numField(formData, index === 0 ? "gate_start_c1y" : index === 1 ? "gate_start_c2y" : index === 2 ? "gate_finish_c1y" : "gate_finish_c2y"),
  }));
  const compensatedPoints = [0, 1, 2, 3].map((index) => ({
    x: numField(formData, `gate_comp_${index}_x`),
    y: numField(formData, `gate_comp_${index}_y`),
  }));
  const startTime = numField(formData, "gate_start_time_s");
  const finishTime = numField(formData, "gate_finish_time_s");
  const distanceM = numField(formData, "calibration_known_distance_m");
  const sourceFrameWidth = numField(formData, "gate_source_width");
  const sourceFrameHeight = numField(formData, "gate_source_height");

  const supabase = await createClient();
  const { data: currentSession } = await supabase
    .from("sessions")
    .select("calibration_gates,timing_direction,timing_body_reference")
    .eq("id", id)
    .single();
  const previous = calibrationGatesSchema.safeParse(currentSession?.calibration_gates);
  const version = previous.success ? (previous.data.version ?? 0) + 1 : 1;
  const inferredDirection =
    currentSession?.timing_direction === "left_to_right" || currentSession?.timing_direction === "right_to_left"
      ? currentSession.timing_direction
      : (compensatedPoints[2].x + compensatedPoints[3].x) / 2 >= (compensatedPoints[0].x + compensatedPoints[1].x) / 2
        ? "left_to_right"
        : "right_to_left";
  const bodyReference = currentSession?.timing_body_reference === "hips" || currentSession?.timing_body_reference === "head"
    ? currentSession.timing_body_reference
    : "torso";
  const signedCrossingSide = (c1: { x: number; y: number }, c2: { x: number; y: number }) => {
    const directionX = inferredDirection === "left_to_right" ? 1 : -1;
    return -(c2.y - c1.y) * directionX >= 0 ? "negative_to_positive" as const : "positive_to_negative" as const;
  };
  const lineOrientationDeg = (c1: { x: number; y: number }, c2: { x: number; y: number }) =>
    (Math.atan2(c2.y - c1.y, c2.x - c1.x) * 180) / Math.PI;

  const gates = {
    // Explicit manual-confirmed authority (Part 1): stamps source/confirmedAt/
    // revision so hydration, polling, worker completion, rerun and FPS
    // normalization cannot silently overwrite or downgrade this saved zone.
    ...manualConfirmedAuthorityFields(version),
    startGate: {
      c1: sourcePoints[0], c2: sourcePoints[1], timeS: startTime, setupFrameIndex: startFrame,
    },
    finishGate: {
      c1: sourcePoints[2], c2: sourcePoints[3], timeS: finishTime, setupFrameIndex: finishFrame,
    },
    distanceM,
    zoneDistanceMeters: distanceM,
    startGateId: `start-v${version}`,
    finishGateId: `finish-v${version}`,
    connectedZoneVisualizationDeprecated: true,
    schemaVersion: GROUND_ANCHOR_SCHEMA_VERSION,
    version,
    travelDirection: inferredDirection,
    bodyReference,
    coordinateSchemaVersion: WORLD_COORDINATE_SCHEMA_VERSION,
    referenceFrameIndex: 0,
    sourceFrameWidth,
    sourceFrameHeight,
    startBoundary: {
      boundaryId: `start-v${version}`,
      boundaryType: "start" as const,
      gateId: `start-v${version}`,
      type: "start" as const,
      setupFrameIndex: startFrame,
      setupTimestampS: startTime,
      sourceFrameLine: { c1: sourcePoints[0], c2: sourcePoints[1] },
      compensatedAnchorLine: { c1: compensatedPoints[0], c2: compensatedPoints[1] },
      groundAnchorVersion: GROUND_ANCHOR_SCHEMA_VERSION,
      confidence: 1,
      selectedByUser: true as const,
      physicalReferenceDescription: "User-selected physical start track marking",
      propagationModelVersion: GROUND_ANCHOR_PROPAGATION_VERSION,
      signedCrossingSide: signedCrossingSide(compensatedPoints[0], compensatedPoints[1]),
      physicalLineOrientationDeg: lineOrientationDeg(sourcePoints[0], sourcePoints[1]),
      immutableVersion: version,
    },
    finishBoundary: {
      boundaryId: `finish-v${version}`,
      boundaryType: "finish" as const,
      gateId: `finish-v${version}`,
      type: "finish" as const,
      setupFrameIndex: finishFrame,
      setupTimestampS: finishTime,
      sourceFrameLine: { c1: sourcePoints[2], c2: sourcePoints[3] },
      compensatedAnchorLine: { c1: compensatedPoints[2], c2: compensatedPoints[3] },
      groundAnchorVersion: GROUND_ANCHOR_SCHEMA_VERSION,
      confidence: 1,
      selectedByUser: true as const,
      physicalReferenceDescription: "User-selected physical finish track marking",
      propagationModelVersion: GROUND_ANCHOR_PROPAGATION_VERSION,
      signedCrossingSide: signedCrossingSide(compensatedPoints[2], compensatedPoints[3]),
      physicalLineOrientationDeg: lineOrientationDeg(sourcePoints[2], sourcePoints[3]),
      immutableVersion: version,
    },
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

  // Optimistic concurrency (Part 1 §3). When the client submits the revision it was
  // editing (`expected_revision`), the write is CONDITIONAL on the stored revision
  // still matching — an atomic compare-and-set at the DB boundary. A concurrent save
  // (or another tab) that already advanced the revision makes this match 0 rows, so
  // a stale save is rejected instead of clobbering newer calibration. First saves
  // (no prior revision) skip the check.
  const expectedRevision = numField(formData, "expected_revision");
  const enforceCas = Number.isFinite(expectedRevision) && expectedRevision > 0;
  let writeQuery = supabase
    .from("sessions")
    .update({
      calibration_gates: parsed.data,
      timing_zone_schema_version: GROUND_ANCHOR_SCHEMA_VERSION,
      timing_zone_version: version,
      calibration_point_ax: points.ax,
      calibration_point_ay: points.ay,
      calibration_point_bx: points.bx,
      calibration_point_by: points.by,
      calibration_known_distance_m: points.distanceM,
      calibration_point_a_time_s: points.aTimeS ?? null,
      calibration_point_b_time_s: points.bTimeS ?? null,
    })
    .eq("id", id);
  if (enforceCas) writeQuery = writeQuery.eq("timing_zone_version", expectedRevision);
  const { data: writtenRows, error } = await writeQuery.select("id");

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }
  if (enforceCas && (!writtenRows || writtenRows.length === 0)) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent("This zone was updated elsewhere. AVA loaded the latest version.")}`,
    );
  }

  await queueAnalysis(formData);
}

/** Structured save outcome for the client (Part 1 §1) — no reliance on redirects. */
export type SaveGateStatus = "saved" | "conflict" | "validation_error" | "error";
export interface SaveGateResult {
  ok: boolean;
  status: SaveGateStatus;
  revision?: number;
  message?: string;
}

/** Map the proven action's redirect outcome to a structured result. */
function classifyGateSaveRedirect(digest: string): SaveGateResult {
  // digest form: "NEXT_REDIRECT;replace;/sessions/<id>?error=<msg>;<code>;"
  const url = digest.split(";")[2] ?? "";
  const query = url.includes("?") ? new URLSearchParams(url.slice(url.indexOf("?") + 1)) : new URLSearchParams();
  const err = query.get("error");
  if (!err) return { ok: true, status: "saved" };
  if (/updated elsewhere/i.test(err)) return { ok: false, status: "conflict", message: err };
  if (/different places|Invalid calibration/i.test(err)) return { ok: false, status: "validation_error", message: err };
  return { ok: false, status: "error", message: err };
}

/**
 * `useActionState`-compatible wrapper around {@link saveGateCalibration} (Part 1 §1).
 * Reuses the exact proven validation / CAS / persistence / enqueue path — it just
 * captures that path's redirect and returns a structured status so the overlay can
 * render Saving / Manual zone confirmed / Save failed / Revision conflict inline
 * instead of relying on navigation. Zero change to the underlying save behavior.
 */
export async function saveGateCalibrationAction(
  _prev: SaveGateResult | null,
  formData: FormData,
): Promise<SaveGateResult> {
  try {
    await saveGateCalibration(formData);
    // saveGateCalibration always redirects; this is a defensive fallback.
    return { ok: true, status: "saved" };
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return classifyGateSaveRedirect(digest);
    }
    throw error;
  }
}

/**
 * Reset to Auto / Re-detect (Part 1). Explicit supersession of a manual-confirmed
 * zone: flips authority to `auto`, increments the revision, and records the
 * superseded manual revision/source for provenance — the historical calibration is
 * NOT deleted. The client must confirm before calling this; the action itself is
 * the point of no return. A recompute is enqueued so downstream metrics recompute
 * against the new (auto) revision. Idempotent-safe: a session without gates is a
 * no-op redirect.
 */
export async function resetCalibrationToAuto(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/dashboard");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("sessions")
    .select("calibration_gates")
    .eq("id", id)
    .single();

  const parsed = calibrationGatesSchema.safeParse(current?.calibration_gates);
  if (!parsed.success) {
    // Nothing manual to supersede — surface a controlled message, change nothing.
    redirect(`/sessions/${id}?error=${encodeURIComponent("No manual calibration to reset.")}`);
  }

  const next = resetToAutoAuthority(parsed.data);
  const { error } = await supabase
    .from("sessions")
    .update({ calibration_gates: next, timing_zone_version: next.revision })
    .eq("id", id);
  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Recompute against the new auto revision (re-detection happens in the run).
  await queueAnalysis(formData);
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

  await queueAnalysis(formData);
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

  await queueAnalysis(formData);
}
