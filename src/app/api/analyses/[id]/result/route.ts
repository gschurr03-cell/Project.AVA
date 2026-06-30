import { NextResponse } from "next/server";

import { analysisCallbackSchema } from "@/lib/biomechanics/types";
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

  const parsed = analysisCallbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

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
