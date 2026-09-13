import DashboardShellSwitcher from "@/components/layout/DashboardShellSwitcher";
import AdminAgentation from "@/components/admin/AdminAgentation";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const canAnnotate = !!session?.user?.email && isPlatformOwnerEmail(session.user.email);

  return (
    <>
      <DashboardShellSwitcher>{children}</DashboardShellSwitcher>
      {canAnnotate && <AdminAgentation />}
    </>
  );
}
