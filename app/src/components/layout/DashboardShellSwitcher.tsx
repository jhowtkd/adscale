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
        <div className="v6-shell-main assistant-shell-host flex min-h-0 flex-col overflow-hidden pb-0">
          {children}
        </div>
      </V6ShellLayout>
    );
  }

  return <AppShell>{children}</AppShell>;
}
