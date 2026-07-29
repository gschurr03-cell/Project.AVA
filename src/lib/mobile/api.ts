import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const MOBILE_API_VERSION = "v1";
export const MOBILE_CONTRACT_VERSION = "ava-mobile-api-v1";
export const MOBILE_MAX_UPLOAD_BYTES = Number(process.env.MOBILE_MAX_UPLOAD_BYTES ?? 536_870_912);
export const MOBILE_UPLOAD_TTL_SECONDS = Number(process.env.MOBILE_UPLOAD_TTL_SECONDS ?? 900);
export const MOBILE_CONTENT_TYPES = ["video/quicktime", "video/mp4"] as const;

export type MobileErrorCode =
  | "AUTH_REQUIRED" | "AUTH_EXPIRED" | "FORBIDDEN" | "RESOURCE_NOT_FOUND"
  | "UPLOAD_EXPIRED" | "UPLOAD_INVALID" | "UPLOAD_INCOMPLETE"
  | "ANALYSIS_NOT_READY" | "ANALYSIS_FAILED" | "RESULT_NOT_ACTIVE"
  | "RESOURCE_CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "DELETION_PENDING";

export class MobileAPIError extends Error {
  constructor(
    readonly status: number,
    readonly code: MobileErrorCode,
    message: string,
    readonly retryable = false,
    readonly retryAfterSeconds: number | null = null,
  ) { super(message); }
}

export function requestID(request: NextRequest) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[a-zA-Z0-9-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}

