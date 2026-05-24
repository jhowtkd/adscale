"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { authClient } from "@/lib/auth-client";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import {
  useNotifications,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
  useMarkNotificationAsRead,
  type NotificationItem,
} from "@/lib/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Clock3,
  CreditCard,
  LogOut,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TopBar() {
  const tCommon = useTranslations("common");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const { data: session } = authClient.useSession();
  const { data: dashboardData } = useDashboard();
  const { data: notificationsData } = useNotifications();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const clearAll = useClearAllNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAppStore((s) => s.user);
  const currentPageTitle = useAppStore((s) => s.currentPageTitle);
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
  const notificationItems = notificationsData ?? [];
  const unreadCount = notificationItems.filter((n) => !n.readAt).length;
  const isDashboard = pathname === "/";

  const goToSettings = (tab: string) => {
    router.push(`/settings?tab=${tab}`);
  };

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] z-40 flex items-center justify-between gap-4",
        "border-b border-[var(--border-dim)] bg-[var(--surface-base)]",
        "transition-all duration-300",
        isDashboard ? "h-14 px-8" : "h-14 px-4"
      )}
    >
      {/* Left: Page Title + Subtitle on dashboard */}
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
          {currentPageTitle}
        </h1>
        {isDashboard && dashboardData && (
          <span className="hidden md:inline text-sm text-[var(--text-muted)]">
            {(dashboardData as any).totalCampaigns ?? 0} campanhas, {(dashboardData as any).derivationsThisMonth ?? 0} derivações
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {isDashboard && (
          <>
            <button
              onClick={() => router.push("/campaigns")}
              className={cn(
                "hidden sm:flex items-center gap-2 px-5 py-2.5 text-sm text-[var(--text-secondary)]",
                "border border-transparent rounded-[4px] hover:bg-[var(--surface-raised)] transition-colors"
              )}
            >
              <Search size={16} strokeWidth={1.5} />
              Buscar
            </button>
            <a
              href="/campaigns/new"
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#0a0a0f]",
                "bg-[#2fb67d] rounded-[4px] hover:bg-[#259d6a] transition-colors"
              )}
            >
              + Nova Campanha
            </a>
          </>
        )}

        {!isDashboard && (
          <>
            <LanguageSwitcher />

            {/* Notification Bell */}
            <button
              ref={(el) => { if (el) bellRef.current = el; }}
              type="button"
              aria-label={tCommon("notifications")}
              aria-expanded={notificationsOpen}
              aria-haspopup="dialog"
              onClick={() => setNotificationsOpen((open) => !open)}
              className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-full",
                "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                "hover:bg-[var(--surface-raised)]",
                "transition-all duration-200"
              )}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-rose)] px-1 text-xs font-semibold text-white"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notificationsOpen && (
                <NotificationPanel
                  items={notificationItems}
                  onClose={() => setNotificationsOpen(false)}
                  onClear={() => clearAll.mutate()}
                  onMarkAsRead={(id) => markAsRead.mutate(id)}
                  onMarkAllAsRead={() => markAllAsRead.mutate()}
                  bellRef={bellRef}
                  tCommon={tCommon}
                />
              )}
            </AnimatePresence>
          </>
        )}

        {/* User Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] text-xs font-semibold",
              "ring-2 ring-[var(--border-medium)] cursor-pointer",
              "hover:ring-[var(--border-medium)] hover:brightness-110",
              "transition-all duration-200"
            )}
            aria-label={tCommon("accountMenu")}
          >
            {initials}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-64 p-2">
            <div className="px-2 py-2">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                {displayName}
              </span>
              <span className="block truncate text-xs font-normal text-[var(--text-muted)]">
                {sessionUser?.email || user.email}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => goToSettings("profile")} className="cursor-pointer px-2 py-2">
              <User size={16} />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("workspace")} className="cursor-pointer px-2 py-2">
              <Settings size={16} />
              Workspace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("team")} className="cursor-pointer px-2 py-2">
              <Users size={16} />
              Equipe e permissões
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("billing")} className="cursor-pointer px-2 py-2">
              <CreditCard size={16} />
              Faturamento e custos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("integrations")} className="cursor-pointer px-2 py-2">
              <Shield size={16} />
              Integrações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/login"),
                  },
                });
              }}
              className="cursor-pointer px-2 py-2"
            >
              <LogOut size={16} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ============================================
// Notification Panel with Focus Trap
// ============================================

interface NotificationPanelProps {
  items: NotificationItem[];
  onClose: () => void;
  onClear: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  bellRef: React.RefObject<HTMLButtonElement | null>;
  tCommon: (key: string) => string;
}

function NotificationPanel({ items, onClose, onClear, onMarkAsRead, onMarkAllAsRead, bellRef, tCommon }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    if (panel) {
      const focusable = getFocusableElements(panel);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        panel.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && panel) {
        const focusable = getFocusableElements(panel);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      bellRef.current?.focus();
    };
  }, [onClose, bellRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !bellRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, bellRef]);

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={tCommon("notifications")}
      tabIndex={-1}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="absolute right-16 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-[0_24px_80px_rgba(0,0,0,0.1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-mint)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {tCommon("notifications")}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {items.length} {items.length === 1 ? tCommon("item") : tCommon("items")}
          </p>
        </div>
        {items.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
            >
              {tCommon("markAllAsRead") ?? "Marcar todas"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-base)]"
            >
              {tCommon("clear")}
            </button>
          </div>
        ) : (
          <Clock3 size={16} className="text-[var(--text-muted)]" />
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
            {tCommon("noNotifications")}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.readAt) onMarkAsRead(item.id);
              }}
              className={cn(
                "flex gap-3 border-b border-[var(--border-dim)] px-4 py-3 last:border-b-0 cursor-pointer transition-colors",
                item.readAt ? "opacity-60" : "hover:bg-[var(--surface-base)]"
              )}
            >
              <div className={cn(
                "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                item.readAt
                  ? "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                  : "bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
              )}>
                <Bell size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                <p className="text-sm text-[var(--text-secondary)]">{item.message}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!item.readAt && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent-mint)]" />
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(","))).filter(
    (el) => el.offsetParent !== null
  );
}
