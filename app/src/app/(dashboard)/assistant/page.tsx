import AssistantMain from "@/components/assistant/AssistantMain";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";

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
  let equipeEnabled = false;
  try {
    const session = await getSession();
    if (session?.user) {
      const workspace = await getWorkspaceForUser(session.user.id);
      if (workspace) {
        equipeEnabled = isEquipeEnabledForWorkspace(workspace.id);
        goalAgentEligible =
          isPlatformOwnerEmail(session.user.email) ||
          Boolean(await getActiveTesterEntitlementByWorkspace(workspace.id));
      }
    }
  } catch {
    // Eligibility is a hint only; default to classic on any failure.
  }

  if (equipeEnabled && !threadId) redirect("/");

  return (
    <AssistantMain threadId={threadId} goalAgentEligible={goalAgentEligible} equipeEnabled={equipeEnabled} />
  );
}
