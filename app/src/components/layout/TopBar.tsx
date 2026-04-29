"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { authClient } from "@/lib/auth-client";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Search,
  Bell,
  Coins,
  Clock3,
} from "lucide-react";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { formatDistanceToNow } from "date-fns";

export default function TopBar() {
  const tCommon = useTranslations("common");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const { data: dashboardData } = useDashboard();
  const user = useAppStore((s) => s.user);
  const currentPageTitle = useAppStore((s) => s.currentPageTitle);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const sidebarWidth = sidebarCollapsed ? 64 : 240;
  const sessionUser = session?.user;
  const displayName =
    sessionUser?.name?.trim() ||
    `${user.firstName} ${user.lastName}`.trim() ||
    sessionUser?.email ||
    user.email;
  const initials = useMemo(() => {
    return (
      displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "U"
    );
  }, [displayName]);
  const notifications = dashboardData?.recentActivity ?? [];

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] z-40 h-14 flex items-center justify-between gap-4",
        "border-b border-[var(--border-dim)] glass-backdrop",
        "transition-all duration-300"
      )}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      {/* Left: Page Title */}
      <div className="flex items-center pl-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
          {currentPageTitle}
        </h1>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex items-center justify-center flex-1 max-w-xs">
        <div className="relative w-full">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            aria-label={tCommon("search")}
            placeholder={tCommon("search")}
            className={cn(
              "w-full h-9 pl-9 pr-4 rounded-full text-sm",
              "bg-[var(--surface-raised)] text-[var(--text-primary)]",
              "border border-[var(--border-dim)]",
              "placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:border-[var(--accent-mint)] focus:ring-2 focus:ring-[rgba(47,182,125,0.15)]",
              "transition-all duration-200"
            )}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="relative flex items-center gap-2 pr-4">
        {/* Credit Balance Pill */}
        <div
          className={cn(
            "hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
            "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
          )}
        >
          <Coins size={14} />
          <span>{user.credits} {tCommon("credits")}</span>
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notification Bell */}
        <button
          type="button"
          aria-label={tCommon("notifications")}
          aria-expanded={notificationsOpen}
          onClick={() => setNotificationsOpen((open) => !open)}
          className={cn(
            "relative flex items-center justify-center h-9 w-9 rounded-full",
            "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            "hover:bg-[var(--surface-raised)]",
            "transition-all duration-200"
          )}
        >
          <Bell size={18} />
          {notifications.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-rose)] px-1 text-[10px] font-semibold text-white"
            >
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </button>

        <AnimatePresence>
          {notificationsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-24 top-11 z-50 w-[360px] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-[0_24px_80px_rgba(0,0,0,0.1)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {tCommon("notifications")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {notifications.length} item{notifications.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Clock3 size={16} className="text-[var(--text-muted)]" />
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                    Nenhuma notificação nova.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3 border-b border-[var(--border-dim)] px-4 py-3 last:border-b-0"
                    >
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]">
                        <Clock3 size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text-primary)]">{item.message}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Avatar */}
        <button
          type="button"
          aria-label={tCommon("accountMenu")}
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-full",
            "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] text-xs font-semibold",
            "ring-2 ring-[var(--border-medium)] cursor-pointer",
            "hover:ring-[var(--border-medium)] hover:brightness-110",
            "transition-all duration-200"
          )}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
