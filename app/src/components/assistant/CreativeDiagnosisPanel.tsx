"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import { useAcknowledgeExistingDiagnosis } from "@/lib/hooks/use-existing-creative-path";

interface DiagnosisShape {
  detectedConcept?: string;
  elementsToPreserve?: string[];
  variationOpportunities?: string[];
}

export interface CreativeDiagnosisPanelProps {
  threadId: string;
  guidedFlow: GuidedFlow;
}

export default function CreativeDiagnosisPanel({
  threadId,
  guidedFlow,
}: CreativeDiagnosisPanelProps) {
  const t = useTranslations("assistant.guidedFlow.existingCreative");
  const acknowledge = useAcknowledgeExistingDiagnosis(threadId);

  const diagnosis = (guidedFlow.slots?.diagnosis ?? {}) as DiagnosisShape;
  const assumptions = Array.isArray(guidedFlow.slots?.assumptions)
    ? (guidedFlow.slots.assumptions as string[])
    : [];
  const missingFields = guidedFlow.missingFields ?? [];
  const recommended =
    typeof guidedFlow.slots?.recommendedAction === "string"
      ? guidedFlow.slots.recommendedAction
      : "quick_restyle";

  return (
    <div
      className="mx-4 mt-2 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="creative-diagnosis-panel"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{t("diagnosisTitle")}</p>

      {diagnosis.detectedConcept ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {diagnosis.detectedConcept}
        </p>
      ) : null}

      {assumptions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {t("assumptions")}
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--text-secondary)]">
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnosis.elementsToPreserve && diagnosis.elementsToPreserve.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {t("preserve")}
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--text-secondary)]">
            {diagnosis.elementsToPreserve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnosis.variationOpportunities &&
      diagnosis.variationOpportunities.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {t("opportunities")}
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--text-secondary)]">
            {diagnosis.variationOpportunities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingFields.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t("missing", { fields: missingFields.join(", ") })}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        {t("recommendedAction", { action: recommended })}
      </p>

      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={acknowledge.isPending}
        onClick={() => void acknowledge.mutateAsync()}
        data-testid="acknowledge-diagnosis"
      >
        {t("confirmDiagnosis")}
      </Button>
    </div>
  );
}
