import DashboardShellSwitcher from "@/components/layout/DashboardShellSwitcher";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShellSwitcher>{children}</DashboardShellSwitcher>;
}
