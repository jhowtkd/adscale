import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api-response";
import { BetaRedeemError, redeemBetaAccess } from "@/server/billing/beta";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const bodySchema = z.object({
  code: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const { workspace, user } = await requireWorkspaceAccess(request);
    const body = bodySchema.parse(await request.json());

    const result = await redeemBetaAccess({
      workspaceId: workspace.id,
      userId: user.id,
      code: body.code,
    });

    const access = await getWorkspaceBillingAccess(workspace.id);

    return NextResponse.json({
      success: true,
      entitlementId: result.entitlement.id,
      grantId: result.grant.id,
      billing: {
        access: {
          kind: access.kind,
          label: access.label,
          remainingAds: access.remainingAds,
        },
        creditBalance: access.creditBalance,
      },
    });
  } catch (error) {
    if (error instanceof BetaRedeemError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return handleApiError(error, "billing.beta.redeem.POST");
  }
}
