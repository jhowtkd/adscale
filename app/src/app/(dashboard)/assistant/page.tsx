import AssistantMain from "@/components/assistant/AssistantMain";
import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
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
    if (isEquipeEnabledForWorkspace(workspace.id)) equipeWorkspaceId = workspace.id;
    goalAgentEligible =
      isPlatformOwnerEmail(user.email) ||
      Boolean(await getActiveTesterEntitlementByWorkspace(workspace.id));
  } catch {
    // Eligibility is a hint only; keep the workspace gate if it was resolved.
  }

  if (equipeWorkspaceId && (
    !threadId || !z.string().uuid().safeParse(threadId).success ||
    !(await getAssistantThreadById(equipeWorkspaceId, threadId))
  )) redirect("/");

  return (
    <AssistantMain threadId={threadId} goalAgentEligible={goalAgentEligible} equipeEnabled={Boolean(equipeWorkspaceId)} />
  );
}
