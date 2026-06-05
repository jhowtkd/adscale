import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api-response";
import {
  getBetaAllowanceSummary,
  getWorkspaceBillingAccess,
} from "@/server/billing/access";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getBillingCustomerByWorkspace } from "@/server/repositories/billing";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const [customer, access] = await Promise.all([
      getBillingCustomerByWorkspace(workspace.id),
      getWorkspaceBillingAccess(workspace.id),
    ]);

    const subscription = access.subscription;
    const betaSummary =
      access.kind === "beta" && access.remainingAds !== null
        ? getBetaAllowanceSummary(access.remainingAds)
        : null;

    return NextResponse.json({
      billing: {
        hasCustomer: Boolean(customer),
        access: {
          kind: access.kind,
          label: access.label,
          remainingAds: access.remainingAds,
          beta: betaSummary,
        },
        subscription: subscription
          ? {
              status: subscription.status,
              planKey: subscription.planKey,
              currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
        creditBalance: access.creditBalance,
      },
    });
  } catch (error) {
    return handleApiError(error, "billing.status.GET");
  }
}
