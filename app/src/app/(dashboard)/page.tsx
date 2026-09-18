import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import GuestStudioEntry from "@/components/guest-home/GuestStudioEntry";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { AUTH_ERROR_CODES, isWorkspaceAuthError } from "@/server/auth/errors";
import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { readPublicStudioFlags } from "@/lib/public-studio-config";
import { parseGuestHandoff } from "@/lib/guest-home/handoff";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const handoff = parseGuestHandoff(params);
  if (handoff.kind === "guest" || handoff.kind === "conflict") {
    const flags = readPublicStudioFlags(process.env);
    const parsed = parseDashboardSearchParams(params);
    const conflict = handoff.kind === "conflict"
      ? { workId: parsed.workId, templateId: parsed.templateId, campaignId: parsed.campaignId }
      : null;
    let session: { userId: string | null; workspaceId: string | null };
    try {
      const { user, workspace } = await requireWorkspaceAccess();
      session = { userId: user.id, workspaceId: workspace.id };
    } catch (error) {
      if (isWorkspaceAuthError(error) && error.code === AUTH_ERROR_CODES.noWorkspace) {
        session = { userId: null, workspaceId: null };
      } else {
        throw error;
      }
    }
    return <GuestStudioEntry
      guestDraftId={handoff.id}
      userId={session.userId}
      workspaceId={session.workspaceId}
      importEnabled={flags.importEnabled}
      conflict={conflict}
    />;
  }
  const { workspace } = await requireWorkspaceAccess();
  return <DashboardHomeActions
    {...parseDashboardSearchParams(params)}
    workspaceId={workspace.id}
    rolloutVariant={resolveStudioRolloutVariant(workspace.id, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT)}
    carouselCreationEnabled={isStudioCarouselEnabled(workspace.id, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT)}
    entryInterviewEnabled={isStudioEntryInterviewEnabled(workspace.id, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT)}
    threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
  />;
}
