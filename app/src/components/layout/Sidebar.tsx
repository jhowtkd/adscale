"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  FolderOpen,
  LayoutTemplate,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export default function Sidebar() {
  const tNav = useTranslations("navigation");
  const { data: session } = authClient.useSession();

  const workspaceNavItems = [
    { icon: LayoutDashboard, label: tNav("dashboard"), href: "/" },
    { icon: FolderOpen, label: tNav("campaigns"), href: "/campaigns" },
    { icon: LayoutTemplate, label: tNav("templates"), href: "/templates" },
    { icon: Sparkles, label: tNav("restyling"), href: "/restyling" },
  ];

  const accountNavItems = [
    { icon: Settings, label: tNav("settings"), href: "/settings" },
  ];

  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const user = useAppStore((s) => s.user);
  const pathname = usePathname();
  const sessionUser = session?.user;
  const displayName =
    sessionUser?.name?.trim() ||
    `${user.firstName} ${user.lastName}`.trim() ||
    sessionUser?.email ||
    user.email;
  const displayEmail = sessionUser?.email || user.email;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[var(--border-dim)] md:flex",
        "bg-[var(--surface-base)]"
      )}
      style={{ willChange: "width" }}
    >
      {/* Logo Section */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-[var(--border-dim)] overflow-hidden">
        <div className="flex-shrink-0 w-8 h-8 relative">
          <Image
            src="/logo-icon.svg"
            alt="ADScale"
            width={32}
            height={32}
            className="object-contain"
          />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <Image
                src="/logo-wordmark.svg"
                alt="ADScale"
                width={100}
                height={20}
                className="object-contain"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Workspace Section */}
        <div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              >
                {tNav("workspace")}
              </motion.p>
            )}
          </AnimatePresence>
          {sidebarCollapsed && <div className="mb-2" />}
          <div className="space-y-1">
            {workspaceNavItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                collapsed={sidebarCollapsed}
              />
            ))}
          </div>
        </div>

        {/* Account Section */}
        <div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              >
                {tNav("account")}
              </motion.p>
            )}
          </AnimatePresence>
          {sidebarCollapsed && <div className="mb-2" />}
          <div className="space-y-1">
            {accountNavItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                collapsed={sidebarCollapsed}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-[var(--border-dim)] p-3 space-y-2">
        {/* User Profile Mini-Card */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            sidebarCollapsed ? "justify-center" : ""
          )}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-mint-dim)] flex items-center justify-center text-xs font-semibold text-[var(--accent-mint)] ring-2 ring-[var(--border-medium)]">
            {initials}
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden min-w-0"
              >
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {displayEmail}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-[var(--text-muted)] transition-all duration-200",
            "hover:bg-[var(--accent-mint-dim)] hover:text-[var(--text-primary)]",
            sidebarCollapsed ? "justify-center w-full" : "w-full"
          )}
          title={sidebarCollapsed ? tNav("expand") : tNav("collapse")}
        >
          <motion.div
            animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </motion.div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs font-medium"
              >
                {tNav("collapse")}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

// ============================================
// Nav Item Component
// ============================================

interface NavItemProps {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  active: boolean;
  collapsed: boolean;
}

function NavItem({ icon: Icon, label, href, active, collapsed }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-lg h-10 transition-all duration-150 group",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--accent-mint-dim)] hover:text-[var(--text-primary)]"
      )}
    >
      {/* Active left border indicator */}
      {active && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--accent-mint)]"
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <Icon size={20} className="flex-shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm font-medium whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
