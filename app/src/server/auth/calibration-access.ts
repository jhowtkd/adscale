import { requirePlatformOwner } from "./require-platform-owner";

export type CalibrationAccessScope = "platform-owner";

export interface CalibrationAccessResult {
  user: { id: string; email: string; name?: string | null; image?: string | null };
  scope: CalibrationAccessScope;
  workspaceId?: string;
}

export async function requireCalibrationAccess(
  request: Request,
  requestedWorkspaceId?: string | null
): Promise<CalibrationAccessResult> {
  // Kept for route compatibility; calibration access is global and never workspace-scoped.
  void requestedWorkspaceId;
  const { user } = await requirePlatformOwner(request);
  return { user, scope: "platform-owner" };
}
