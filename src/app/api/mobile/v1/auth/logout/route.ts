import { NextRequest } from "next/server";

import { authenticateMobile, mobileResponse, withMobileRoute } from "@/lib/mobile/api";

export async function POST(request: NextRequest) {
  return withMobileRoute(request, async ({ requestId }) => {
    const { service, accessToken } = await authenticateMobile(request);
    await service.auth.admin.signOut(accessToken, "global");
    return mobileResponse(requestId, { signedOut: true });
  });
}
