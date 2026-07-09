"use client";

import { Suspense } from "react";
import Link from "next/link";
import BrandKitTab from "@/components/settings/BrandKitTab";
import BrandTrainingWizard from "@/components/brand-training/BrandTrainingWizard";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export default function BrandKitPage() {
  return (
    <Suspense fallback={null}>
      <BrandKitPageContent />
    </Suspense>
  );
}

function BrandKitPageContent() {
  const searchParams = useSearchParams();
  const t = useTranslations("navigation");
  const tSettings = useTranslations("settings");
  const mode = searchParams.get("mode") === "training" ? "training" : "kit";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="product-page-title text-[var(--text-primary)]">{t("brandKit")}</h1>
          <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--warning-text)]">
            {t("brandKitBeta")}
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{t("brandKitHint")}</p>
      </header>

      <div
        role="tablist"
        aria-label={t("brandKit")}
        className="flex gap-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1"
      >
        <ModeLink
          href="/brand-kit"
          active={mode === "kit"}
          label={tSettings("brandKitTab")}
        />
        <ModeLink
          href="/brand-kit?mode=training"
          active={mode === "training"}
          label={tSettings("brandTrainingTab")}
        />
      </div>

      {mode === "training" ? <BrandTrainingWizard /> : <BrandKitTab />}
    </div>
  );
}

function ModeLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex-1 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-center text-sm font-medium transition-colors",
        active
          ? "bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-text)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      )}
    >
      {label}
    </Link>
  );
}
