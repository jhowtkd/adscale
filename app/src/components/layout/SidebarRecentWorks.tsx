"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { cn } from "@/lib/utils";

/**
 * Phase 6: recent works from canonical list (campaign + create-post).
 */
export default function SidebarRecentWorks() {
  const tNav = useTranslations("navigation");
  const locale = useLocale();
  const dateLocale = locale.startsWith("pt") ? ptBR : enUS;
  const { data: works = [], isLoading } = useCanonicalWorks();
  const active = useActiveClientProfile();
  const groups = useMemo(() => {
    const names = new Map(active.profiles.map((profile) => [profile.id, profile.name]));
    const grouped = new Map<string, typeof works>();
    for (const work of works) {
      if (!work.resumable) continue;
      const key = work.clientProfileId ?? "unassigned";
      const items = grouped.get(key) ?? [];
      if (items.length < 5) items.push(work);
      grouped.set(key, items);
    }
    return [...grouped].map(([clientProfileId, items]) => ({
      clientProfileId,
      name: clientProfileId === "unassigned"
        ? tNav("unassignedClient")
        : names.get(clientProfileId) ?? tNav("unassignedClient"),
      items,
    }));
  }, [active.profiles, tNav, works]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 px-1"
      data-testid="sidebar-recent-works"
    >
      <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {tNav("recentWorks")}
      </p>

      {isLoading && groups.length === 0 ? (
        <div className="space-y-2 px-1" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)]"
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">
            {tNav("recentWorksEmpty")}
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-xs font-medium text-[var(--selection-text)] hover:underline"
          >
            {tNav("recentWorksCreate")}
          </Link>
        </div>
      ) : (
        <div className="v6-sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto">
          {groups.map((group, index) => (
            <details
              key={group.clientProfileId}
              open={group.clientProfileId === active.activeClientProfileId || (!active.activeClientProfileId && index === 0)}
              className="rounded-[var(--radius-control)]"
            >
              <summary className="cursor-pointer truncate rounded-[var(--radius-control)] px-2 py-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]">
                {group.name}
              </summary>
              <ul className="space-y-1 pb-1 pl-2" role="list">
                {group.items.map((work) => {
                  const formattedDate = formatDistanceToNow(new Date(work.updatedAt), {
                    addSuffix: true,
                    locale: dateLocale,
                  });
                  return (
                    <li key={work.id}>
                      <Link
                        href={work.resumeHref}
                        className={cn(
                          "flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5",
                          "transition-colors hover:bg-[var(--surface-inset)]"
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] font-mono text-xs font-bold text-[var(--utility-icon)]">W</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{work.name}</span>
                          <time className="block text-[10px] text-[var(--text-muted)]" dateTime={work.updatedAt}>{formattedDate}</time>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
