"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { cn } from "@/lib/utils";

/**
 * Phase 6: recent works from canonical list (campaign + create-post).
 */
export default function SidebarRecentWorks() {
  const tNav = useTranslations("navigation");
  const locale = useLocale();
  const dateLocale = locale.startsWith("pt") ? ptBR : enUS;
  const { data: works = [], isLoading } = useCanonicalWorks();
  const recent = useMemo(
    () => works.filter((w) => w.resumable).slice(0, 7),
    [works]
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 px-1"
      data-testid="sidebar-recent-works"
    >
      <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {tNav("recentWorks")}
      </p>

      {isLoading && recent.length === 0 ? (
        <div className="space-y-2 px-1" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)]"
            />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">
            {tNav("recentWorksEmpty")}
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-[12px] font-medium text-[var(--accent-primary-text)] hover:underline"
          >
            {tNav("recentWorksCreate")}
          </Link>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" role="list">
          {recent.map((work) => {
            const formattedDate = formatDistanceToNow(new Date(work.updatedAt), {
              addSuffix: true,
              locale: dateLocale,
            });

            return (
              <li key={work.id}>
                <Link
                  href={work.resumeHref}
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2",
                    "transition-colors hover:bg-[var(--surface-inset)]"
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] font-mono text-[10px] font-bold text-[var(--accent-primary-text)]">
                    {work.originKind === "creative_work" ? "CP" : "C"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {work.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                      <time dateTime={work.updatedAt}>{formattedDate}</time>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
