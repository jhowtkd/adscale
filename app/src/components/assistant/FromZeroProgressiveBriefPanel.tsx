"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { useGuidedFlowCommand } from "@/lib/hooks/use-guided-flow-commands";

export interface FromZeroProgressiveBriefPanelProps {
  threadId: string;
  guidedFlow: GuidedFlow;
  presentation?: GuidedFlowPresentation;
}

export default function FromZeroProgressiveBriefPanel({
  threadId,
  guidedFlow,
  presentation,
}: FromZeroProgressiveBriefPanelProps) {
  const t = useTranslations("assistant.guidedFlow.fromZero");
  const tProgressive = useTranslations("assistant.guidedFlow.progressive");
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const command = useGuidedFlowCommand(threadId);

  const revision = presentation?.revision ?? (guidedFlow as GuidedFlow & { revision?: number }).revision ?? 0;
  const prompt = presentation?.prompt;

  const sendCommand = async (
    body: Parameters<typeof command.mutateAsync>[0]["command"]
  ) => {
    setError(null);
    try {
      await command.mutateAsync({
        commandId: crypto.randomUUID(),
        expectedRevision: revision,
        command: body,
      });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  if (guidedFlow.currentStep === "review_brief") {
    const review = presentation?.briefReview;
    return (
      <div
        className="mx-4 mt-2 space-y-3 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
        data-testid="from-zero-brief-review-panel"
      >
        <p className="text-sm font-medium">{tProgressive("reviewTitle")}</p>
        {review
          ? Object.entries(review)
              .filter(([, value]) => value?.trim())
              .map(([key, value]) => (
                <div key={key} className="text-xs">
                  <span className="font-medium text-[var(--text-primary)]">
                    {tProgressive(`fields.${key}` as "fields.product")}
                  </span>
                  : {value}
                </div>
              ))
          : null}
        <Button
          type="button"
          size="sm"
          disabled={command.isPending}
          onClick={() => void sendCommand({ type: "confirm_brief_review" })}
          data-testid="from-zero-confirm-brief-review"
        >
          {tProgressive("confirmReview")}
        </Button>
      </div>
    );
  }

  const field = prompt?.field ?? "product";
  const label = prompt?.labelKey
    ? tProgressive(`fields.${prompt.labelKey}` as "fields.product")
    : t("briefTitle");

  return (
    <div
      className="mx-4 mt-2 space-y-3 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="from-zero-progressive-brief-panel"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>

      {prompt?.suggestion ? (
        <p className="text-xs text-[var(--text-muted)]">
          {tProgressive("suggestionFrom", { source: prompt.suggestion.source })}:{" "}
          {prompt.suggestion.value}
        </p>
      ) : null}

      <Input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={tProgressive("answerPlaceholder")}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            void sendCommand({
              type: "answer_brief",
              field,
              value: draft.trim(),
            });
          }
        }}
      />

      <div className="flex flex-wrap gap-2">
        {prompt?.quickReplies?.map((reply) => (
          <Button
            key={reply}
            type="button"
            size="sm"
            variant="outline"
            disabled={command.isPending}
            onClick={() =>
              void sendCommand({ type: "answer_brief", field, value: reply })
            }
          >
            {reply}
          </Button>
        ))}
        {prompt?.allowUnknown ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={command.isPending}
            onClick={() =>
              void sendCommand({
                type: "answer_brief",
                field,
                value: "",
                unknown: true,
              })
            }
          >
            {tProgressive("unknown")}
          </Button>
        ) : null}
        {prompt?.allowSkip ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={command.isPending}
            onClick={() =>
              void sendCommand({ type: "skip_brief_field", field })
            }
          >
            {tProgressive("skip")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={command.isPending || !draft.trim()}
          onClick={() =>
            void sendCommand({
              type: "answer_brief",
              field,
              value: draft.trim(),
            })
          }
          data-testid="from-zero-submit-answer"
        >
          {tProgressive("continue")}
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
