"use client";

import { useCallback, useState } from "react";
import {
  buildRegenerationFeedback,
  derivationNeedsRegenerateDialog,
} from "@/lib/derivation-display";
import type { ReviewDecision } from "@/lib/hooks/use-review";
import type { UseMutationResult } from "@tanstack/react-query";

type RegenerateVars = { id: string; feedback?: string };
type ReviewVars = {
  id?: string;
  decision?: ReviewDecision;
  directionReason?: string;
  overrideReason?: string;
  status?: "approved" | "rejected";
};

/** Workspace derivation card shape (superset of mock Derivation). */
type ReviewableDerivation = {
  id: string;
  regenerationSuggestion?: string | null;
  hardFailures?: unknown;
  regenerationPrimaryReason?: string | null;
  regenerationIssueBreakdown?: import("@/lib/regeneration-preview-types").RegenerationIssueBreakdown;
  qualityVerdict?: string | null;
  qaChecklist?: unknown;
};

/**
 * Review + regenerate dialog flow (Phase 6 / item 48).
 * Interface is the mutation handles + list of derivations only.
 */
export function useWorkspaceReview(deps: {
  campaignId: string;
  allDerivations: ReviewableDerivation[];
  regenerateMutation: UseMutationResult<unknown, Error, RegenerateVars, unknown>;
  reviewMutation: UseMutationResult<unknown, Error, ReviewVars, unknown>;
  creativeQa: UseMutationResult<
    unknown,
    Error,
    { derivationId: string },
    unknown
  >;
  addToast: (type: "success" | "error" | "info", message: string) => void;
  tc: (key: string) => string;
  // Mission insight is optional; keep type loose to avoid coupling modules.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  missionInsight?: { maybePromptMissionInsight: (...args: any[]) => void } | null;
}) {
  const {
    campaignId,
    allDerivations,
    regenerateMutation,
    reviewMutation,
    creativeQa,
    addToast,
    tc,
    missionInsight,
  } = deps;

  const [reviewDerivationId, setReviewDerivationId] = useState<string | null>(
    null
  );
  const [regenerateDialog, setRegenerateDialog] = useState<{
    id: string;
    feedback: string;
    primaryReason?: string;
    issueBreakdown?: import("@/lib/regeneration-preview-types").RegenerationIssueBreakdown;
  } | null>(null);

  const handlePreview = useCallback((id: string) => {
    setReviewDerivationId(id);
  }, []);

  const handleCloseReview = useCallback(() => {
    setReviewDerivationId(null);
  }, []);

  const handleRequestRegenerate = useCallback(
    (id: string, feedback?: string) => {
      const derivation = allDerivations.find((item) => item.id === id);
      if (!derivation) {
        regenerateMutation.mutate({ id, feedback });
        return;
      }

      const built = buildRegenerationFeedback({
        regenerationSuggestion: derivation.regenerationSuggestion,
        hardFailures: derivation.hardFailures as never,
        regenerationPrimaryReason: derivation.regenerationPrimaryReason,
        regenerationIssueBreakdown: derivation.regenerationIssueBreakdown as never,
      });

      const preset = feedback ?? built.feedbackText;
      const needsDialog = derivationNeedsRegenerateDialog({
        hardFailures: derivation.hardFailures as never,
        regenerationSuggestion: derivation.regenerationSuggestion,
        regenerationPrimaryReason: derivation.regenerationPrimaryReason,
        qualityVerdict: derivation.qualityVerdict as never,
        qaChecklist: derivation.qaChecklist as never,
      });

      if (needsDialog || preset.trim()) {
        setRegenerateDialog({
          id,
          feedback: preset,
          primaryReason: built.primaryReason,
          issueBreakdown: built.issueBreakdown,
        });
        return;
      }

      regenerateMutation.mutate({ id, feedback: undefined });
    },
    [allDerivations, regenerateMutation]
  );

  const handleConfirmRegenerate = useCallback(
    (feedback: string) => {
      if (!regenerateDialog) return;
      regenerateMutation.mutate(
        { id: regenerateDialog.id, feedback },
        {
          onSuccess: () => {
            setRegenerateDialog(null);
            setReviewDerivationId(null);
            missionInsight?.maybePromptMissionInsight({
              moment: "regeneration_first",
              missionKey: "regeneration",
              campaignId,
              derivationId: regenerateDialog.id,
              diagnosticContext: { operation: "regenerate" },
            });
          },
        }
      );
    },
    [regenerateDialog, regenerateMutation, missionInsight, campaignId]
  );

  const handleCloseRegenerateDialog = useCallback((open: boolean) => {
    if (!open) setRegenerateDialog(null);
  }, []);

  const handleRegenerateDerivation = useCallback(
    (id: string, feedback?: string) => handleRequestRegenerate(id, feedback),
    [handleRequestRegenerate]
  );

  const handleApproveDerivation = useCallback(
    (id: string) => reviewMutation.mutate({ id, decision: "entra" }),
    [reviewMutation]
  );

  const handleRejectDerivation = useCallback(
    (id: string, directionReason?: string) =>
      reviewMutation.mutate(
        {
          id,
          decision: "nao_entra",
          ...(directionReason ? { directionReason } : {}),
        },
        {
          onSuccess: () => {
            missionInsight?.maybePromptMissionInsight({
              moment: "rejection_first",
              missionKey: "review",
              campaignId,
              derivationId: id,
              diagnosticContext: { derivationStatus: "rejected" },
            });
          },
        }
      ),
    [reviewMutation, missionInsight, campaignId]
  );

  const handleReviewDecision = useCallback(
    (
      id: string,
      input: {
        decision: ReviewDecision;
        directionReason?: string;
        overrideReason?: string;
      }
    ) => {
      reviewMutation.mutate(
        { id, ...input },
        {
          onSuccess: (_data, variables) => {
            if (
              variables.decision === "quase_regenerar" &&
              variables.directionReason
            ) {
              regenerateMutation.mutate({
                id,
                feedback: variables.directionReason,
              });
            }
            if (variables.decision === "nao_entra") {
              missionInsight?.maybePromptMissionInsight({
                moment: "rejection_first",
                missionKey: "review",
                campaignId,
                derivationId: id,
                diagnosticContext: { derivationStatus: "rejected" },
              });
            }
          },
        }
      );
    },
    [reviewMutation, regenerateMutation, missionInsight, campaignId]
  );

  const handleRunQa = useCallback(
    (id: string) => {
      creativeQa.mutate(
        { derivationId: id },
        {
          onSuccess: () => addToast("success", tc("creativeQaComplete")),
          onError: () => addToast("error", tc("creativeQaFailed")),
        }
      );
    },
    [creativeQa, addToast, tc]
  );

  return {
    reviewDerivationId,
    regenerateDialog,
    handlePreview,
    handleCloseReview,
    handleRequestRegenerate,
    handleConfirmRegenerate,
    handleCloseRegenerateDialog,
    handleRegenerateDerivation,
    handleApproveDerivation,
    handleRejectDerivation,
    handleReviewDecision,
    handleRunQa,
    reviewPending: reviewMutation.isPending,
    reviewVariables: reviewMutation.variables,
    regeneratePending: regenerateMutation.isPending,
    regenerateVariables: regenerateMutation.variables,
    creativeQaPending: creativeQa.isPending,
    creativeQaVariables: creativeQa.variables,
  };
}
