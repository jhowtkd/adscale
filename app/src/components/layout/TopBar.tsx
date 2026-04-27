"use client";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Search,
  Bell,
  Coins,
} from "lucide-react";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export default function TopBar() {
  const user = useAppStore((s) => s.user);
  const currentPageTitle = useAppStore((s) => s.currentPageTitle);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const sidebarWidth = sidebarCollapsed ? 64 : 240;

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
            aria-label="Search campaigns and derivations"
            placeholder="Search campaigns, derivations..."
            className={cn(
              "w-full h-9 pl-9 pr-4 rounded-full text-sm",
              "bg-[var(--surface-raised)] text-[var(--text-primary)]",
              "border border-[var(--border-dim)]",
              "placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)]",
              "transition-all duration-200"
            )}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 pr-4">
        {/* Credit Balance Pill */}
        <div
          className={cn(
            "hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
            "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)]"
          )}
        >
          <Coins size={14} />
          <span>{user.credits} credits</span>
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notification Bell */}
        <button
          type="button"
          aria-label="Notifications"
          className={cn(
            "relative flex items-center justify-center h-9 w-9 rounded-full",
            "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            "hover:bg-[rgba(255,255,255,0.04)]",
            "transition-all duration-200"
          )}
        >
          <Bell size={18} />
          {/* Unread dot */}
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent-rose)]"
          />
        </button>

        {/* User Avatar */}
        <button
          type="button"
          aria-label={`${user.firstName} ${user.lastName} account menu`}
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-full",
            "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)] text-xs font-semibold",
            "ring-2 ring-[var(--border-medium)] cursor-pointer",
            "hover:ring-[var(--border-medium)] hover:brightness-110",
            "transition-all duration-200"
          )}
        >
          {user.firstName[0]}
          {user.lastName[0]}
        </button>
      </div>
    </header>
  );
}
