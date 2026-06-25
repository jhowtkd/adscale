"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import DerivationReviewSheet from "@/components/workspace/DerivationReviewSheet";
import { Button } from "@/components/ui/button";
import type { Derivation } from "@/lib/mock-data";
import { useDerivations } from "@/lib/hooks/use-derivations";
import { useReviewDerivation } from "@/lib/hooks/use-review";
import {
  useAssistantThread,
  type AssistantMessage,
} from "@/lib/hooks/use-assistant-threads";

export interface AssistantReviewPanelProps {
  threadId: string | null;
}

function getJobDerivationId(message: AssistantMessage): string | null {
  const jobRef = message.payload.jobRef;
  if (
    typeof jobRef === "object" &&
    jobRef !== null &&
    (jobRef as { kind?: unknown }).kind === "derivation" &&
    typeof (jobRef as { id?: unknown }).id === "string"
  ) {
    return (jobRef as { id: string }).id;
  }
  return null;
}

export default function AssistantReviewPanel({
  threadId,
}: AssistantReviewPanelProps) {
  const t = useTranslations("assistant.review");
  const { data } = useAssistantThread(threadId, { pollWhileActive: true });
  const campaignId = data?.thread.campaignId ?? null;
  const { data: derivations } = useDerivations(campaignId ?? "", {
    enablePolling: Boolean(campaignId),
  });
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    mutate: reviewDerivation,
    isPending: reviewPending,
    variables: reviewVariables,
  } = useReviewDerivation(selectedId ?? undefined);

  const jobDerivationId = useMemo(() => {
    const cards = (data?.messages ?? []).filter(
      (message) => message.type === "action_card"
    );
    for (let index = cards.length - 1; index >= 0; index -= 1) {
      const id = getJobDerivationId(cards[index]!);
      if (id) return id;
    }
    return null;
  }, [data?.messages]);

  const reviewableDerivation = useMemo(() => {
    const list = derivations ?? [];
    const preferredId = selectedId ?? jobDerivationId;
    if (preferredId) {
      const match = list.find((item) => item.id === preferredId);
      if (match?.imageUrl) return match;
    }
    return (
      list.find(
        (item) =>
          item.imageUrl &&
          (item.status === "completed" || item.status === "approved")
      ) ?? null
    );
  }, [derivations, jobDerivationId, selectedId]);

  if (!threadId || !campaignId) {
    return null;
  }

  return (
    <section data-testid="assistant-review-panel">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {t("title")}
      </h3>
      {reviewableDerivation ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {t("ready", { format: reviewableDerivation.format ?? "1:1" })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedId(reviewableDerivation.id);
              setOpen(true);
            }}
          >
            {t("openReview")}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t("noDerivation")}</p>
      )}

      <DerivationReviewSheet
        open={open && Boolean(reviewableDerivation)}
        derivation={reviewableDerivation as Derivation | null}
        workspaceId={reviewableDerivation?.workspaceId}
        campaignId={campaignId}
        clientProfileId={data?.thread.clientProfileId}
        isApproving={
          reviewPending &&
          (reviewVariables?.decision === "entra" ||
            reviewVariables?.status === "approved")
        }
        isRejecting={
          reviewPending &&
          (reviewVariables?.decision === "nao_entra" ||
            reviewVariables?.decision === "quase_regenerar" ||
            reviewVariables?.status === "rejected")
        }
        onOpenChange={setOpen}
        onRegenerateWithFixes={() => {
          if (!reviewableDerivation) return;
          setSelectedId(reviewableDerivation.id);
        }}
        onSubmitDecision={(input) => {
          if (!reviewableDerivation) return;
          reviewDerivation({ id: reviewableDerivation.id, ...input });
        }}
      />
    </section>
  );
}
