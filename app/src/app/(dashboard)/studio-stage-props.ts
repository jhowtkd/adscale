import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type StudioSearchParams = Record<string, string | string[] | undefined>;

/** The Studio stage's props for a workspace: the composer query and the rollout gates, sent as booleans only. */
export function studioStageProps(workspaceId: string, searchParams: StudioSearchParams) {
  return {
    ...parseDashboardSearchParams(searchParams),
    workspaceId,
    rolloutVariant: resolveStudioRolloutVariant(workspaceId, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT),
    carouselCreationEnabled: isStudioCarouselEnabled(workspaceId, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT),
    entryInterviewEnabled: isStudioEntryInterviewEnabled(workspaceId, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT),
    threeFourCreationEnabled: env.CREATIVE_WORK_34_CREATION_ENABLED === "true",
  };
}
