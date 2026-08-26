"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AppShell from "./AppShell";
import V6ShellLayout from "./V6ShellLayout";
import { NotificationMenu } from "./TopBar";

export default function DashboardShellSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");
  const isAssistant = pathname.startsWith("/assistant");

  if (isAssistant) {
    return (
      <V6ShellLayout>
        <header className="fixed inset-x-0 top-0 z-[calc(var(--layer-shell-floating)+1)] flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 md:hidden">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{tNav("home")}</Link>
            <Link href="/campaigns" className="text-xs text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{tNav("works")}</Link>
          </div>
          <NotificationMenu />
        </header>
        <main id="main" className="v6-shell-main assistant-shell-host flex min-h-0 flex-col overflow-hidden pb-0">
          {children}
        </main>
      </V6ShellLayout>
    );
  }

  return <AppShell>{children}</AppShell>;
}
