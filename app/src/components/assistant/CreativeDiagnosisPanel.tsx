"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { useGuidedFlowCommand } from "@/lib/hooks/use-guided-flow-commands";

export interface CreativeDiagnosisPanelProps {
  threadId: string;
  guidedFlow: GuidedFlow;
  presentation?: GuidedFlowPresentation;
}

export default function CreativeDiagnosisPanel({
  threadId,
  guidedFlow,
  presentation,
}: CreativeDiagnosisPanelProps) {
  const t = useTranslations("assistant.guidedFlow.existingCreative");
  const command = useGuidedFlowCommand(threadId);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingAssumption, setEditingAssumption] = useState<number | null>(null);

  const revision = presentation?.revision ?? guidedFlow.revision ?? 0;
  const diagnosisReview = presentation?.diagnosisReview;
  const diagnosis = (guidedFlow.slots?.diagnosis ?? {}) as {
    detectedConcept?: string;
    elementsToPreserve?: string[];
    variationOpportunities?: string[];
  };
  const assumptions = diagnosisReview?.assumptions ??
    (Array.isArray(guidedFlow.slots?.assumptions)
      ? (guidedFlow.slots.assumptions as string[])
      : []);
  const missingFields = diagnosisReview?.missingFields ?? guidedFlow.missingFields ?? [];
  const recommended =
    typeof guidedFlow.slots?.recommendedAction === "string"
      ? guidedFlow.slots.recommendedAction
      : "quick_restyle";

  const runCommand = async (
    body: Parameters<typeof command.mutateAsync>[0]["command"]
  ) => {
    await command.mutateAsync({
      commandId: crypto.randomUUID(),
      expectedRevision: revision,
      command: body,
    });
  };

  return (
    <div
      className="mx-4 mt-2 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="creative-diagnosis-panel"
      role="region"
      aria-label={t("diagnosisTitle")}
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{t("diagnosisTitle")}</p>

      {diagnosis.detectedConcept ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          <span className="font-medium">{t("observedFacts")}: </span>
          {diagnosis.detectedConcept}
        </p>
      ) : null}

      {assumptions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {t("assumptions")}
          </p>
          <ul className="mt-1 space-y-2 text-xs text-[var(--text-secondary)]">
            {assumptions.map((item, index) => (
              <li key={`${index}-${item}`} className="flex flex-wrap items-center gap-2">
                {editingAssumption === index ? (
                  <>
                    <Input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-8 max-w-xs text-xs" aria-label={`Corrigir hipótese ${index + 1}`} />
                    <Button type="button" size="sm" variant="outline" disabled={!draft.trim() || command.isPending} onClick={() => void runCommand({ type: "correct_diagnosis_assumption", index, value: draft.trim() }).then(() => setEditingAssumption(null))}>Salvar</Button>
                  </>
                ) : (
                  <><span>{item}</span><Button type="button" size="sm" variant="ghost" onClick={() => { setEditingAssumption(index); setDraft(item); }}>Corrigir</Button></>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingFields.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {t("uncertainFields")}
          </p>
          {missingFields.map((field) => (
            <div key={field} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">{field}</span>
              {editingField === field ? (
                <>
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-8 max-w-xs text-xs"
                    aria-label={t("correctField", { field })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={command.isPending || !draft.trim()}
                    onClick={() =>
                      void runCommand({
                        type: "correct_diagnosis_field",
                        field,
                        value: draft.trim(),
                      }).then(() => setEditingField(null))
                    }
                  >
                    {t("saveCorrection")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingField(field);
                    setDraft("");
                  }}
                >
                  {t("correct")}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        {t("recommendedAction", { action: recommended })}
      </p>

      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={command.isPending}
        onClick={() => void runCommand({ type: "approve_diagnosis" })}
        data-testid="acknowledge-diagnosis"
      >
        {t("confirmDiagnosis")}
      </Button>
    </div>
  );
}
