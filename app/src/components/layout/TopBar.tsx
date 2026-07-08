"use client";

import Image from "next/image";
import { useMemo, useState, useRef, useEffect, useEffectEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { authClient } from "@/lib/auth-client";
import {
  useNotifications,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
  useMarkNotificationAsRead,
  type NotificationItem,
} from "@/lib/hooks/use-notifications";
import {
  consolidateNotifications,
  type ConsolidatedNotification,
  type NotificationLike,
} from "@/lib/notifications/grouping";
import { isDemoUser, type UserLike } from "@/lib/demo-gating";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import AccountStatusBadge from "@/components/layout/AccountStatusBadge";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useScrollDirection } from "@/lib/hooks/use-scroll-direction";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock3,
  CreditCard,
  LogOut,
  Settings,
  Shield,
  User,
  Users,
  LayoutDashboard,
  FolderOpen,
  Plus,
} from "lucide-react";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import FeedbackTriggerButton from "@/components/feedback/FeedbackTriggerButton";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PANEL_RETURN_KEY = "adscale:panel-return";

const CAMPAIGN_DETAIL_PATH_REGEX = /^\/campaigns\/[^/]+$/;

interface RouteTitleArgs {
  pathname: string;
  /** Translated campaign-name override set by /campaigns/[id] (or "" when not on a detail page). */
  campaignDetailTitle: string;
  tNav: (k: string) => string;
  tCommon: (k: string) => string;
  tSettings: (k: string) => string;
  tAssistant: (k: string) => string;
  tLibrary: (k: string) => string;
}

export function deriveRouteTitle({
  pathname,
  campaignDetailTitle,
  tNav,
  tCommon,
  tSettings,
  tAssistant,
  tLibrary,
}: RouteTitleArgs): string {
  if (pathname === "/") return tNav("dashboard");

  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) {
    return tAssistant("headerTitle");
  }

  if (pathname === "/campaigns" || pathname === "/campaigns/new") {
    return tCommon("pageTitle");
  }

  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return tLibrary("title");
  }

  if (CAMPAIGN_DETAIL_PATH_REGEX.test(pathname)) {
    return campaignDetailTitle || tCommon("pageTitle");
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    const segments = pathname.split("/").filter(Boolean);
    const tabSegment = segments[1];
    if (tabSegment && tabSegment !== "settings") {
      const key = `${tabSegment}.title`;
      const tabLabel = safeTranslate(tSettings, key);
      if (tabLabel) return `${tSettings("title")} · ${tabLabel}`;
    }
    return tSettings("title");
  }

  const lastSegment = pathname.split("/").filter(Boolean).pop();
  if (lastSegment) {
    return lastSegment
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return tNav("dashboard");
}

function safeTranslate(t: (k: string) => string, key: string): string | null {
  const value = t(key);
  if (!value) return null;
  if (value === key || value.endsWith(`.${key}`)) return null;
  return value;
}

