"use client";

import { useTranslations } from "next-intl";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";

export interface GuidedFlowResumeBannerProps {
  guidedFlow: GuidedFlow;
}

export default function GuidedFlowResumeBanner({
  guidedFlow,
}: GuidedFlowResumeBannerProps) {
  const t = useTranslations("assistant.guidedFlow");

  if (guidedFlow.path === "unclassified") {
    return null;
  }

  const missingCount = guidedFlow.missingFields.length;
  const recoveryMessage =
    guidedFlow.recoverableError &&
    typeof guidedFlow.recoverableError.message === "string"
      ? guidedFlow.recoverableError.message
      : null;

  return (
    <div
      className="mx-4 mt-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3"
      data-testid="guided-flow-resume-banner"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {t("resumeLabel")}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
        {t(`paths.${guidedFlow.path}.title`)}
        {" · "}
        {t(`steps.${guidedFlow.currentStep}`)}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {recoveryMessage ?? (missingCount > 0
          ? t("missingFields", { count: missingCount })
          : t("nextActionHint", { step: t(`steps.${guidedFlow.currentStep}`) }))}
      </p>
    </div>
  );
}
