import { NextResponse } from "next/server";

import { analysisFailureSchema, analysisSuccessSchema } from "@/lib/biomechanics/types";
import { accelerationAnalysisSuccessSchema } from "@/lib/acceleration/schema";
import { createServiceClient } from "@/lib/supabase/service";

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

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const body: unknown = await request.json();
  const isComplete =
    !!body && typeof body === "object" && "status" in body && body.status === "complete";

  // Validation is selected by the session mode. The fly schema never imports or
  // accepts acceleration, and acceleration never accepts the legacy fly object.
  const { data: target } = await supabase
    .from("analyses")
    .select("session_id, sessions!inner(analysis_type)")
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
    const { data: analysis, error } = await supabase
      .from("analyses")
      .update({
        status: "complete",
        model_version: parsed.data.modelVersion,
        metrics: parsed.data.metrics,
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
