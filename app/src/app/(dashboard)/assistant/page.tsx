import AssistantMain from "@/components/assistant/AssistantMain";
import { getSession } from "@/server/auth/session";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { threadId } = await searchParams;

  // Compute goal-agent eligibility server-side. The composer treats this as a
  // UX hint; thread creation re-checks eligibility authoritatively.
  let goalAgentEligible = false;
  let equipeEnabled = false;
  try {
    const session = await getSession();
    if (session?.user) {
      const workspace = await getWorkspaceForUser(session.user.id);
      if (workspace) {
        goalAgentEligible =
          isPlatformOwnerEmail(session.user.email) ||
          Boolean(await getActiveTesterEntitlementByWorkspace(workspace.id));
        equipeEnabled = isEquipeEnabledForWorkspace(workspace.id);
      }
    }
  } catch {
    // Eligibility is a hint only; default to classic on any failure.
  }

  return (
    <AssistantMain threadId={threadId} goalAgentEligible={goalAgentEligible} equipeEnabled={equipeEnabled} />
  );
}
