"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { ContinueWorkTarget } from "@/lib/dashboard/resolve-continue-work";
import { useCreativeWork, type CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { cn } from "@/lib/utils";

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function ContinueWorkThumbnail({ outputs, className }: { outputs: CreativeWorkOutput[]; className?: string }) {
  const preview = useMemo(
    () => [...outputs]
      .filter((output) => output.status === "completed" && output.outputKey)
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .at(0) ?? null,
    [outputs],
  );

  return (
    <span
      data-testid="continue-work-thumbnail"
      aria-hidden="true"
      className={cn("grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-inset)]", className)}
    >
      {preview ? <Image src={`/api/creative-work/${preview.workItemId}/outputs/${preview.id}/download`} alt="" width={preview ? 480 : 48} height={preview ? 600 : 48} unoptimized loading="lazy" className="size-full object-cover" /> : <ImageIcon size={18} className="text-[var(--text-muted)]" />}
    </span>
  );
}

export function ContinueWorkCard({
  target,
  brandName,
  density = "row",
}: {
  target: Extract<ContinueWorkTarget, { kind: "work" }>;
  brandName: string;
  density?: "row" | "tile";
}) {
  const t = useTranslations("dashboard.home");
  const creativeWorkId = target.originKind === "creative_work" ? target.originId : null;
  const { data } = useCreativeWork(creativeWorkId);
  const nextAction = data?.preparedPlan
    ? t("continueReviewPlan")
    : target.state === "generating"
      ? t("continueTrackGeneration")
      : target.state === "reviewing"
        ? t("continueReviewPieces")
        : t("continueConfigure");
  const meta = (
    <>
      <span>{target.originKind === "campaign" ? t("continueOriginCampaign") : t("continueOriginCreativeWork")}</span>
      <span aria-hidden="true">·</span>
      <span>{t("continueBrand", { name: brandName })}</span>
      <span aria-hidden="true">·</span>
      <span>{t(`continueStates.${target.state}`)}</span>
      <span aria-hidden="true">·</span>
      <span>{nextAction}</span>
    </>
  );

  if (density === "tile") {
    return (
      <Link
        href={target.href}
        className="group inline-flex max-w-xs items-center gap-2 rounded-full border border-white/15 bg-transparent py-0.5 pl-1 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] hover:bg-white/6"
      >
        <ContinueWorkThumbnail outputs={data?.outputs ?? []} className="size-6 rounded-md border-0 bg-transparent" />
        <span className="min-w-0">
          <span id="continue-work-title" className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("continueWhereLeftOff")}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            <span className="truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{target.name}</span>
            <ArrowRight size={11} className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="sr-only">{meta}</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={target.href}
      className="group grid min-h-16 grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <span className="min-w-0">
        <span id="continue-work-title" className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("continueWhereLeftOff")}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{target.name}</span>
          <ArrowRight size={14} className="shrink-0 text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">{meta}</span>
      </span>
      <ContinueWorkThumbnail outputs={data?.outputs ?? []} />
    </Link>
  );
}
