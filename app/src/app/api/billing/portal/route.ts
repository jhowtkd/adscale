import { NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createPortalSession } from "@/server/billing/sessions";

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const session = await createPortalSession({ workspace });

    if (!session) {
      return apiError("billingCustomerNotFound", 404);
    }

    if (!session.url) {
      return apiError("portalSessionFailed", 500);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error, "billing.portal.POST");
  }
}
