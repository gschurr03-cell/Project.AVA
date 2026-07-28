import { NextRequest } from "next/server";

import {
  MobileAPIError, authenticateMobile, mobileResponse, safeMobileResult, withMobileRoute,
} from "@/lib/mobile/api";

export async function GET(request: NextRequest, context: { params: Promise<{ analysisId: string }> }) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, athlete, service } = await authenticateMobile(request);
    const { analysisId } = await context.params;
    const { data: link } = await service.from("mobile_analysis_requests").select("analysis_id")
      .eq("analysis_id", analysisId).eq("user_id", user.id).eq("athlete_id", athlete.id).maybeSingle();
    if (!link) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Result was not found.");
    const { data: analysis } = await service.from("analyses").select(
      "id,session_id,status,model_version,metrics,provenance,result_payload,completed_at,analysis_pipeline_version,metric_schema_version",
    ).eq("id", analysisId).single();
    if (!analysis) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Result was not found.");
    return mobileResponse(requestId, safeMobileResult(analysis), 200, "ava-mobile-safe-result-v1");
  });
}
