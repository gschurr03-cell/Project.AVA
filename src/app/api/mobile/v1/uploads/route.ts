import { NextRequest } from "next/server";

import {
  MobileAPIError, MOBILE_UPLOAD_TTL_SECONDS, authenticateMobile, mobileResponse,
  safeFilename, uploadCreateSchema, withMobileRoute,
} from "@/lib/mobile/api";

export async function POST(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { user, athlete, service } = await authenticateMobile(request);
    const parsed = uploadCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new MobileAPIError(422, "UPLOAD_INVALID", "Video metadata was invalid.");
    const fps = parsed.data.metadata.measuredFps ?? parsed.data.metadata.nominalFps ?? 0;
    if (fps < 59) {
      throw new MobileAPIError(422, "UPLOAD_INVALID",
        "This recording is below AVA’s required 60 FPS capture standard. Record again with your camera set to 60 FPS or higher.");
    }
    const { data: existing } = await service.from("mobile_uploads").select("*")
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
    if (existing) {
      const sameLogicalAttempt =
        existing.original_filename === parsed.data.filename &&
        existing.content_type === parsed.data.contentType &&
        Number(existing.expected_bytes) === parsed.data.sizeBytes &&
        existing.client_sha256 === parsed.data.sha256 &&
        JSON.stringify(existing.recording_metadata) === JSON.stringify(parsed.data.metadata);
      if (!sameLogicalAttempt) {
        throw new MobileAPIError(409, "RESOURCE_CONFLICT",
          "This upload attempt does not match the original video.");
      }
      if (existing.status !== "initiated") {
        return mobileResponse(requestId, uploadResponse(existing, null));
      }
      const authorization = await authorizeUpload(service, String(existing.object_path));
      return mobileResponse(requestId, uploadResponse(existing, authorization.signedUrl));
    }

    const uploadId = crypto.randomUUID();
    const objectPath = `${athlete.id}/mobile/${uploadId}/${safeFilename(parsed.data.filename)}`;
    const expiresAt = new Date(Date.now() + MOBILE_UPLOAD_TTL_SECONDS * 1000).toISOString();
    const signed = await authorizeUpload(service, objectPath);
    const { data: upload, error } = await service.from("mobile_uploads").insert({
      id: uploadId, user_id: user.id, athlete_id: athlete.id,
      idempotency_key: parsed.data.idempotencyKey, object_path: objectPath,
      original_filename: parsed.data.filename, content_type: parsed.data.contentType,
      expected_bytes: parsed.data.sizeBytes, client_sha256: parsed.data.sha256,
      recording_metadata: parsed.data.metadata, expires_at: expiresAt,
    }).select("*").single();
    if (error || !upload) throw new MobileAPIError(409, "RESOURCE_CONFLICT", "Upload could not be created.");
    return mobileResponse(requestId, uploadResponse(upload, signed.signedUrl), 201, "ava-mobile-upload-v1");
  });
}

async function authorizeUpload(
  service: Awaited<ReturnType<typeof authenticateMobile>>["service"],
  objectPath: string,
) {
  const { data, error } = await service.storage.from("sprint-videos")
    .createSignedUploadUrl(objectPath);
  if (error || !data) {
    throw new MobileAPIError(503, "SERVICE_UNAVAILABLE",
      "Upload access is unavailable.", true);
  }
  return data;
}

function uploadResponse(upload: Record<string, unknown>, signedUrl: string | null) {
  return {
    contractVersion: "ava-mobile-upload-v1", id: upload.id, status: upload.status,
    uploadUrl: signedUrl, expiresAt: upload.expires_at, expectedBytes: upload.expected_bytes,
  };
}
