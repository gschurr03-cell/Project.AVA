import { NextRequest } from "next/server";

import { authenticateMobile, mobileResponse, withMobileRoute } from "@/lib/mobile/api";

export async function GET(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { athlete } = await authenticateMobile(request);
    return mobileResponse(requestId, {
      contractVersion: "ava-mobile-athlete-v1",
      id: athlete.id, displayName: athlete.full_name,
      sex: athlete.sex, dateOfBirth: athlete.date_of_birth,
      heightCm: athlete.height_cm, weightKg: athlete.weight_kg,
    }, 200, "ava-mobile-athlete-v1");
  });
}
