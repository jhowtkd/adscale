"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import V6ShellLayout from "./V6ShellLayout";

export default function DashboardShellSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAssistant = pathname.startsWith("/assistant");

  if (isAssistant) {
    return (
      <V6ShellLayout>
        <div className="v6-shell-main min-h-screen shell-offset-bottom-mobile">{children}</div>
      </V6ShellLayout>
    );
  }

  return <AppShell>{children}</AppShell>;
}
