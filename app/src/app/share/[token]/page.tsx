import { notFound } from "next/navigation";
import { validateShareToken } from "@/lib/share-token";
import { db } from "@/server/db";
import { campaigns, derivations } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getPublicUrl } from "@/server/storage/r2";
import GalleryGrid from "./GalleryGrid";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const [link, locale] = await Promise.all([
    validateShareToken(token),
    getLocale(),
  ]);

  if (!link) {
    notFound();
  }

  const [t, [campaign], items] = await Promise.all([
    getTranslations({ locale, namespace: "share" }),
    db
      .select({ name: campaigns.name, client: campaigns.client })
      .from(campaigns)
      .where(eq(campaigns.id, link.campaignId))
      .limit(1),
    db
      .select({
        id: derivations.id,
        outputKey: derivations.outputKey,
        format: derivations.format,
        generationMode: derivations.generationMode,
        variantIndex: derivations.variantIndex,
        ctaText: derivations.ctaText,
        createdAt: derivations.createdAt,
      })
      .from(derivations)
      .where(inArray(derivations.id, link.derivationIds)),
  ]);

  const galleryItems = items.flatMap((d) =>
    d.outputKey
      ? [
          {
            id: d.id,
            imageUrl: getPublicUrl(d.outputKey),
            format: d.format ?? undefined,
            generationMode: d.generationMode ?? undefined,
            variantIndex: d.variantIndex ?? undefined,
            ctaText: d.ctaText ?? undefined,
            createdAt: d.createdAt?.toISOString() ?? undefined,
          },
        ]
      : []
  );

  return (
    <main className="min-h-screen bg-[var(--deep-bg)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            {campaign?.name ?? t("fallbackTitle")}
          </h1>
          {campaign?.client && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {campaign.client}
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {t("sharedVia")}
          </p>
        </div>

        {galleryItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
            <p className="text-sm">{t("noImages")}</p>
          </div>
        ) : (
          <GalleryGrid items={galleryItems} />
        )}

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] opacity-60">
          <span className="font-semibold text-[var(--accent-green)]">ADScale</span>
          <span>·</span>
          <span>{t("publicGallery")}</span>
        </div>
      </div>
    </main>
  );
}
