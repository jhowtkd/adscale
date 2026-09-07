"use client";

import { useBrandFonts, useBrandKnowledge } from "@/lib/hooks/use-brand-training";
import {
  useAutosaveCreativeWork,
  useCreateCreativeWorkDraft,
  useCreativeWork,
  useCreativeWorkSourceActions,
  usePrepareCreativeWork,
  useEditCreativeWorkBriefing,
  useRetryOutput,
  useLayerizeOutput,
  useReviseOutput,
  useSelectOutput,
  useDownloadOutputUrl,
  useLinkCreativeWorkCampaign,
  useCreativeWorkCampaigns,
  useResolveBrandConflict,
  useTriggerTriplet,
  useSuggestCreativeDirections,
} from "@/lib/hooks/use-creative-work";
import type { ComposerIntent } from "./composer-state";
import { useComposerRevision } from "./useComposerRevision";

export function useComposerQueries(input: {
  workId: string | null;
  intent: ComposerIntent;
  activeClientProfileId: string | null;
}) {
  const detailQuery = useCreativeWork(input.workId);
  const revision = useComposerRevision(detailQuery);
  const profileId = detailQuery.data?.work.clientProfileId ?? input.activeClientProfileId ?? null;
  const brandFontsQuery = useBrandFonts(input.intent === "single" ? profileId : null);
  const brandKnowledgeQuery = useBrandKnowledge(
    input.intent === "single" && !detailQuery.data?.work.identitySnapshot?.brandKnowledge
      ? profileId
      : null,
  );
  const fontOptions = (brandFontsQuery.data ?? []).filter(
    (font) => font.reviewStatus === undefined || font.reviewStatus === "approved",
  );

  const createMutation = useCreateCreativeWorkDraft();
  const autosaveMutation = useAutosaveCreativeWork();
  const prepareMutation = usePrepareCreativeWork();
  const editBriefingMutation = useEditCreativeWorkBriefing();
  const sourceMutation = useCreativeWorkSourceActions();
  const generateMutation = useTriggerTriplet();
  const suggestDirectionMutation = useSuggestCreativeDirections();
  const retryOutputMutation = useRetryOutput();
  const layerizeOutputMutation = useLayerizeOutput();
  const reviseOutputMutation = useReviseOutput();
  const selectOutputMutation = useSelectOutput();
  const linkCampaignMutation = useLinkCreativeWorkCampaign();
  const resolveBrandConflictMutation = useResolveBrandConflict();
  const downloadOutputUrl = useDownloadOutputUrl();
  const campaignQuery = useCreativeWorkCampaigns(Boolean(detailQuery.data?.outputs.length));

  return {
    detailQuery,
    ...revision,
    brandKnowledgeQuery,
    fontOptions,
    createMutation,
    autosaveMutation,
    prepareMutation,
    editBriefingMutation,
    sourceMutation,
    generateMutation,
    suggestDirectionMutation,
    retryOutputMutation,
    layerizeOutputMutation,
    reviseOutputMutation,
    selectOutputMutation,
    linkCampaignMutation,
    resolveBrandConflictMutation,
    downloadOutputUrl,
    campaignQuery,
  };
}
