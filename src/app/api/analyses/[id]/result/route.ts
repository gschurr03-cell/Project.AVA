import { NextResponse } from "next/server";

import { analysisFailureSchema, analysisSuccessSchema } from "@/lib/biomechanics/types";
import { accelerationAnalysisSuccessSchema } from "@/lib/acceleration/schema";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import {
  explainableAnalysisResultSchema,
  inputSnapshotSchema,
  provenanceSchema,
} from "@/lib/analysis/resultContract";

/**
 * Callback endpoint the AI analysis worker POSTs to when pose estimation
 * finishes (or fails). Writes the result back with the service-role client
 * (bypassing RLS) and moves the parent session to its terminal status.
 *
 * Authenticated by a shared secret: the worker must send
 * `Authorization: Bearer <ANALYSIS_WORKER_SECRET>`. The endpoint fails closed
 * if the secret is not configured, so it is never accidentally left open.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const secret = process.env.ANALYSIS_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "worker secret not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Production completion is authoritative only through the token-scoped,
  // transactional complete_analysis_job RPC. Keep this route for local mock and
  // legacy development workflows; never allow a second production write path.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "production completion uses the job RPC" }, { status: 410 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const body: unknown = await request.json();
  const isComplete =
    !!body && typeof body === "object" && "status" in body && body.status === "complete";

  // Validation is selected by the session mode. The fly schema never imports or
  // accepts acceleration, and acceleration never accepts the legacy fly object.
  const { data: target } = await supabase
    .from("analyses")
    .select("session_id, input_snapshot, sessions!analyses_session_id_fkey!inner(analysis_type, athlete_id)")
    .eq("id", id)
    .single();
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  const joined = Array.isArray(target.sessions) ? target.sessions[0] : target.sessions;
  const sessionType = joined?.analysis_type ?? "fly";
  const parsed = isComplete
    ? (sessionType === "acceleration"
        ? accelerationAnalysisSuccessSchema
        : analysisSuccessSchema
      ).safeParse(body)
    : analysisFailureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.status === "complete") {
    const isDevelopmentMock = parsed.data.modelVersion.startsWith("mock-");
    if (isDevelopmentMock) {
      const { data: mockAnalysis, error: mockError } = await supabase
        .from("analyses")
        .update({
          status: "complete",
          model_version: parsed.data.modelVersion,
          metrics: parsed.data.metrics,
          error: null,
          completed_at: now,
        })
        .eq("id", id)
        .select("session_id")
        .single();
      if (mockError || !mockAnalysis)
        return NextResponse.json({ error: mockError?.message ?? "not found" }, { status: 404 });
      await supabase
        .from("sessions")
        .update({ status: "complete" })
        .eq("id", mockAnalysis.session_id);
      return NextResponse.json({ ok: true, legacyMock: true });
    }
    const provenance = provenanceSchema.safeParse(parsed.data.provenance);
    const inputSnapshot = inputSnapshotSchema.safeParse(parsed.data.inputSnapshot);
    const resultPayload = explainableAnalysisResultSchema.safeParse(parsed.data.resultPayload);
    if (!provenance.success || !inputSnapshot.success || !resultPayload.success) {
      return NextResponse.json(
        { error: "required analysis provenance is invalid" },
        { status: 400 },
      );
    }
    const storedSnapshot = inputSnapshotSchema.safeParse(target.input_snapshot);
    if (
      !storedSnapshot.success ||
      JSON.stringify(storedSnapshot.data) !== JSON.stringify(inputSnapshot.data) ||
      resultPayload.data.analysisId !== id ||
      resultPayload.data.sessionId !== target.session_id ||
      resultPayload.data.athleteId !== joined?.athlete_id
    ) {
      return NextResponse.json(
        { error: "analysis identity or immutable input snapshot changed" },
        { status: 409 },
      );
    }
    if (provenance.data.poseModelName !== "mediapipe" || provenance.data.analysisFps !== 60) {
      return NextResponse.json(
        { error: "production metrics require MediaPipe at 60 FPS" },
        { status: 400 },
      );
    }
    const { data: analysis, error } = await supabase
      .from("analyses")
      .update({
        status: "complete",
        model_version: parsed.data.modelVersion,
        metrics: parsed.data.metrics,
        provenance: provenance.data as unknown as Json,
        input_snapshot: inputSnapshot.data as unknown as Json,
        result_payload: resultPayload.data as unknown as Json,
        analysis_fps: provenance.data.analysisFps,
        source_fps: provenance.data.originalSourceFps,
        analysis_pipeline_version: provenance.data.analysisPipelineVersion,
        metric_schema_version: provenance.data.metricSchemaVersion,
        explainability_schema_version: provenance.data.explainabilitySchemaVersion,
        keypoints_path: parsed.data.keypointsPath ?? null,
        error: null,
        completed_at: now,
      })
      .eq("id", id)
      .select("session_id")
      .single();

    if (error || !analysis) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }

    await supabase.from("sessions").update({ status: "complete" }).eq("id", analysis.session_id);
    return NextResponse.json({ ok: true });
  }

  // status === "failed"
  const { data: analysis, error } = await supabase
    .from("analyses")
    .update({
      status: "failed",
      error: parsed.data.error,
      completed_at: now,
      ...(parsed.data.modelVersion ? { model_version: parsed.data.modelVersion } : {}),
    })
    .eq("id", id)
    .select("session_id")
    .single();

  if (error || !analysis) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  await supabase.from("sessions").update({ status: "failed" }).eq("id", analysis.session_id);
  return NextResponse.json({ ok: true });
}
