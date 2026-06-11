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

    const subscriptionRecord = access.latestSubscription;
    const betaSummary =
      access.kind === "beta" && access.remainingAds !== null
        ? getBetaAllowanceSummary(access.remainingAds)
        : null;

    return NextResponse.json({
      billing: {
        hasCustomer: Boolean(customer),
        subscriptionStatus: access.subscriptionStatus,
        access: {
          kind: access.kind,
          label: access.label,
          remainingAds: access.remainingAds,
          beta: betaSummary,
        },
        subscription: subscriptionRecord
          ? {
              status: access.subscriptionStatus,
              rawStatus: subscriptionRecord.status,
              planKey: subscriptionRecord.planKey,
              currentPeriodEnd: subscriptionRecord.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subscriptionRecord.cancelAtPeriodEnd,
            }
          : null,
        creditBalance: access.creditBalance,
      },
    });
  } catch (error) {
    return handleApiError(error, "billing.status.GET");
  }
}
