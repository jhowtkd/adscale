import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { billingPlanKeys } from "@/server/billing/plans";
import { createCheckoutSession } from "@/server/billing/sessions";

const checkoutSchema = z.object({
  planKey: z.enum(billingPlanKeys),
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const parsed = checkoutSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const session = await createCheckoutSession({
      workspace,
      user,
      planKey: parsed.data.planKey,
    });

    if (!session.url) {
      return apiError("checkoutSessionFailed", 500);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error, "billing.checkout.POST");
  }
}
