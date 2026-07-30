"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ImageIcon } from "lucide-react";
import { CreativeComposer } from "@/components/creative-work/CreativeComposer";
import { CreativeToolCards } from "@/components/creative-work/CreativeToolCards";
import { BrandInspirations } from "@/components/creative-work/BrandInspirations";
import { useCreativeComposer, type ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { resolveContinueWork, type ContinueWorkTarget } from "@/lib/dashboard/resolve-continue-work";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCreativeWork, type CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { cn } from "@/lib/utils";

const FAN_CARD_TRANSFORMS = [
  "group-hover:-translate-x-10 group-hover:-rotate-[18deg] group-focus-visible:-translate-x-10 group-focus-visible:-rotate-[18deg]",
  "group-hover:-translate-x-6 group-hover:-rotate-[10deg] group-focus-visible:-translate-x-6 group-focus-visible:-rotate-[10deg]",
  "group-hover:-translate-x-2 group-hover:-rotate-2 group-focus-visible:-translate-x-2 group-focus-visible:-rotate-2",
  "group-hover:translate-x-1 group-hover:rotate-[8deg] group-focus-visible:translate-x-1 group-focus-visible:rotate-[8deg]",
  "group-hover:translate-x-3 group-hover:rotate-[16deg] group-focus-visible:translate-x-3 group-focus-visible:rotate-[16deg]",
] as const;

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function RecentProductionFan({ outputs }: { outputs: CreativeWorkOutput[] }) {
  const previews = useMemo(
    () => [...outputs]
      .filter((output) => output.status === "completed" && output.outputKey)
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .slice(0, 5),
    [outputs],
  );
  const cards: Array<CreativeWorkOutput | null> = previews.length > 0
    ? previews
    : [null, null, null];

  return (
    <span
      data-testid="recent-production-fan"
      aria-hidden="true"
      className="relative h-28 w-24 shrink-0 justify-self-end sm:h-32 sm:w-28 lg:h-36 lg:w-36"
    >
      {cards.map((output, index) => (
        <span
          key={output?.id ?? `placeholder-${index}`}
          style={{ zIndex: cards.length - index }}
          className={cn(
            "absolute right-1 top-1 flex h-24 w-[4.5rem] origin-bottom-left items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-inset)] shadow-[0_8px_24px_-10px_rgba(0,0,0,0.65)] transition-transform duration-500 ease-out motion-reduce:transition-none sm:h-28 sm:w-20 lg:h-32 lg:w-24",
            FAN_CARD_TRANSFORMS[index],
          )}
        >
          {output ? (
            <Image
              src={`/api/creative-work/${output.workItemId}/outputs/${output.id}/download`}
              alt=""
              width={96}
              height={128}
              unoptimized
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon size={20} className="text-[var(--text-muted)]" />
          )}
        </span>
      ))}
    </span>
  );
}

function ContinueWorkCard({
  target,
  href,
  title,
  hint,
}: {
  target: Extract<ContinueWorkTarget, { kind: "work" }>;
  href: string;
  title: string;
  hint: string;
}) {
  const creativeWorkId = target.originKind === "creative_work" ? target.originId : null;
  const { data } = useCreativeWork(creativeWorkId);

  return (
    <Link
      href={href}
      className="group grid min-h-40 grid-cols-[minmax(0,1fr)_6rem] items-center gap-5 overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] sm:min-h-44 sm:grid-cols-[minmax(0,1fr)_8rem] sm:p-7 lg:min-h-48 lg:grid-cols-[minmax(0,1fr)_10rem]"
    >
      <span className="min-w-0">
        <span id="continue-work-title" className="block text-base font-semibold text-[var(--text-primary)] sm:text-lg">{title}</span>
        <span className="mt-2 block truncate text-sm text-[var(--text-secondary)]">{hint}</span>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <ArrowRight size={17} aria-hidden="true" />
        </span>
      </span>
      <RecentProductionFan outputs={data?.outputs ?? []} />
    </Link>
  );
}

export default function DashboardHomeActions({
  workId,
  initialIntent,
  focusComposer = false,
  templateId,
}: {
  workId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: boolean;
  templateId?: string;
}) {
  const t = useTranslations("dashboard.home");
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const { activeProfile } = useActiveClientProfile();
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    initialIntent,
    focusComposer,
    initialTemplateId: templateId,
  });
  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);

  if (isError && works.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t("errorTitle")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
        <button type="button" onClick={() => void refetch()} className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <CreativeToolCards
        selected={composer.intent}
        onSelect={composer.selectIntent}
        headerAction={(
          <ActiveBrandSwitcher
            id="active-client-switcher-home"
            className="mt-0 w-full sm:w-64"
          />
        )}
      />

      <CreativeComposer composer={composer} composerRef={composerRef} />

      <section aria-labelledby="continue-work-title">
        {isLoading && works.length === 0 ? (
          <div className="h-40 animate-pulse rounded-[var(--radius-object)] bg-[var(--surface-raised)] sm:h-44 lg:h-48" aria-hidden="true" />
        ) : continueTarget.kind === "work" ? (
          <ContinueWorkCard
            target={continueTarget}
            href={
              continueTarget.originKind === "creative_work"
              && continueTarget.originId === composer.workId
              && !continueTarget.href.includes("?creativeWork=")
                ? "#creative-composer"
                : continueTarget.href
            }
            title={t("continueWhereLeftOff")}
            hint={t("continueCampaignHint", { name: continueTarget.name })}
          />
        ) : (
          <div className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-5">
            <h2 id="continue-work-title" className="text-sm font-semibold text-[var(--text-primary)]">{t("firstCreationTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("firstCreationPrompt")} {activeProfile?.name ?? ""}
            </p>
          </div>
        )}
      </section>

      <div data-testid="brand-inspirations-slot" className="min-h-16">
        <BrandInspirations clientProfileId={composer.clientProfileId} onAttach={composer.addInspiration} />
      </div>
    </div>
  );
}
