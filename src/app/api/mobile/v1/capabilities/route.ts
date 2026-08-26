import { NextRequest } from "next/server";

import {
  MOBILE_CONTENT_TYPES, MOBILE_MAX_UPLOAD_BYTES, MOBILE_UPLOAD_TTL_SECONDS,
  authenticateMobile, mobileResponse, withMobileRoute,
} from "@/lib/mobile/api";

export async function GET(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    await authenticateMobile(request);
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-capabilities-v1",
      upload: {
        contentTypes: MOBILE_CONTENT_TYPES, maximumBytes: MOBILE_MAX_UPLOAD_BYTES,
        signedUploadLifetimeSeconds: MOBILE_UPLOAD_TTL_SECONDS,
      },
      capture: {
        acceptedClasses: ["validated_60_fps_class", "native_source_class"],
        minimumDetectedFps: 59, analysisFps: 60,
      },
      analysisTypes: ["fly", "acceleration"],
      unavailableMetrics: ["peakVelocity", "contactTime", "leftRightStepFrequency"],
      minimumAppVersion: process.env.MOBILE_MINIMUM_APP_VERSION ?? "0.1.0",
      serviceAvailable: true,
      betaFlags: { training: false, experimental30Fps: false, rtmposeMetrics: false },
      resultManifestVersion: "ava-mobile-safe-result-v1",
    }, 200, "ava-mobile-capabilities-v1");
  });
}
