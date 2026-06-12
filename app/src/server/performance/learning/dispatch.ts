import { logger } from "@/lib/logger";
import { recomputeLearningsForCampaign } from "./service";

export async function dispatchLearningRecomputeForCampaign(input: {
  workspaceId: string;
  campaignId: string;
}) {
  try {
    return await recomputeLearningsForCampaign(input);
  } catch (error) {
    logger.warn(
      { error, campaignId: input.campaignId, workspaceId: input.workspaceId },
      "[performance-learning] recompute failed"
    );
    return null;
  }
}
