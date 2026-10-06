import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { getTranslations } from "next-intl/server";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { usesEquipeProduct } from "@/server/equipe/module/free-plan";
import { executeCommand } from "@/server/equipe/module/commands";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { isStudioCarouselEnabled, isStudioEntryInterviewEnabled, resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const { user, workspace } = await requireWorkspaceAccess();
  // A classic paying customer with no live Equipe account keeps the classic home: it never opens a free account
  // (ticket 11, part 2).
  if (await usesEquipeProduct(workspace.id)) {
    const t = await getTranslations("assistant");
    if (!user.emailVerified) {
      return <p className="p-6 text-sm text-[var(--text-secondary)]" role="status">{t("homeVerifyEmail")}</p>;
    }
    const opened = await executeCommand(
      createEquipeRouteDeps(workspace.id),
      { actor: { kind: "system", job: "home.first_open" }, workspaceId: workspace.id },
      { type: "open_free_account", payload: { userId: user.id } },
    );
    const threadId = opened.ok ? opened.value.data.assistantThreadId : null;
    if (typeof threadId !== "string" || !threadId) {
      const errorKey = !opened.ok && opened.error.code === "forbidden_actor" ? "homeOwnerFirst" : "homeOpenError";
      return <p className="p-6 text-sm text-[var(--danger-text)]" role="alert">{t(errorKey)}</p>;
    }
    return <ConversationScreen threadId={threadId} />;
  }
  return <DashboardHomeActions
    {...parseDashboardSearchParams(params)}
    workspaceId={workspace.id}
    rolloutVariant={resolveStudioRolloutVariant(workspace.id, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT)}
    carouselCreationEnabled={isStudioCarouselEnabled(workspace.id, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT)}
    entryInterviewEnabled={isStudioEntryInterviewEnabled(workspace.id, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT)}
    threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
  />;
}
