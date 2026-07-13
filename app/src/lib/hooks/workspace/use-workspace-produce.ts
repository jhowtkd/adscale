"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Derivation } from "@/lib/mock-data";
import {
  getBatchCreditBreakdown,
  type BatchCreditBreakdown,
  type RecipeGenerationConfig,
} from "@/server/ai/strategy-recipes";
import {
  getActivePreviewGateDerivation,
  getReadyPreviewDerivation,
  shouldAutoContinuePreview,
  shouldShowPreviewGate,
} from "@/server/ai/preview-gate";
import {
  creditFrictionDiagnostic,
  isInsufficientCreditsError,
} from "@/lib/mission-insights/helpers";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";
import type { UseMutationResult } from "@tanstack/react-query";

type CampaignLike = {
  generationMode?: string | null;
  creativeLevel?: string | null;
  ctaVariants?: string[] | null;
  targetFormats?: string[] | null;
} | null;

type CreateDerivationsVars = {
  preview?: boolean;
  outputLearningApplication?: OutputLearningApplicationSnapshot;
};

/**
 * Produce flow: generate batch, restyle, preview gate, credit estimate.
 * Phase 6 / item 48 — narrow deps, no review/deliver state.
 */
export function useWorkspaceProduce(deps: {
  campaignId: string;
  isNew: boolean;
  campaign: CampaignLike;
  allDerivations: Derivation[];
  currentRoute: string;
  pendingOutputLearningApplication: OutputLearningApplicationSnapshot | null;
  createDerivations: UseMutationResult<
    unknown,
    Error,
    CreateDerivationsVars | undefined,
    unknown
  >;
  restyleCampaign: UseMutationResult<
    unknown,
    Error,
    { styleAssetIds?: string[]; styleIntensity?: string },
    unknown
  >;
  updateCampaign: {
    mutate: (payload: Record<string, unknown>) => void;
    mutateAsync: (payload: Record<string, unknown>) => Promise<unknown>;
  };
  setWorkspaceState: (state: "setup" | "trabalho") => void;
  addToast: (type: "success" | "error" | "info", message: string) => void;
  tc: (key: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  missionInsight?: { maybePromptMissionInsight: (...args: any[]) => void } | null;
}) {
  const {
    campaignId,
    isNew,
    campaign,
    allDerivations,
    currentRoute,
    pendingOutputLearningApplication,
    createDerivations,
    restyleCampaign,
    updateCampaign,
    setWorkspaceState,
    addToast,
    tc,
    missionInsight,
  } = deps;

  const handleGenerateDerivations = useCallback(
    (options?: { preview?: boolean }) => {
      if (createDerivations.isPending) return;
      createDerivations.mutate(
        {
          preview: options?.preview ?? false,
          ...(pendingOutputLearningApplication
            ? { outputLearningApplication: pendingOutputLearningApplication }
            : {}),
        },
        {
          onSuccess: () => {
            addToast(
              "success",
              options?.preview ? tc("previewQueued") : tc("derivationsQueued")
            );
            setWorkspaceState("trabalho");
            if (campaign && !isNew) {
              updateCampaign.mutate({ status: "generating" });
            }
            if (options?.preview && missionInsight) {
              missionInsight.maybePromptMissionInsight({
                moment: "preview_first",
                missionKey: "preview",
                campaignId: campaignId !== "new" ? campaignId : undefined,
                route: currentRoute,
                diagnosticContext: {
                  isPreview: true,
                  operation: "preview_generate",
                },
              });
            }
          },
          onError: (error) => {
            addToast(
              "error",
              options?.preview
                ? tc("failedQueuePreview")
                : tc("failedQueueDerivations")
            );
            setWorkspaceState("trabalho");
            if (isInsufficientCreditsError(error) && missionInsight) {
              missionInsight.maybePromptMissionInsight({
                moment: "credit_friction",
                missionKey: options?.preview ? "preview" : "batch",
                campaignId: campaignId !== "new" ? campaignId : undefined,
                route: currentRoute,
                diagnosticContext: creditFrictionDiagnostic(error),
              });
            }
          },
        }
      );
    },
    [
      createDerivations,
      campaign,
      isNew,
      updateCampaign,
      addToast,
      tc,
      campaignId,
      missionInsight,
      currentRoute,
      pendingOutputLearningApplication,
      setWorkspaceState,
    ]
  );

  const configureAndGenerate = useCallback(
    async (
      config: {
        generationMode: "art_variation" | "format_adaptation";
        ctaVariants?: string[];
        targetFormats?: string[];
        creativeLevel?: string;
      },
      options?: { preview?: boolean }
    ) => {
      if (!campaign || isNew) return;

      try {
        await updateCampaign.mutateAsync({
          generationMode: config.generationMode,
          ...(config.ctaVariants && { ctaVariants: config.ctaVariants }),
          ...(config.targetFormats && { targetFormats: config.targetFormats }),
          ...(config.creativeLevel && {
            creativeLevel: config.creativeLevel as
              | "conservative"
              | "balanced"
              | "bold"
              | "extreme",
          }),
        });
        handleGenerateDerivations({ preview: options?.preview ?? false });
      } catch {
        addToast("error", tc("failedQueueDerivations"));
      }
    },
    [campaign, isNew, updateCampaign, handleGenerateDerivations, addToast, tc]
  );

  const approvePreviewToBatch = useCallback(() => {
    if (createDerivations.isPending) return;
    handleGenerateDerivations();
  }, [createDerivations.isPending, handleGenerateDerivations]);

  const autoContinuedPreviewIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shouldAutoContinuePreview(allDerivations)) return;
    if (createDerivations.isPending) return;
    const readyPreview = getReadyPreviewDerivation(allDerivations);
    if (!readyPreview?.id) return;
    if (autoContinuedPreviewIdRef.current === readyPreview.id) return;

    autoContinuedPreviewIdRef.current = readyPreview.id;
    handleGenerateDerivations();
  }, [allDerivations, createDerivations.isPending, handleGenerateDerivations]);

  useEffect(() => {
    if (createDerivations.isError) {
      autoContinuedPreviewIdRef.current = null;
    }
  }, [createDerivations.isError]);

  const handleRestyle = useCallback(
    async (input: { styleAssetIds?: string[]; styleIntensity?: string }) => {
      if (!campaign || isNew) return;
      if (restyleCampaign.isPending) return;

      setWorkspaceState("trabalho");
      restyleCampaign.mutate(input, {
        onSuccess: () => {
          addToast("success", tc("derivationsQueued"));
          setWorkspaceState("trabalho");
        },
        onError: () => {
          addToast("error", tc("failedQueueDerivations"));
          setWorkspaceState("trabalho");
        },
      });
    },
    [restyleCampaign, campaign, isNew, addToast, tc, setWorkspaceState]
  );

  const previewDerivation = useMemo(
    () => getActivePreviewGateDerivation(allDerivations),
    [allDerivations]
  );

  const showPreviewGate = useMemo(
    () => shouldShowPreviewGate(allDerivations),
    [allDerivations]
  );

  const batchRecipeConfig = useMemo((): RecipeGenerationConfig | null => {
    if (!campaign) return null;
    const generationMode =
      campaign.generationMode === "format_adaptation"
        ? "format_adaptation"
        : "art_variation";
    return {
      generationMode,
      creativeLevel:
        (campaign.creativeLevel as RecipeGenerationConfig["creativeLevel"]) ??
        "balanced",
      ctaVariants: (campaign.ctaVariants ?? [])
        .map((cta) => cta.trim())
        .filter(Boolean),
      targetFormats:
        generationMode === "format_adaptation"
          ? (campaign.targetFormats ?? [])
          : undefined,
      preservationEmphasis: "medium",
    };
  }, [campaign]);

  const batchCreditBreakdown = useMemo((): BatchCreditBreakdown | null => {
    if (!batchRecipeConfig) return null;
    return getBatchCreditBreakdown(batchRecipeConfig);
  }, [batchRecipeConfig]);

  const batchCreditEstimate = batchCreditBreakdown?.totalCredits ?? 0;
  const hasActivePreview = Boolean(previewDerivation);

  return {
    handleGenerateDerivations,
    configureAndGenerate,
    approvePreviewToBatch,
    handleRestyle,
    hasActivePreview,
    previewDerivation,
    showPreviewGate,
    batchCreditEstimate,
    batchCreditBreakdown,
    createDerivationsPending: createDerivations.isPending,
    restylePending: restyleCampaign.isPending,
  };
}
