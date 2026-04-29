"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import Footer from "./Footer";
import { FolderOpen, LayoutDashboard, Settings } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const tNav = useTranslations("navigation");
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const pathname = usePathname();
  const sidebarWidth = sidebarCollapsed ? 64 : 240;

  return (
    <div
      className="min-h-screen bg-[var(--deep-bg)]"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area */}
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className={cn(
          "min-h-screen pt-14 pb-20 md:pb-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:ml-[var(--sidebar-width)]"
        )}
      >
        <div className="p-6 lg:p-8 min-h-[calc(100vh-3.5rem)]">
          {children}
        </div>
        <Footer />
      </motion.main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-3 border-t border-[var(--border-dim)] bg-white/95 px-2 py-2 backdrop-blur md:hidden"
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
        "flex flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium",
        active
          ? "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
          : "text-[var(--text-secondary)]"
      )}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
