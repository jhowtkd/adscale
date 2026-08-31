"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";

export type CreativePlanReviewProps = {
  plan: PreparedPlanProjectionV1;
  busy: boolean;
  onEdit: () => void;
  onConfirm: (preparedRevision: string) => void | Promise<void>;
  readOnly?: boolean;
};

const protocolLabels = {
  variations: "variations",
  single: "single",
  format_adaptation: "formatAdaptation",
  restyle: "restyle",
} as const;

export function CreativePlanReview({ plan, busy, onEdit, onConfirm, readOnly = false }: CreativePlanReviewProps) {
  const t = useTranslations("dashboard.home.planReview");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!readOnly) headingRef.current?.focus(); }, [plan.preparedRevision, readOnly]);
  const material = (item: PreparedPlanProjectionV1["materials"][number]) => [item.label, t(`roles.${item.role}`), item.treatment ? t(`treatment.${item.treatment}`) : null].filter(Boolean).join(" · ");
  const values = (items: string[], key: "preserve" | "explore") => items.map((item) => t(`${key}.${item}`)).join(" · ");

  return (
    <section aria-labelledby="creative-plan-review-title" className="mx-auto max-w-4xl space-y-5 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("eyebrow")}</p>
        <h2 ref={headingRef} id="creative-plan-review-title" tabIndex={-1} className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("subtitle")}</p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-medium text-[var(--text-primary)]">{t("objective")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{t(`protocol.${protocolLabels[plan.protocol]}`)}</dd></div>
        <div><dt className="font-medium text-[var(--text-primary)]">{t("materials")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{plan.materials.length ? plan.materials.map(material).join("; ") : t("none")}</dd></div>
        <div><dt className="font-medium text-[var(--text-primary)]">{t("preserveTitle")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{values(plan.preserve, "preserve")}</dd></div>
        <div><dt className="font-medium text-[var(--text-primary)]">{t("exploreTitle")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{values(plan.explore, "explore")}</dd></div>
      </dl>
      <details className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-4 py-3" data-testid="plan-review-adjustments">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">{t("adjustments.title")}</summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-[var(--text-primary)]">{t("format")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{plan.formats.join(" · ")}</dd></div>
          <div><dt className="font-medium text-[var(--text-primary)]">{t("quantity")}</dt><dd className="mt-1 text-[var(--text-secondary)]">{t("pieces", { count: plan.outputCount })}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("adjustments.action")}</p>
      </details>
      {!readOnly ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onEdit} disabled={busy} className="min-h-10 rounded-[var(--radius-control)] border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)]">{t("edit")}</button>
          <button type="button" onClick={() => void onConfirm(plan.preparedRevision)} disabled={busy} className="min-h-10 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 text-sm font-semibold text-[var(--action-primary-text)] disabled:opacity-50">{busy ? t("confirming") : t("confirm")}</button>
        </div> : null}
    </section>
  );
}