export default function TopBar({
  onMenuClick,
  variant = "floating",
}: {
  onMenuClick?: () => void;
  variant?: "floating" | "inline" | "v6-floating";
}) {
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");
  const tCampaign = useTranslations("campaign");
  const tSettings = useTranslations("settings");
  const tAssistant = useTranslations("assistant.mode");
  const tLibrary = useTranslations("library");
  const tNotificationPanel = useTranslations("notificationPanel");
  const tDemoMode = useTranslations("demoMode");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const { data: session } = authClient.useSession();
  const scrollDirection = useScrollDirection();
  const isMobile = useIsMobile();
  const { data: notificationsData } = useNotifications({
    refetchInterval: 30_000,
  });
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const clearAll = useClearAllNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAppStore((s) => s.user);
  const campaignDetailTitle = useAppStore((s) => s.currentPageTitle);
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
  const isChatMode = pathname.startsWith("/assistant");
  const sessionUserForDemo: UserLike | null = sessionUser
    ? { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name }
    : null;
  const { data: billingStatus } = useBillingStatus();
  const isDemoUserFlag = isDemoUser(sessionUserForDemo);
  const isTesterAccount = billingStatus?.access?.kind === "tester";

  const headerTitle = useMemo(
    () =>
      deriveRouteTitle({
        pathname,
        campaignDetailTitle,
        tNav,
        tCommon,
        tSettings,
        tAssistant,
        tLibrary,
      }),
    [pathname, campaignDetailTitle, tNav, tCommon, tSettings, tAssistant, tLibrary]
  );

  const switchToChat = () => {
    if (!isChatMode) {
      const query = searchParams.toString();
      const returnPath = query ? `${pathname}?${query}` : pathname;
      sessionStorage.setItem(PANEL_RETURN_KEY, returnPath);
    }
    const threadId = searchParams.get("threadId");
    const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
    router.push(`/assistant${query}`);
  };

  const switchToPanel = () => {
    const stored = sessionStorage.getItem(PANEL_RETURN_KEY);
    router.push(stored ?? "/");
  };

  const goToSettings = (tab: string) => {
    router.push(`/settings?tab=${tab}`);
  };

  const isTopBarHidden = isMobile && scrollDirection === "down";
  const isInline = variant === "inline";
  const isV6Floating = variant === "v6-floating";
  const v6ContextLabel = (() => {
    if (pathname.startsWith("/v6/")) {
      if (pathname === "/v6" || pathname.startsWith("/v6/topbar-promo") || pathname.startsWith("/v6/dashboard")) {
        return tNav("dashboard");
      }
      if (pathname.startsWith("/v6/campaign-workspace")) {
        return "Cenbrap em Dobro — Teste";
      }
      if (pathname.startsWith("/v6/campaigns")) {
        return tNav("campaigns");
      }
      if (pathname.startsWith("/v6/library")) {
        return "Biblioteca";
      }
      if (pathname.startsWith("/v6/settings")) {
        return tNav("settings");
      }
      if (
        pathname.startsWith("/v6/chat") ||
        pathname.startsWith("/v6/assistant-empty") ||
        pathname.startsWith("/v6/onboarding")
      ) {
        return tAssistant("headerTitle");
      }
    }
    return headerTitle || tNav("dashboard");
  })();

  return (
    <header
      className={cn(
        isV6Floating
          ? "v6-shell-topbar"
          : isInline
          ? "relative grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--canvas)] px-6 lg:px-8"
          : cn(
              "layer-shell-floating fixed top-0 right-0 left-0 flex items-center justify-between gap-3 sm:gap-4",
              "shell-topbar-height border-b border-[var(--border-dim)] bg-[var(--surface-base)]",
              "transition-transform duration-300 ease-out",
              isDashboard ? "px-4 sm:px-6 lg:px-8" : "px-4 sm:px-6",
              isTopBarHidden && "-translate-y-full"
            )
      )}
    >
      {/* Left: Logo + Navigation */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 overflow-hidden sm:gap-8",
          isV6Floating ? "min-w-0 flex-1 pr-4" : isInline ? "shrink-0" : "flex-1"
        )}
      >
        {isV6Floating ? (
          <p className="truncate text-[13px] text-[var(--text-muted)]">{v6ContextLabel}</p>
        ) : (
        <>
        {/* Logo — scales with viewport while preserving SVG aspect ratio (813×142) */}
        <Link
          href="/"
          className={cn(
            "flex min-w-0 shrink items-center rounded-md py-0.5",
            isInline ? "sm:shrink-0" : "sm:shrink-0 sm:px-2"
          )}
          aria-label="ADScale — Dashboard"
        >
          <Image
            src="/images/logo.svg"
            alt=""
            aria-hidden="true"
            className={cn(
              "topbar-logo block w-auto max-w-full object-contain object-left",
              isInline
                ? "h-5 sm:h-6"
                : "h-[clamp(0.8rem,2.56vw,1.6rem)] sm:h-[1.4rem] md:h-[1.6rem]"
            )}
            style={{ filter: "var(--logo-filter)" }}
            width={813}
            height={142}
            priority
            loading="eager"
            unoptimized
          />
        </Link>

        {!isInline && (
          <>
            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <NavLink href="/" icon={LayoutDashboard} label={tNav("dashboard")} active={pathname === "/"} />
              <NavLink href="/campaigns" icon={FolderOpen} label={tNav("campaigns")} active={pathname.startsWith("/campaigns")} />
              <NavLink href="/settings" icon={Settings} label={tNav("settings")} active={pathname.startsWith("/settings")} />
            </nav>

            {!isDashboard && headerTitle ? (
              <p className="hidden min-w-0 truncate text-sm font-semibold text-[var(--text-primary)] lg:block lg:max-w-[10rem] xl:max-w-xs">
                {headerTitle}
              </p>
            ) : null}
          </>
        )}
        </>
        )}
      </div>

      {/* Center: mode toggle only while in full assistant workspace */}
      {(isInline || isV6Floating) && isChatMode && (
        <div className={cn("flex shrink-0 justify-center px-4", isV6Floating && "flex-none")}>
          <ModeToggle
            isChatMode={isChatMode}
            panelLabel={tAssistant("panel")}
            chatLabel={tAssistant("chat")}
            onSelectPanel={switchToPanel}
            onSelectChat={switchToChat}
            tone={isV6Floating ? "v6" : "default"}
          />
        </div>
      )}

      {/* Right: Actions */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          isInline || isV6Floating ? "min-w-0 flex-1 justify-end gap-2 sm:gap-3" : "gap-2 sm:gap-2.5"
        )}
      >
        {!isInline && !isV6Floating && isChatMode && (
          <ModeToggle
            isChatMode={isChatMode}
            panelLabel={tAssistant("panel")}
            chatLabel={tAssistant("chat")}
            onSelectPanel={switchToPanel}
            onSelectChat={switchToChat}
          />
        )}
        <LanguageSwitcher className="[&_button]:size-9 [&_button]:justify-center [&_button]:gap-0 [&_button]:px-0 sm:[&_button]:h-9 sm:[&_button]:w-auto sm:[&_button]:gap-1 sm:[&_button]:px-2 [&_button_svg]:hidden sm:[&_button_svg]:block" />
        {!isV6Floating && <FeedbackTriggerButton />}

        {isV6Floating && (
          <Link
            href="/docs"
            className="hidden items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)] sm:inline-flex"
          >
            Documentação
          </Link>
        )}

        {(isDashboard || isV6Floating) && (
          <Link
            href="/campaigns?new=1"
            aria-label={tCampaign("new")}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg whitespace-nowrap sm:size-auto sm:h-10 sm:min-h-11 sm:rounded-md sm:px-5 sm:py-2.5 text-sm font-medium text-[var(--deep-bg)]",
              "bg-[var(--accent-green)] transition-colors duration-200 hover:bg-[var(--accent-green-light)]"
            )}
          >
            <Plus size={16} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">+ {tCampaign("new")}</span>
          </Link>
        )}

        {!isDashboard && !isV6Floating && (
          <div className="relative">
            {/* Notification Bell */}
            <button
              ref={(el) => { if (el) bellRef.current = el; }}
              type="button"
              aria-label={`${tCommon("notifications")}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              aria-expanded={notificationsOpen}
              aria-haspopup="dialog"
              onClick={() => setNotificationsOpen((open) => !open)}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-full sm:size-10",
                "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                "hover:bg-[var(--surface-raised)]",
                notificationsOpen && "bg-[var(--surface-raised)] text-[var(--text-primary)]",
                "transition-all duration-200"
              )}
            >
              <Bell size={16} aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-rose)] px-1 text-xs font-semibold text-[var(--deep-bg)]"
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
                  tNotificationPanel={tNotificationPanel}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {!isV6Floating && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-full text-[10px] font-semibold sm:size-10 sm:text-xs",
              "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]",
              "ring-1 ring-[var(--border-medium)] sm:ring-2",
              "hover:ring-[var(--border-medium)] hover:brightness-110",
              "transition-all duration-200"
            )}
            aria-label={tCommon("accountMenu")}
          >
            {initials}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-64 p-2">
            <div className="p-2">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                {displayName}
              </span>
              <span className="block truncate text-xs font-normal text-[var(--text-muted)]">
                {sessionUser?.email || user.email}
              </span>
            </div>
            {(isDemoUserFlag || isTesterAccount) && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                {isDemoUserFlag ? <AccountStatusBadge variant="demo" /> : null}
                {isTesterAccount ? <AccountStatusBadge variant="tester" /> : null}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => goToSettings("profile")} className="cursor-pointer p-2">
              <User size={16} />
              {tSettings("profile.title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("workspace")} className="cursor-pointer p-2">
              <Settings size={16} />
              {tSettings("workspace.title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("team")} className="cursor-pointer p-2">
              <Users size={16} />
              {tSettings("team.title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("billing")} className="cursor-pointer p-2">
              <CreditCard size={16} />
              {tSettings("billingTab")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goToSettings("integrations")} className="cursor-pointer p-2">
              <Shield size={16} />
              {tSettings("integrationsTab")}
            </DropdownMenuItem>
            {isDemoUserFlag && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled
                  className="cursor-not-allowed p-2 opacity-70"
                  title={tDemoMode("restore.stub")}
                >
                  <FolderOpen size={16} />
                  {tDemoMode("restore.label")}
                </DropdownMenuItem>
              </>
            )}
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
              className="cursor-pointer p-2"
            >
              <LogOut size={16} />
              {tNav("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
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
  tNotificationPanel: (key: string, vars?: Record<string, string | number | Date>) => string;
}

function NotificationPanel({ items, onClose, onClear, onMarkAsRead, onMarkAllAsRead, bellRef, tCommon, tNotificationPanel }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closePanel = useEffectEvent(onClose);

	  useEffect(() => {
	    const bell = bellRef.current;
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
        closePanel();
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
	      bell?.focus();
	    };
	  }, [bellRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !bellRef.current?.contains(e.target as Node)
      ) {
        closePanel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [bellRef]);

  return (
    <m.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={tCommon("notifications")}
      tabIndex={-1}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="layer-popover absolute right-0 top-[calc(100%+0.5rem)] z-[var(--layer-popover)] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-[0_24px_80px_rgba(0,0,0,0.1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]"
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
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--accent-green-text)] hover:bg-[var(--accent-green-dim)]"
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
          groupNotificationsByDate(items, tCommon).map((group) => {
            const consolidated = consolidateNotifications(
              group.items as NotificationLike[]
            );
            return (
            <div key={group.label}>
              <div className="sticky top-0 bg-[var(--surface-raised)] px-4 py-1.5 text-xs font-medium text-[var(--text-muted)] border-b border-[var(--border-dim)]">
                {group.label}
              </div>
              {consolidated.map((batch) => {
                const latest = batch.latest;
                const href = batch.campaignId
                  ? `/campaigns/${batch.campaignId}${latest.derivationId ? `?derivation=${latest.derivationId}` : ""}`
                  : "#";
                const Icon = batch.type === "derivation_failed" ? AlertCircle : CheckCircle2;
                const iconColor = batch.type === "derivation_failed"
                  ? "text-[var(--accent-rose)] bg-[var(--accent-rose-dim)]"
                  : batch.allRead
                    ? "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    : "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]";
                const campaignName = campaignNameFromBatch(batch);

                let summary: string;
                if (batch.count === 1) {
                  summary = latest.message;
                } else if (campaignName) {
                  summary = tNotificationPanel("groupSummary.many", { count: batch.count, campaign: campaignName });
                } else {
                  summary = tNotificationPanel("groupSummary.manyNoCampaign", { count: batch.count });
                }

                return (
                  <Link
                    key={batch.key}
                    href={href}
                    onClick={() => {
                      for (const n of batch.notifications) {
                        if (!n.readAt) onMarkAsRead(n.id);
                      }
                    }}
                    className={cn(
                      "flex gap-3 border-b border-[var(--border-dim)] px-4 py-3 last:border-b-0 transition-colors",
                      batch.allRead ? "opacity-60" : "hover:bg-[var(--surface-base)]"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex size-8 items-center justify-center rounded-full shrink-0",
                      iconColor
                    )}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{batch.title}</p>
                      <p className="text-sm text-[var(--text-secondary)]">{summary}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true })}
                        {batch.unreadCount > 0 && batch.count > 1 && (
                          <span className="ml-2">
                            {tNotificationPanel("groupSummary.unreadBadge", { count: batch.unreadCount })}
                          </span>
                        )}
                      </p>
                    </div>
                    {!batch.allRead && (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--accent-green)]" />
                    )}
                  </Link>
                );
              })}
            </div>
            );
          })
        )}
      </div>
    </m.div>
  );
}

function campaignNameFromBatch(batch: ConsolidatedNotification): string | null {
  // Notification messages produced by `app/src/server/jobs/derivation.ts` wrap
  // the campaign name in double quotes. Extract the first quoted segment.
  const message = batch.latest.message ?? "";
  const match = message.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

function groupNotificationsByDate(
  items: NotificationItem[],
  t: (key: string) => string
) {
  const groups: { label: string; items: NotificationItem[] }[] = [];
  const today: NotificationItem[] = [];
  const yesterday: NotificationItem[] = [];
  const thisWeek: NotificationItem[] = [];
  const older: NotificationItem[] = [];

  for (const item of items) {
    const date = new Date(item.createdAt);
    if (isToday(date)) today.push(item);
    else if (isYesterday(date)) yesterday.push(item);
    else if (isThisWeek(date, { weekStartsOn: 1 })) thisWeek.push(item);
    else older.push(item);
  }

  if (today.length) groups.push({ label: t("today") ?? "Hoje", items: today });
  if (yesterday.length) groups.push({ label: t("yesterday") ?? "Ontem", items: yesterday });
  if (thisWeek.length) groups.push({ label: t("thisWeek") ?? "Esta semana", items: thisWeek });
  if (older.length) groups.push({ label: t("older") ?? "Anteriores", items: older });

  return groups;
}

// Navigation Link Component
function ModeToggle({
  isChatMode,
  panelLabel,
  chatLabel,
  onSelectPanel,
  onSelectChat,
  tone = "default",
}: {
  isChatMode: boolean;
  panelLabel: string;
  chatLabel: string;
  onSelectPanel: () => void;
  onSelectChat: () => void;
  tone?: "default" | "v6";
}) {
  const isV6 = tone === "v6";
  return (
    <div
      role="group"
      aria-label="Application mode"
      className={cn(
        "flex items-center p-0.5",
        isV6
          ? "h-8 gap-0.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-base)]"
          : "rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]"
      )}
    >
      <button
        type="button"
        aria-pressed={!isChatMode}
        onClick={onSelectPanel}
        className={cn(
          "rounded-md font-medium transition-colors",
          isV6 ? "h-6 px-3.5 text-xs" : "rounded-md px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs",
          !isChatMode
            ? isV6
              ? "bg-[var(--accent-primary)] font-semibold text-[var(--text-on-accent)] shadow-sm"
              : "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        )}
      >
        {panelLabel}
      </button>
      <button
        type="button"
        aria-pressed={isChatMode}
        onClick={onSelectChat}
        className={cn(
          "flex items-center gap-1.5 rounded-md font-medium transition-colors",
          isV6 ? "h-6 px-3.5 text-xs" : "rounded-md px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs",
          isChatMode
            ? isV6
              ? "bg-[var(--accent-primary)] font-semibold text-[var(--text-on-accent)] shadow-sm"
              : "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        )}
      >
        {chatLabel}
        <span aria-hidden="true" className="rounded bg-[var(--accent-primary)] px-1 py-px font-mono text-[8px] font-semibold leading-none text-[var(--text-on-accent)]">
          NOVO
        </span>
      </button>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
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
