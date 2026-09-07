import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { findBetaAnalyticsEventByPiece } from "@/server/repositories/beta-analytics";
import {
  canonicalCreativeWorkOrigin,
  originFromCreativeWork,
} from "./funnel-events";

export type CreativeWorkValueEventKind = "approved" | "delivered";

export async function recordCreativeWorkValueEvent(input: {
  kind: CreativeWorkValueEventKind;
  userId: string;
  workspaceId: string;
  creativeWorkId: string;
  outputId: string;
  outputKey: string;
  protocol: string;
  origin?: string | null;
  campaignId?: string | null;
  clientProfileId?: string | null;
}): Promise<void> {
  const eventKey = input.kind === "approved"
    ? "creative_work_approved"
    : "creative_work_delivered";
  try {
    const existing = await findBetaAnalyticsEventByPiece({
      workspaceId: input.workspaceId,
      eventKey,
      outputId: input.outputId,
      outputKey: input.outputKey,
    });
    if (existing) return;
    await recordBetaAnalyticsEvent({
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventKey,
      source: "server",
      campaignId: input.campaignId ?? null,
      properties: {
        creativeWorkId: input.creativeWorkId,
        outputId: input.outputId,
        outputKey: input.outputKey,
        protocol: input.protocol,
        origin: canonicalCreativeWorkOrigin(input.origin),
        ...(input.clientProfileId ? { clientProfileId: input.clientProfileId } : {}),
      },
    });
  } catch (error) {
    console.error("recordCreativeWorkValueEvent failed", error);
  }
}

export function valueEventFromCreativeWork(work: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  clientProfileId: string;
  campaignId?: string | null;
  toolKind: string;
}): {
  userId: string;
  workspaceId: string;
  creativeWorkId: string;
  protocol: string;
  origin: ReturnType<typeof originFromCreativeWork>;
  campaignId: string | null;
  clientProfileId: string;
} {
  return {
    userId: work.createdByUserId,
    workspaceId: work.workspaceId,
    creativeWorkId: work.id,
    protocol: work.toolKind,
    origin: originFromCreativeWork(work),
    campaignId: work.campaignId ?? null,
    clientProfileId: work.clientProfileId,
  };
}
