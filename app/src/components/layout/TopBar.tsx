"use client";

import { useState, useRef, useEffect, useEffectEvent } from "react";
import { AnimatePresence, m } from "@/components/animations/MotionBoundary";
import {
  useNotifications,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
  useMarkNotificationsAsRead,
  type NotificationItem,
} from "@/lib/hooks/use-notifications";
import {
  consolidateNotifications,
  type ConsolidatedNotification,
  type NotificationLike,
} from "@/lib/notifications/grouping";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Bell, CheckCircle2, AlertCircle, Clock3 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";

/** Accessible notification control: the bell and its panel, used by the rail header. */
export function NotificationMenu({ className }: { className?: string }) {
  const tCommon = useTranslations("common");
  const tNotificationPanel = useTranslations("notificationPanel");
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const { data: items = [] } = useNotifications({ refetchInterval: 30_000 });
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const clearAll = useClearAllNotifications();
  const markAsRead = useMarkNotificationsAsRead((count) =>
    toast.error(tNotificationPanel("markGroupFailed", { count }))
  );
  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={bellRef}
        type="button"
        aria-label={`${tCommon("notifications")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn("relative flex size-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--utility-icon)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", open && "bg-[var(--selection-bg)] text-[var(--selection-text)]")}
      >
        <Bell size={16} aria-hidden="true" />
        {unreadCount > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--info-dot)] px-1 text-[10px] font-semibold text-[var(--text-on-accent)]">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <NotificationPanel
            items={items}
            onClose={() => setOpen(false)}
            onClear={() => clearAll.mutate()}
            onMarkAsRead={(ids) => markAsRead.mutate(ids)}
            onMarkAllAsRead={() => markAllAsRead.mutate()}
            bellRef={bellRef}
            tCommon={tCommon}
            tNotificationPanel={tNotificationPanel}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Notification Panel with Focus Trap
// ============================================

interface NotificationPanelProps {
  items: NotificationItem[];
  onClose: () => void;
  onClear: () => void;
  onMarkAsRead: (ids: string[]) => void;
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
      className="layer-popover absolute right-0 top-[calc(100%+0.5rem)] z-[var(--layer-popover)] flex max-h-[calc(100dvh-5rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-[0_24px_80px_rgba(0,0,0,0.1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-dim)] px-4 py-3">
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
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--selection-text)] hover:bg-[var(--selection-bg)]"
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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                  ? "bg-[var(--danger-bg)] text-[var(--danger-text)]"
                  : "bg-[var(--success-bg)] text-[var(--success-text)]";
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
                      const unreadIds = batch.notifications.filter((n) => !n.readAt).map((n) => n.id);
                      if (unreadIds.length) onMarkAsRead(unreadIds);
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
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--info-dot)]" />
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
