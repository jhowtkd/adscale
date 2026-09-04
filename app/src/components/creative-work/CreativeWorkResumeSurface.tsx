"use client";

import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { CreativeComposer } from "./CreativeComposer";
import { useCreativeComposer, type CreativeComposerViewModel } from "./useCreativeComposer";
import {
  studioChipClass,
  studioChromeBarClass,
  studioInstrumentClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import { cn } from "@/lib/utils";

function pieceTitle(
  composer: CreativeComposerViewModel,
  t: ReturnType<typeof useTranslations<"common">>,
) {
  return composer.workTitle || t("piece");
}

function pieceOccupancy(composer: CreativeComposerViewModel, t: ReturnType<typeof useTranslations<"dashboard.home.composer">>) {
  if (composer.actionPhase === "saving") return t("actionSaving");
  if (composer.actionPhase === "preparing") return t("actionPreparing");
  if (composer.actionPhase === "submitting") return t("actionSubmitting");
  if (composer.actionPhase === "reconciling") return t("actionReconciling");
  if (composer.state === "generating") return t("actionGenerating");
  const outputs = composer.outputs ?? [];
  if (outputs.length === 0) return null;
  const ready = outputs.filter((output) => output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey))).length;
  return t("proposal.progress", { ready, total: outputs.length });
}

export function CreativeWorkResumeSurface({
  workId,
  campaignId = null,
}: {
  workId: string;
  campaignId?: string | null;
}) {
  const t = useTranslations("common");
  const tComposer = useTranslations("dashboard.home.composer");
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    focusComposer: true,
  });
  const occupancy = pieceOccupancy(composer, tComposer);

  return (
    <div className={cn(studioInstrumentClass, "py-0 pb-6")}>
      <div className={studioChromeBarClass}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {t("piece")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {occupancy ? (
            <p
              role="status"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
            >
              {occupancy}
            </p>
          ) : null}
          <Link
            href="/?mode=arte&compose=1&intent=variations&fresh=1"
            className={studioChipClass}
          >
            <Plus size={14} aria-hidden="true" />
            {t("newVariation")}
          </Link>
        </div>
      </div>

      <Link
        href={campaignId ? `/campaigns/${campaignId}` : "/campaigns"}
        className={studioQuietActionClass}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {campaignId ? t("backToCampaign") : t("works")}
      </Link>

      <h1 id="piece-title" className="sr-only">
        {pieceTitle(composer, t)}
      </h1>

      <CreativeComposer composer={composer} composerRef={composerRef} layout="piece" />
    </div>
  );
}
