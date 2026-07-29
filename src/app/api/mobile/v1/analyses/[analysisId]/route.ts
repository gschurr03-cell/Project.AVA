import { NextRequest } from "next/server";

import {
  MobileAPIError, authenticateMobile, mapJobState, mobileResponse, withMobileRoute,
} from "@/lib/mobile/api";

export async function GET(request: NextRequest, context: { params: Promise<{ analysisId: string }> }) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, service } = await authenticateMobile(request);
    const { analysisId } = await context.params;
    const { data: link } = await service.from("mobile_analysis_requests")
      .select("analysis_id,athlete_id").eq("analysis_id", analysisId).eq("user_id", user.id).maybeSingle();
    if (!link) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Analysis was not found.");
    const { data: analysis } = await service.from("analyses").select("id,status,error,completed_at")
      .eq("id", analysisId).single();
    const { data: job } = await service.from("analysis_jobs")
      .select("status,user_message,user_action_required,updated_at").eq("analysis_id", analysisId).maybeSingle();
    if (!analysis) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Analysis was not found.");
    const state = mapJobState(job?.status ?? null, analysis.status);
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-analysis-v1", analysisID: analysis.id,
      state, userMessage: job?.user_message ?? (state === "failed" ? "Analysis failed safely." : null),
      actionRequired: job?.user_action_required ?? false,
      retryAfterSeconds: ["queued", "validating", "processing", "awaiting_activation"].includes(state) ? 3 : null,
      completedAt: analysis.completed_at,
    });
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ analysisId: string }> }) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, athlete, service } = await authenticateMobile(request);
    const { analysisId } = await context.params;
    const { data: upload } = await service.from("mobile_uploads").select("*")
      .eq("analysis_id", analysisId).eq("user_id", user.id).eq("athlete_id", athlete.id).maybeSingle();
    if (!upload) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Analysis was not found.");
    if (upload.status === "deleted") {
      return mobileResponse(requestId, { contractVersion: "ava-mobile-deletion-v1", status: "completed" });
    }
    await service.from("mobile_uploads").update({
      status: "deletion_pending", deletion_requested_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", upload.id);
    const { data: analysis } = await service.from("analyses").select("session_id,keypoints_path").eq("id", analysisId).maybeSingle();
    const storageErrors: string[] = [];
    const videoRemoval = await service.storage.from("sprint-videos").remove([upload.object_path]);
    if (videoRemoval.error) storageErrors.push("source");
    if (analysis?.keypoints_path) {
      const poseRemoval = await service.storage.from(process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts")
        .remove([analysis.keypoints_path]);
      if (poseRemoval.error) storageErrors.push("pose");
    }
    if (storageErrors.length) {
      await service.from("mobile_deletion_audit").insert({
        user_id: user.id, athlete_id: athlete.id, upload_id: upload.id, analysis_id: analysisId,
        request_id: requestId, status: "failed",
      });
      throw new MobileAPIError(202, "DELETION_PENDING", "Deletion is pending.", true, 10);
    }
    if (analysis?.session_id) await service.from("sessions").delete().eq("id", analysis.session_id);
    await service.from("mobile_uploads").update({
      status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", upload.id);
    await service.from("mobile_deletion_audit").insert({
      user_id: user.id, athlete_id: athlete.id, upload_id: upload.id, analysis_id: analysisId,
      request_id: requestId, status: "completed", completed_at: new Date().toISOString(),
    });
    return mobileResponse(requestId, { contractVersion: "ava-mobile-deletion-v1", status: "completed" });
  });
}
