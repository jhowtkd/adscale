/**
 * Notification grouping helpers (BUG #6 — notification saturation).
 *
 * The triage doc confirmed: `groupNotificationsByDate` in `TopBar.tsx` groups
 * ONLY by date, so 39 identical "Derivação pronta" notifications for the same
 * campaign render as 39 lines. The mark-as-read count invalidation DOES work
 * (`use-notifications.ts:90`) — that sub-claim from the QA report is REFUTED
 * and is not touched here.
 *
 * This module adds a second grouping level: notifications of the same
 * `{type, campaignId}` within a date group collapse into a single consolidated
 * row that reads like "3 novas derivações em 'Cenbrap em Dobro - Teste'".
 * The collapsed row still links to the campaign and stays expandable through
 * the existing per-item read state.
 */

export interface NotificationLike {
  id: string;
  type: string;
  title: string;
  message: string;
  campaignId?: string | null;
  derivationId?: string | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
}

export interface NotificationGroup {
  label: string;
  items: NotificationLike[];
}

export interface ConsolidatedNotification {
  /** Stable key for React: `${type}:${campaignId}` within the date group. */
  key: string;
  /** Underlying notifications that were collapsed. */
  notifications: NotificationLike[];
  type: string;
  campaignId: string | null;
  /** Display title — the shared title if all items share it, else the first. */
  title: string;
  /** Count of collapsed items. */
  count: number;
  /** Count of collapsed items that are still unread. */
  unreadCount: number;
  /** Most recent item (used for timestamp + the link target). */
  latest: NotificationLike;
  /** True when every collapsed item is read. */
  allRead: boolean;
}

export interface ConsolidatedGroup {
  label: string;
  items: ConsolidatedNotification[];
}

/**
 * Group key for collapsing: same type + same campaign within the date group.
 * Notifications without a campaign keep their own bucket (so cross-campaign
 * same-type bursts still collapse, but a campaign-less notification never
 * joins a campaign-bound group).
 */
export function consolidationKey(item: NotificationLike): string {
  return `${item.type}::${item.campaignId ?? "_"}`;
}

/**
 * Collapse a flat list of notifications (already filtered to one date group)
 * into consolidated entries. Items are sorted newest-first before collapsing
 * so `latest` is the most recent.
 *
 * Pure and deterministic — safe to unit test without React.
 */
export function consolidateNotifications(
  items: NotificationLike[]
): ConsolidatedNotification[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  const buckets = new Map<string, ConsolidatedNotification>();
  const order: string[] = [];

  for (const item of sorted) {
    const key = consolidationKey(item);
    const existing = buckets.get(key);
    if (existing) {
      existing.notifications.push(item);
      existing.count += 1;
      if (!item.readAt) existing.unreadCount += 1;
      const itemTime = new Date(item.createdAt).getTime();
      const latestTime = new Date(existing.latest.createdAt).getTime();
      if (itemTime > latestTime) {
        existing.latest = item;
      }
      if (item.title === existing.title) {
        // keep shared title
      } else if (existing.title !== item.title) {
        // titles diverge — fall back to the latest title (most recent surface)
        existing.title = item.title;
      }
      existing.allRead = existing.allRead && Boolean(item.readAt);
      continue;
    }

    order.push(key);
    buckets.set(key, {
      key,
      notifications: [item],
      type: item.type,
      campaignId: item.campaignId ?? null,
      title: item.title,
      count: 1,
      unreadCount: item.readAt ? 0 : 1,
      latest: item,
      allRead: Boolean(item.readAt),
    });
  }

  return order.map((key) => buckets.get(key)!);
}

/**
 * Two-level grouping: outer = date bucket (Today / Yesterday / This week /
 * Older), inner = consolidated by `{type, campaignId}`. The caller supplies
 * the date-bucket function so this module stays free of date-fns / i18n
 * dependencies and is trivially testable.
 */
export function groupAndConsolidateNotifications(
  items: NotificationLike[],
  dateGroups: NotificationGroup[]
): ConsolidatedGroup[] {
  return dateGroups.map((group) => ({
    label: group.label,
    items: consolidateNotifications(group.items),
  }));
}
