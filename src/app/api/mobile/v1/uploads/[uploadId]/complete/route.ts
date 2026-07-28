import { NextRequest } from "next/server";

import { MobileAPIError, authenticateMobile, mobileResponse, withMobileRoute } from "@/lib/mobile/api";

export async function POST(request: NextRequest, context: { params: Promise<{ uploadId: string }> }) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, service } = await authenticateMobile(request);
    const { uploadId } = await context.params;
    const { data: upload } = await service.from("mobile_uploads").select("*")
      .eq("id", uploadId).eq("user_id", user.id).maybeSingle();
    if (!upload) throw new MobileAPIError(404, "RESOURCE_NOT_FOUND", "Upload was not found.");
    if (upload.status === "complete" || upload.status === "analysis_submitted") {
      return mobileResponse(requestId, completionResponse(upload));
    }
    if (new Date(upload.expires_at).getTime() < Date.now()) throw new MobileAPIError(410, "UPLOAD_EXPIRED", "Upload access expired.");
    const slash = upload.object_path.lastIndexOf("/");
    const folder = upload.object_path.slice(0, slash);
    const filename = upload.object_path.slice(slash + 1);
    const { data: objects, error: listError } = await service.storage.from("sprint-videos").list(folder, { search: filename, limit: 10 });
    const object = objects?.find((item) => item.name === filename);
    const size = Number(object?.metadata?.size ?? 0);
    if (listError || !object || size !== Number(upload.expected_bytes)) {
      throw new MobileAPIError(409, "UPLOAD_INCOMPLETE", "The uploaded object could not be verified.", true);
    }
    const { data, error } = await service.from("mobile_uploads").update({
      status: "complete", actual_bytes: size, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", upload.id).eq("status", "initiated").select("id,status,actual_bytes,completed_at").single();
    if (error || !data) throw new MobileAPIError(409, "RESOURCE_CONFLICT", "Upload completion conflicted.");
    return mobileResponse(requestId, completionResponse(data));
  });
}

function completionResponse(upload: Record<string, unknown>) {
  return {
    contractVersion: "ava-mobile-upload-v1",
    id: upload.id,
    status: upload.status,
    actualBytes: upload.actual_bytes ?? null,
    completedAt: upload.completed_at ?? null,
  };
}
