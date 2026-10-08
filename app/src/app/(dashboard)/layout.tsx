import RailShell from "@/components/layout/rail/RailShell";
import AdminAgentation from "@/components/admin/AdminAgentation";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { requireWorkspaceAccess, isWorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/workspace";
import { resolveActiveBrand } from "@/server/brands/active-brand";
import type { ActiveBrand } from "@/lib/brands/active-brand";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const canAnnotate = !!session?.user?.email && isPlatformOwnerEmail(session.user.email);
  let activeBrand: ActiveBrand | null = null;
  if (session?.user) {
    try {
      const { workspace } = await requireWorkspaceAccess();
      // Spec 2026-10-07 §3: the rail's brand, read once per request (the page asks the same).
      activeBrand = await resolveActiveBrand(workspace.id);
    } catch (error) {
      if (!isWorkspaceAuthError(error) || error.code !== AUTH_ERROR_CODES.noWorkspace) throw error;
    }
  }

  return (
    <>
      <RailShell activeBrand={activeBrand}>{children}</RailShell>
      {canAnnotate && <AdminAgentation />}
    </>
  );
}
