import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { GuestStudioEntry } from "@/components/guest-home/GuestStudioEntry";
import { GuestWorkspacePending } from "@/components/guest-home/GuestWorkspacePending";
import { parseGuestHandoff } from "@/lib/guest-home/handoff";
import { AUTH_ERROR_CODES, isWorkspaceAuthError } from "@/server/auth/errors";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

/**
 * Dashboard root with the authenticated guest entry (#442). With no draft
 * parameter the Studio is unchanged. A guest handoff renders the review
 * panel after the existing workspace guard; the guard itself is never
 * weakened — noWorkspace on the normal path still throws as before.
 */
export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const handoff = parseGuestHandoff(params);
  const importEnabled = env.PUBLIC_STUDIO_IMPORT_ENABLED === "true";

  if (handoff.kind !== "none") {
    const access = await guestAccessOrPending(params);
    if (access.pendingRetry !== null) {
      return <GuestWorkspacePending retryHref={access.pendingRetry} />;
    }
    const conflictHrefs =
      handoff.kind === "conflict"
        ? {
            openExisting: `/${withoutGuestDraft(params)}`,
            continueWithGuest: `/${guestOnly(params, handoff.id)}`,
          }
        : undefined;
    return (
      <GuestStudioEntry
        handoff={handoff}
        userId={access.userId}
        workspaceId={access.workspaceId}
        importEnabled={importEnabled}
        attachmentsEnabled={env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED === "true"}
        conflictHrefs={conflictHrefs}
      />
    );
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

/**
 * Workspace guard for the guest path. noWorkspace becomes a recoverable
 * retry destination (the draft and continuation survive); anything else
 * rethrows — the guard is never weakened.
 */
async function guestAccessOrPending(
  params: DashboardSearchParams,
): Promise<
  | { userId: string; workspaceId: string; pendingRetry: null }
  | { userId: null; workspaceId: null; pendingRetry: string }
> {
  try {
    const access = await requireWorkspaceAccess();
    return {
      userId: access.user.id,
      workspaceId: access.workspace.id,
      pendingRetry: null,
    };
  } catch (error) {
    if (
      isWorkspaceAuthError(error) &&
      error.code === AUTH_ERROR_CODES.noWorkspace
    ) {
      return {
        userId: null,
        workspaceId: null,
        pendingRetry: `/${withoutGuestDraft(params, true)}`,
      };
    }
    throw error;
  }
}

/**
 * Rebuild the current query string, optionally keeping the guestDraft pair.
 * Used for no-change retries and conflict destinations; never injects
 * workspace or brand identity.
 */
function withoutGuestDraft(
  params: DashboardSearchParams,
  keepGuestDraft = false,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "guestDraft" && !keepGuestDraft) continue;
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Continuation choice for conflicted handoffs: the guest draft plus its
 * navigation hints, minus any open work, template, or campaign. Never
 * injects workspace or brand identity.
 */
function guestOnly(params: DashboardSearchParams, id: string): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "workId" || key === "templateId" || key === "campaignId") {
      continue;
    }
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    }
  }
  search.set("guestDraft", id);
  return `?${search.toString()}`;
}
