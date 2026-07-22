import { NextRequest } from "next/server";

import {
  MobileAPIError, analysisCreateSchema, authenticateMobile, mobileResponse, withMobileRoute,
} from "@/lib/mobile/api";
import { validatedAnalysisContract } from "@/lib/analysis/analysisContract";

export async function POST(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, athlete, service } = await authenticateMobile(request);
    const parsed = analysisCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MobileAPIError(422, "UPLOAD_INVALID", "Analysis request was invalid.");
    const { data: existing } = await service.from("mobile_analysis_requests")
      .select("analysis_id").eq("user_id", user.id)
      .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
    if (existing) return mobileResponse(requestId, {
      contractVersion: "ava-mobile-analysis-v1", id: existing.analysis_id,
      athleteID: athlete.id, state: "queued",
    });
    const { data: upload } = await service.from("mobile_uploads").select("*")
      .eq("id", parsed.data.uploadId).eq("user_id", user.id).eq("athlete_id", athlete.id).maybeSingle();
    if (!upload) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Upload was not found.");
    if (upload.status !== "complete") throw new MobileAPIError(409, "UPLOAD_INCOMPLETE", "Complete the upload first.");

    const metadata = upload.recording_metadata as Record<string, unknown>;
    const { data: session, error: sessionError } = await service.from("sessions").insert({
      athlete_id: athlete.id, created_by: user.id, video_path: upload.object_path,
      original_filename: upload.original_filename, file_size_bytes: upload.actual_bytes,
      fps: metadata.measuredFps ?? metadata.nominalFps, width: metadata.width,
      height: metadata.height, duration_s: metadata.durationSeconds,
      status: "uploaded", analysis_type: parsed.data.analysisType,
    }).select("id").single();
    if (sessionError || !session) throw new MobileAPIError(409, "RESOURCE_CONFLICT", "Analysis session could not be created.");
    const analysisId = crypto.randomUUID();
    const inputSnapshot = {
      capturedAt: new Date().toISOString(), athlete: { id: athlete.id },
      session: {
        analysisType: parsed.data.analysisType, recordingMode: "uploaded_video",
        requestedOptions: { analysisFps: 60, poseEngine: "mediapipe" },
      },
      mobile: { uploadId: upload.id, inputChecksum: upload.client_sha256, requestId },
    };
    const { data: analysis, error: analysisError } = await service.from("analyses").insert({
      id: analysisId, session_id: session.id, model_version: "pending-mediapipe",
      status: "queued", input_snapshot: inputSnapshot, analysis_fps: 60,
      analysis_pipeline_version: "ava-sprint-60-v1", metric_schema_version: "ava-metrics-v1",
      explainability_schema_version: "ava-explainability-v1", analysis_kind: "working",
      // Never hand-assemble the experimental/validation contract — one source of truth.
      ...validatedAnalysisContract(),
    }).select("id,status").single();
    if (analysisError || !analysis) {
      await service.from("sessions").delete().eq("id", session.id);
      throw new MobileAPIError(409, "RESOURCE_CONFLICT", "Analysis could not be queued.");
    }
    const { error: requestError } = await service.from("mobile_analysis_requests").insert({
      user_id: user.id, athlete_id: athlete.id, upload_id: upload.id,
      analysis_id: analysis.id, idempotency_key: parsed.data.idempotencyKey, request_id: requestId,
    });
    if (requestError) throw new MobileAPIError(409, "RESOURCE_CONFLICT", "Analysis request conflicted.");
    await service.from("mobile_uploads").update({
      status: "analysis_submitted", analysis_id: analysis.id, updated_at: new Date().toISOString(),
    }).eq("id", upload.id);
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-analysis-v1", id: analysis.id,
      athleteID: athlete.id, state: "queued",
    }, 201, "ava-mobile-analysis-v1");
  });
}
