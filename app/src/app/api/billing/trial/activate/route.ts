import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { activateSignupTrial } from "@/server/billing/trial";

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    if (!user.emailVerified) {
      return apiError("email_unverified", 403);
    }

    await requireRole(workspace.id, user.id, ["owner"]);

    const result = await activateSignupTrial({
      workspaceId: workspace.id,
      userId: user.id,
    });

    if (result.status === "not_eligible") {
      return apiError("trial_not_eligible", 409);
    }

    return NextResponse.json({
      status: result.status,
      entitlement: result.entitlement,
      grant: result.grant,
    });
  } catch (error) {
    return handleApiError(error, "billing.trial.activate.POST");
  }
}
