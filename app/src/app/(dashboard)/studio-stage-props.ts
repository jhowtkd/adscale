import type { ComponentProps } from "react";
import type DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import type { PageSearchParams } from "@/lib/studio/composer-href";
import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

/** The Studio stage's props for a workspace: the composer query and the rollout gates, sent as booleans only. */
export function studioStageProps(
  workspaceId: string,
  searchParams: PageSearchParams,
): ComponentProps<typeof DashboardHomeActions> {
  return {
    ...parseDashboardSearchParams(searchParams),
    workspaceId,
    rolloutVariant: resolveStudioRolloutVariant(workspaceId, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT),
    carouselCreationEnabled: isStudioCarouselEnabled(workspaceId, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT),
    entryInterviewEnabled: isStudioEntryInterviewEnabled(workspaceId, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT),
    threeFourCreationEnabled: env.CREATIVE_WORK_34_CREATION_ENABLED === "true",
  };
}
