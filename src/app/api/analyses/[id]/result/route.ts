import { NextResponse } from "next/server";

import { analysisResultSchema } from "@/lib/biomechanics/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Callback endpoint the AI analysis worker POSTs to when pose estimation
 * completes. Writes the derived metrics back with the service-role client
 * (bypassing RLS) and flips the parent session to `complete`.
 *
 * NOTE: this stub does not yet authenticate the worker. Before shipping, gate
 * it behind a shared secret / signed request from the job runner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = analysisResultSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .update({
      status: "complete",
      model_version: parsed.data.modelVersion,
      metrics: parsed.data.metrics,
      keypoints_path: parsed.data.keypointsPath ?? null,
      completed_at: new Date().toISOString(),
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
