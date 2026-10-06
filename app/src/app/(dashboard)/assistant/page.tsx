import AssistantMain from "@/components/assistant/AssistantMain";
import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import { usesEquipeProduct } from "@/server/equipe/module/free-plan";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { db } from "@/server/db";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import { findEquipeThreadByAssistantThread } from "@/server/equipe/module/threads";
import { z } from "zod";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string | string[] }>;
}) {
  const { threadId: rawThreadId } = await searchParams;
  const threadId = typeof rawThreadId === "string" && rawThreadId.trim() ? rawThreadId : undefined;

  // Compute goal-agent eligibility server-side. The composer treats this as a
  // UX hint; thread creation re-checks eligibility authoritatively.
  let goalAgentEligible = false;
  let equipeWorkspaceId: string | undefined;
  try {
    const { user, workspace } = await requireWorkspaceAccess();
    if (await usesEquipeProduct(workspace.id)) equipeWorkspaceId = workspace.id;
    goalAgentEligible =
      isPlatformOwnerEmail(user.email) ||
      Boolean(await getActiveTesterEntitlementByWorkspace(workspace.id));
  } catch {
    // Eligibility is a hint only; keep the workspace gate if it was resolved.
  }

  if (equipeWorkspaceId) {
    // With the pilot on, only the main conversation and the ones bound to the account open here. A thread of the
    // workspace that no account owns (a creation whose binding was refused) would answer in the classic assistant,
    // outside the Strategist and the free ceiling, so it goes home like an invalid one.
    const thread = threadId && z.string().uuid().safeParse(threadId).success
      ? await getAssistantThreadById(equipeWorkspaceId, threadId)
      : null;
    const owned = thread
      ? await findEquipeThreadByAssistantThread(createPostgresEquipeUnitOfWork(db).repos, equipeWorkspaceId, thread.clientProfileId, thread.id)
      : null;
    if (!thread || !owned) redirect("/");
    return <ConversationScreen threadId={thread.id} />;
  }

  return <AssistantMain threadId={threadId} goalAgentEligible={goalAgentEligible} />;
}
