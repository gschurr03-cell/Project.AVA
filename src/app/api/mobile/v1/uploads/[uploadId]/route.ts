import { NextRequest } from "next/server";

import { MobileAPIError, authenticateMobile, mobileResponse, withMobileRoute } from "@/lib/mobile/api";

export async function GET(request: NextRequest, context: { params: Promise<{ uploadId: string }> }) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, service } = await authenticateMobile(request);
    const { uploadId } = await context.params;
    const { data } = await service.from("mobile_uploads")
      .select("id,status,expected_bytes,actual_bytes,expires_at,analysis_id,created_at,completed_at")
      .eq("id", uploadId).eq("user_id", user.id).maybeSingle();
    if (!data) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Upload was not found.");
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-upload-v1",
      id: data.id,
      status: data.status,
      expectedBytes: data.expected_bytes,
      actualBytes: data.actual_bytes,
      expiresAt: data.expires_at,
      analysisId: data.analysis_id,
      createdAt: data.created_at,
      completedAt: data.completed_at,
    });
  });
}
