import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { resolveShareToken } from "@/lib/share-token";
import { recordShareLinkOpened } from "@/server/beta-analytics/share-analytics";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { campaigns, derivations } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import GalleryGrid from "./GalleryGrid";
import PieceReview from "./PieceReview";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { isPieceReviewLink } from "@/server/creative-work/external-piece-review";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { listPieceReviewComments } from "@/server/repositories/piece-review";
import type { PieceReviewComment } from "@/server/db/schema";
import { getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "share" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

interface SharePageProps {
  params: Promise<{ token: string }>;
}

function ShareShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="min-h-screen bg-[var(--canvas)]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <Link href="/" className="inline-flex rounded-md py-0.5" aria-label="ADScale">
            <Image
              src="/images/logo.svg"
              alt=""
              aria-hidden="true"
              className="v6-sidebar-logo block h-[22px] w-auto max-w-[130px]"
              width={813}
              height={142}
              priority
              unoptimized
            />
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

function ShareStatus({
  sectionLabel,
  title,
  body,
}: {
  sectionLabel: string;
  title: string;
  body: string;
}) {
  return (
    <ShareShell>
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {sectionLabel}
        </p>
        <h1 className="product-page-title text-[var(--text-primary)]">{title}</h1>
        <p className="max-w-xl text-sm text-[var(--text-secondary)]">{body}</p>
      </header>
    </ShareShell>
  );
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const [resolution, locale] = await Promise.all([
    resolveShareToken(token),
    getLocale(),
  ]);
  const t = await getTranslations({ locale, namespace: "share" });

  if (resolution.status !== "valid") {
    const copy = {
      invalid: { title: t("invalidTitle"), body: t("invalidBody") },
      expired: { title: t("expiredTitle"), body: t("expiredBody") },
      removed: { title: t("removedTitle"), body: t("removedBody") },
    }[resolution.status];
    return <ShareStatus sectionLabel={t("sectionLabel")} {...copy} />;
  }

  const { link } = resolution;

  void recordShareLinkOpened({
    workspaceId: link.workspaceId,
    campaignId: link.campaignId,
    token,
  }).catch((err) => {
    logger.warn("[share page] share_link_opened analytics failed", err);
  });

  if (isPieceReviewLink(link) && link.creativeWorkId && link.outputId) {
    let work: Awaited<ReturnType<typeof getCreativeWork>> = null;
    let comments: PieceReviewComment[] = [];
    let loadFailed = false;
    try {
      [work, comments] = await Promise.all([
        getCreativeWork(link.workspaceId, link.creativeWorkId),
        listPieceReviewComments(link.id),
      ]);
    } catch (error) {
      logger.warn("[share page] piece review unavailable", error);
      loadFailed = true;
    }

    const output = work?.outputs.find((row) => row.id === link.outputId);
    if (loadFailed || !work || !output?.outputKey) {
      return (
        <ShareStatus
          sectionLabel={t("sectionLabel")}
          title={t("unavailableTitle")}
          body={t("unavailableBody")}
        />
      );
    }

    const canApprove = getCreativeWorkSelectionPolicy(output.quality, output.id).selectable;
    return (
      <ShareShell>
        <header className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {t("sectionLabel")}
          </p>
          <h1 className="product-page-title text-[var(--text-primary)]">
            {work.work.title || t("reviewTitle")}
          </h1>
          <p className="max-w-xl text-sm text-[var(--text-muted)]">{t("recipientGuideBody")}</p>
        </header>
        <PieceReview
          token={token}
          outputId={output.id}
          outputVersion={link.outputVersion ?? output.versionNumber}
          imageUrl={`/api/share/${token}/asset/${output.id}`}
          title={work.work.title || t("reviewTitle")}
          canApprove={canApprove}
          history={comments.map((comment) => ({
            id: comment.id,
            outputVersion: comment.outputVersion,
            authorLabel: comment.authorLabel,
            decision: comment.decision,
            body: comment.body,
            area: comment.area,
            createdAt: comment.createdAt.toISOString(),
          }))}
        />
      </ShareShell>
    );
  }

  if (!link.campaignId) {
    return (
      <ShareStatus
        sectionLabel={t("sectionLabel")}
        title={t("unavailableTitle")}
        body={t("unavailableBody")}
      />
    );
  }

  const campaignId = link.campaignId;

  let campaign;
  let items;
  try {
    [[campaign], items] = await Promise.all([
      db
        .select({
          name: campaigns.name,
          client: campaigns.client,
          notes: campaigns.notes,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1),
      link.derivationIds.length > 0
        ? db
            .select({
              id: derivations.id,
              outputKey: derivations.outputKey,
              format: derivations.format,
              generationMode: derivations.generationMode,
              variantIndex: derivations.variantIndex,
              ctaText: derivations.ctaText,
            })
            .from(derivations)
            .where(inArray(derivations.id, link.derivationIds))
        : Promise.resolve([]),
    ]);
  } catch (error) {
    logger.warn("[share page] package unavailable", error);
    return (
      <ShareStatus
        sectionLabel={t("sectionLabel")}
        title={t("unavailableTitle")}
        body={t("unavailableBody")}
      />
    );
  }

  if (!campaign) {
    return (
      <ShareStatus
        sectionLabel={t("sectionLabel")}
        title={t("removedTitle")}
        body={t("removedBody")}
      />
    );
  }

  if (link.derivationIds.length > 0 && items.length === 0) {
    return (
      <ShareStatus
        sectionLabel={t("sectionLabel")}
        title={t("unavailableTitle")}
        body={t("unavailableBody")}
      />
    );
  }

  const galleryItems = items.flatMap((d) =>
    d.outputKey
      ? [
          {
            id: d.id,
            imageUrl: `/api/share/${token}/asset/${d.id}`,
            format: d.format ?? undefined,
            generationMode: d.generationMode ?? undefined,
            variantIndex: d.variantIndex ?? undefined,
            ctaText: d.ctaText ?? undefined,
          },
        ]
      : [],
  );

  return (
    <ShareShell>
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {t("sectionLabel")}
        </p>
        <h1 className="product-page-title text-[var(--text-primary)]">
          {campaign.name ?? t("fallbackTitle")}
        </h1>
        {campaign.client ? (
          <p className="text-sm text-[var(--text-secondary)]">{campaign.client}</p>
        ) : null}
        <p className="max-w-xl text-sm text-[var(--text-muted)]">{t("recipientGuideBody")}</p>
        {campaign.notes ? (
          <p className="max-w-xl text-sm text-[var(--text-secondary)]">{campaign.notes}</p>
        ) : null}
      </header>

      {galleryItems.length === 0 ? (
        <p className="pt-10 text-sm text-[var(--text-muted)]">{t("noImages")}</p>
      ) : (
        <section className="space-y-3 pt-6">
          <p
            role="status"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            {t("occupancy")} · {galleryItems.length}
          </p>
          <GalleryGrid
            items={galleryItems}
            labels={{
              closePreview: t("closePreview"),
              variation: t("variation"),
            }}
          />
        </section>
      )}
    </ShareShell>
  );
}
