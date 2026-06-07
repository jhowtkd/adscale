import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import { exportIndividual, exportAllApproved } from "@/server/services/export";
import { objectStorage } from "@/server/storage";

function emitExportMissionCompleted(input: {
  workspaceId: string;
  userId: string;
  sessionId?: string;
  campaignId?: string;
  derivationId?: string;
  operation: "individual" | "batch";
}) {
  void recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: "mission_completed",
    source: "server",
    campaignId: input.campaignId,
    derivationId: input.derivationId,
    sessionId: input.sessionId,
    properties: {
      missionKey: "export",
      stage: "export",
      operation: input.operation,
    },
  }).catch((err) => {
    logger.warn("[exports.POST] mission_completed analytics failed", err);
  });
}

const bodySchema = z.object({
  type: z.enum(["individual", "batch"]),
  derivationId: z.string().optional(),
  campaignId: z.string().optional(),
  format: z.enum(["png", "jpeg", "webp"]),
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const sessionId = getBetaSessionIdFromRequest(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const { type, derivationId, campaignId, format } = parsed.data;

    if (type === "individual") {
      if (!derivationId) {
        return apiError("derivationIdRequired", 400);
      }
      const { url } = await exportIndividual(objectStorage, derivationId, workspace.id, format);
      emitExportMissionCompleted({
        workspaceId: workspace.id,
        userId: user.id,
        sessionId,
        campaignId,
        derivationId,
        operation: type,
      });
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    if (type === "batch") {
      if (!campaignId) {
        return apiError("campaignIdRequired", 400);
      }
      const { url } = await exportAllApproved(objectStorage, campaignId, workspace.id, format);
      emitExportMissionCompleted({
        workspaceId: workspace.id,
        userId: user.id,
        sessionId,
        campaignId,
        operation: type,
      });
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    return apiError("invalidType", 400);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "No approved derivations" ||
        error.message === "No exportable approved derivations" ||
        error.message === "Derivation has no output file")
    ) {
      return apiError("nothingToExport", 400);
    }

    return handleApiError(error, "exports.POST");
  }
}
