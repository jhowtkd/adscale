"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { currentVersionOf, itemImageUrl, type PipelineItemJson } from "@/lib/equipe/api";
import { useEquipeItemDetail } from "@/lib/equipe/use-equipe";
import EquipeStatePill from "./EquipeStatePill";
import { captionTitle, formatDateTime } from "./equipe-format";

// One pipeline card: thumbnail, title, the single state pill and the
// deadline. The current version (thumbnail + caption) comes from the same
// item-detail query the overlay uses, so opening it is instant.

export default function PipelineCard({
  accountId,
  view,
}: {
  accountId: string;
  view: PipelineItemJson;
}) {
  const t = useTranslations("equipe.pipeline");
  const locale = useLocale();
  const { data } = useEquipeItemDetail(accountId, view.item.id);
  const version = data ? currentVersionOf(data) : null;
  const image = itemImageUrl(view.item, version);
  const title =
    captionTitle(version?.caption, 60) ??
    data?.batch?.title ??
    view.batch?.title ??
    t("untitledItem");
  const when = formatDateTime(view.item.scheduledFor, locale);
  const deadline = formatDateTime(view.item.deadlineAt ?? data?.batch?.approveByAt ?? null, locale);

  return (
    <Link
      href={`/pipeline?item=${view.item.id}`}
      data-testid={`pipeline-card-${view.item.id}`}
      data-state={view.displayState}
      className="group flex gap-3 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-[var(--border-strong)]"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
        >
          <ImageIcon size={18} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {when ? `${when} · ${title}` : title}
        </span>
        <span>
          <EquipeStatePill state={view.displayState} />
        </span>
        {deadline ? (
          <span className="truncate text-xs text-[var(--text-muted)]">
            {t("decideBy", { date: deadline })}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
