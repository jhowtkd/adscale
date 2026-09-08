import { logger } from "@/lib/logger";
import { getWorkspaceActorUserId } from "../repositories/workspace";
import { recordBetaAnalyticsEvent } from "./record";

export async function recordShareLinkOpened(input: {
  workspaceId: string;
  campaignId: string | null;
  token: string;
}): Promise<void> {
  const userId = await getWorkspaceActorUserId(input.workspaceId);
  if (!userId) {
    logger.warn("[share-analytics] no workspace actor for share_link_opened", {
      workspaceId: input.workspaceId,
    });
    return;
  }

  await recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId,
    eventKey: "share_link_opened",
    source: "server",
    campaignId: input.campaignId,
    sessionId: null,
    properties: {
      tokenId: input.token.slice(0, 8),
      stage: "share",
      missionKey: "share",
    },
  });
}
