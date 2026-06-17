import { logger } from "@/lib/logger";
import { recomputeOutputLearningsForCampaign } from "./service";

export async function dispatchOutputLearningRecomputeForCampaign(input: {
  workspaceId: string;
  campaignId: string;
}) {
  try {
    return await recomputeOutputLearningsForCampaign(input);
  } catch (error) {
    logger.warn(
      { error, campaignId: input.campaignId, workspaceId: input.workspaceId },
      "[output-learning] recompute failed"
    );
    return null;
  }
}

export async function dispatchOutputLearningRecomputeBestEffort(input: {
  workspaceId: string;
  clientProfileId?: string | null;
  campaignId: string;
}) {
  if (!input.clientProfileId) {
    return dispatchOutputLearningRecomputeForCampaign({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
    });
  }

  try {
    const { recomputeClientOutputLearnings } = await import("./service");
    return await recomputeClientOutputLearnings({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
  } catch (error) {
    logger.warn(
      {
        error,
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      "[output-learning] recompute failed"
    );
    return null;
  }
}
