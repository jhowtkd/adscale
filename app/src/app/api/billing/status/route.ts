import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  getBillingCustomerByWorkspace,
} from "@/server/repositories/billing";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const [customer, subscription, grants] = await Promise.all([
      getBillingCustomerByWorkspace(workspace.id),
      getActiveSubscriptionByWorkspace(workspace.id),
      getAvailableCreditGrants(workspace.id),
    ]);
    const creditBalance = grants.reduce((total, grant) => total + grant.remaining, 0);

    return NextResponse.json({
      billing: {
        hasCustomer: Boolean(customer),
        subscription: subscription
          ? {
              status: subscription.status,
              planKey: subscription.planKey,
              currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
        creditBalance,
      },
    });
  } catch (error) {
    return handleApiError(error, "billing.status.GET");
  }
}

