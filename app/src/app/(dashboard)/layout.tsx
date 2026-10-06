import DashboardShellSwitcher from "@/components/layout/DashboardShellSwitcher";
import AdminAgentation from "@/components/admin/AdminAgentation";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { requireWorkspaceAccess, isWorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/workspace";
import { usesEquipeProduct } from "@/server/equipe/module/free-plan";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const canAnnotate = !!session?.user?.email && isPlatformOwnerEmail(session.user.email);
  let homeConversationEnabled = false;
  if (session?.user) {
    try {
      const { workspace } = await requireWorkspaceAccess();
      // A classic paying customer with no live Equipe account keeps the classic shell (ticket 11, part 2).
      homeConversationEnabled = await usesEquipeProduct(workspace.id);
    } catch (error) {
      if (!isWorkspaceAuthError(error) || error.code !== AUTH_ERROR_CODES.noWorkspace) throw error;
    }
  }

  return (
    <>
      <DashboardShellSwitcher homeConversationEnabled={homeConversationEnabled}>{children}</DashboardShellSwitcher>
      {canAnnotate && <AdminAgentation />}
    </>
  );
}
