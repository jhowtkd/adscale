"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import TopBar from "./TopBar";
import Footer from "./Footer";
import { FolderOpen, LayoutDashboard, LayoutTemplate, Settings } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const tNav = useTranslations("navigation");
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--deep-bg)]">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area - full width */}
      <div className="min-h-screen pt-12 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:pt-14 md:pb-0 dot-grid">
        <div className="relative min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-3.5rem)]">
          {children}
        </div>
        <Footer />
      </div>

      {/* Bottom Navigation - Mobile */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Primary mobile navigation"
      >
        <MobileNavItem
          href="/"
          label={tNav("dashboard")}
          icon={LayoutDashboard}
          active={pathname === "/"}
        />
        <MobileNavItem
          href="/campaigns"
          label={tNav("campaigns")}
          icon={FolderOpen}
          active={pathname.startsWith("/campaigns")}
        />
        <MobileNavItem
          href="/templates"
          label={tNav("templates")}
          icon={LayoutTemplate}
          active={pathname.startsWith("/templates")}
        />
        <MobileNavItem
          href="/settings"
          label={tNav("settings")}
          icon={Settings}
          active={pathname.startsWith("/settings")}
        />
      </nav>
    </div>
  );
}

function MobileNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[11px] font-medium sm:text-xs",
        active
          ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
          : "text-[var(--text-secondary)]"
      )}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
