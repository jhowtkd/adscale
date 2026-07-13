"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Derivation } from "@/lib/mock-data";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";
import type { WorkspaceProduceSurface } from "@/lib/hooks/use-derivations";
import {
  creditFrictionDiagnostic,
  isInsufficientCreditsError,
} from "@/lib/mission-insights/helpers";
import type {
  CreateDerivationsHandle,
  RestyleCampaignHandle,
  UpdateCampaignHandle,
} from "@/lib/hooks/workspace/mutation-handles";

type CampaignLike = {
  generationMode?: string | null;
  creativeLevel?: string | null;
  ctaVariants?: string[] | null;
  targetFormats?: string[] | null;
} | null;

/**
 * Produce flow: generate batch, restyle, preview gate, credit estimate.
 * Phase 6 / item 49: preview/credit domain rules come from server produceSurface
 * (no client import of strategy-recipes / preview-gate).
 */
export function useWorkspaceProduce(deps: {
  campaignId: string;
  isNew: boolean;
  campaign: CampaignLike;
  allDerivations: Derivation[];
  /** Server-calculated produce surface (item 49). */
  produceSurface: WorkspaceProduceSurface | null;
  currentRoute: string;
  pendingOutputLearningApplication: OutputLearningApplicationSnapshot | null;
  createDerivations: CreateDerivationsHandle;
  restyleCampaign: RestyleCampaignHandle;
  updateCampaign: UpdateCampaignHandle;
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
    produceSurface,
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
    if (!produceSurface?.shouldAutoContinuePreview) return;
    if (createDerivations.isPending) return;
    const previewId = produceSurface.activePreviewId;
    if (!previewId) return;
    if (autoContinuedPreviewIdRef.current === previewId) return;

    autoContinuedPreviewIdRef.current = previewId;
    handleGenerateDerivations();
  }, [
    produceSurface?.shouldAutoContinuePreview,
    produceSurface?.activePreviewId,
    createDerivations.isPending,
    handleGenerateDerivations,
  ]);

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

  const previewDerivation = useMemo(() => {
    const id = produceSurface?.activePreviewId;
    if (!id) return null;
    return allDerivations.find((d) => d.id === id) ?? null;
  }, [produceSurface?.activePreviewId, allDerivations]);

  const showPreviewGate = produceSurface?.showPreviewGate ?? false;
  const batchCreditBreakdown = produceSurface?.batchCreditBreakdown ?? null;
  const batchCreditEstimate = produceSurface?.batchCreditEstimate ?? 0;
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
