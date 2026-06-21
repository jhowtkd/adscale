import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { getSession } from "@/server/auth/session";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user?.email || !isPlatformOwnerEmail(session.user.email)) {
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}