export function mobileResponse<T>(
  requestId: string,
  data: T,
  status = 200,
  resourceVersion: string | null = null,
) {
  return NextResponse.json({
    data,
    error: null,
    meta: {
      requestId,
      serverTime: new Date().toISOString(),
      apiVersion: MOBILE_API_VERSION,
      resourceVersion,
      retryable: false,
      retryAfterSeconds: null,
    },
  }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

export function mobileError(requestId: string, error: unknown) {
  const safe = error instanceof MobileAPIError
    ? error
    : new MobileAPIError(500, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", true);
  console.error(JSON.stringify({
    level: "error", service: "mobile-api", requestId, code: safe.code,
    retryable: safe.retryable, message: safe.message,
  }));
  return NextResponse.json({
    data: null,
    error: { code: safe.code, message: safe.message },
    meta: {
      requestId, serverTime: new Date().toISOString(), apiVersion: MOBILE_API_VERSION,
      resourceVersion: null, retryable: safe.retryable,
      retryAfterSeconds: safe.retryAfterSeconds,
    },
  }, {
    status: safe.status,
    headers: {
      "x-request-id": requestId,
      "cache-control": "no-store",
      ...(safe.retryAfterSeconds ? { "retry-after": String(safe.retryAfterSeconds) } : {}),
    },
  });
}

export async function withMobileRoute(
  request: NextRequest,
  handler: (context: { requestId: string }) => Promise<NextResponse>,
) {
  const id = requestID(request);
  try {
    if (process.env.MOBILE_API_ENABLED !== "true") {
      throw new MobileAPIError(503, "SERVICE_UNAVAILABLE", "The mobile API is not enabled.", true, 30);
    }
    const response = await handler({ requestId: id });
    console.info(JSON.stringify({ level: "info", service: "mobile-api", requestId: id, result: response.status }));
    return response;
  } catch (error) {
    return mobileError(id, error);
  }
}

function publicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function mobileService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authenticateMobile(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new MobileAPIError(401, "AUTH_REQUIRED", "Sign in is required.");
  }
  const token = header.slice(7);
  const { data, error } = await publicClient().auth.getUser(token);
  if (error || !data.user) throw new MobileAPIError(401, "AUTH_EXPIRED", "Your session has expired.");
  const service = mobileService();
  const { data: profile } = await service.from("profiles").select("id,role,full_name").eq("id", data.user.id).single();
  if (!profile) throw new MobileAPIError(403, "FORBIDDEN", "This account is not enabled.");
  const { data: athlete } = await service.from("athletes").select("id,full_name,sex,date_of_birth,height_cm,weight_kg")
    .eq("user_id", data.user.id).single();
  if (!athlete) throw new MobileAPIError(403, "FORBIDDEN", "No athlete profile is assigned to this account.");
  return { user: data.user, profile, athlete, service, accessToken: token };
}

export const uploadCreateSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(MOBILE_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MOBILE_MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().uuid(),
  metadata: z.object({
    nominalFps: z.number().positive().nullable(),
    measuredFps: z.number().positive().nullable(),
    durationSeconds: z.number().positive().max(60),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
}).strict();

export const analysisCreateSchema = z.object({
  uploadId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  analysisType: z.enum(["fly", "acceleration"]).default("fly"),
}).strict();

export function safeFilename(value: string) {
  const extension = value.toLowerCase().endsWith(".mp4") ? ".mp4" : ".mov";
  return `source${extension}`;
}

export function stableFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function mapJobState(status: string | null, analysisStatus: string) {
  if (analysisStatus === "complete") return "completed";
  if (analysisStatus === "failed") return "failed";
  switch (status) {
    case "queued": case "retry_scheduled": return "queued";
    case "claimed": case "downloading": case "validating": return "validating";
    case "processing": case "generating_results": case "uploading_artifacts": return "processing";
    case "completing": return "awaiting_activation";
    case "failed": case "dead_lettered": return "failed";
    case "cancelled": return "unsupported";
    default: return "queued";
  }
}

export function safeMobileResult(analysis: {
  id: string; session_id: string; status: string; model_version: string; metrics: unknown;
  provenance: unknown; result_payload: unknown; completed_at: string | null;
  analysis_pipeline_version: string | null; metric_schema_version: string | null;
}) {
  if (analysis.status !== "complete" || !analysis.result_payload || !analysis.provenance) {
    throw new MobileAPIError(409, "RESULT_NOT_ACTIVE", "The result is not active yet.", true, 5);
  }
  const payload = analysis.result_payload as Record<string, unknown>;
  if (payload.analysisId !== analysis.id) {
    throw new MobileAPIError(409, "RESULT_NOT_ACTIVE", "The active result failed its integrity check.");
  }
  const metrics = (analysis.metrics ?? {}) as Record<string, unknown>;
  const allowed = ["zoneTimeS", "averageVelocityMps", "avgStepLengthM", "combinedStepFrequencyHz"];
  const safeMetrics = allowed.flatMap((key) => {
    const value = metrics[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? [{ key, value, state: "derived" as const }]
      : [];
  });
  const manifest = {
    analysisId: analysis.id,
    sessionId: analysis.session_id,
    analysisEngineVersion: analysis.analysis_pipeline_version,
    poseVersion: analysis.model_version,
    metricVersion: analysis.metric_schema_version,
    activatedAt: analysis.completed_at,
    fingerprint: stableFingerprint({
      id: analysis.id, payload: analysis.result_payload, provenance: analysis.provenance,
      completedAt: analysis.completed_at,
    }),
  };
  return {
    contractVersion: "ava-mobile-safe-result-v1",
    status: "completed",
    manifest,
    metrics: safeMetrics,
    unavailableMetrics: ["peakVelocity", "contactTime", "leftRightStepFrequency"],
    recordingQuality: payload.recordingQuality ?? { state: "not_evaluated" },
    confidence: payload.confidence ?? { level: "notEvaluated", explanation: "Confidence was not available." },
    summary: "AVA measured this sprint recording using the active analysis result. Review confidence and unavailable fields before drawing conclusions.",
    limitations: [
      "Video analysis does not diagnose strength, muscle imbalance, injury, or medical conditions.",
      "Additional testing is required to identify strength, mobility, timing, or technical contributors.",
    ],
  };
}
