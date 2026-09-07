"use client";

import { useCallback, type MutableRefObject } from "react";
import { UUID_SCHEMA, isCreativeWorkConflict } from "./composer-state";
import type { ComposerSourceAction } from "./composer-attach";

export function useComposerWorkMutations({
  workIdRef,
  pendingCampaignIdRef,
  exposeCampaignId,
  setPendingCampaignId,
  setAnnouncement,
  setError,
  tHome,
  detailQuery,
  linkCampaignMutation,
  sourceMutation,
  resolveCanonicalWorkRevision,
  refreshCanonicalWorkRevision,
  blockStaleRevision,
}: {
  workIdRef: MutableRefObject<string | null>;
  pendingCampaignIdRef: MutableRefObject<string | null>;
  exposeCampaignId: (campaignId: string | null) => void;
  setPendingCampaignId: (campaignId: string | null) => void;
  setAnnouncement: (value: string) => void;
  setError: (value: string | null) => void;
  tHome: (key: string) => string;
  detailQuery: { refetch: () => Promise<unknown> };
  linkCampaignMutation: {
    mutateAsync: (input: { workItemId: string; campaignId: string | null }) => Promise<unknown>;
  };
  sourceMutation: {
    mutateAsync: (input: ComposerSourceAction & { expectedUpdatedAt: string }) => Promise<unknown>;
  };
  resolveCanonicalWorkRevision: (workItemId: string) => Promise<string | null>;
  refreshCanonicalWorkRevision: (workItemId: string) => Promise<string | null>;
  blockStaleRevision: (workItemId: string) => void;
}) {
  const linkCampaign = useCallback(async (campaignId: string | null): Promise<boolean> => {
    if (!campaignId && !workIdRef.current) {
      pendingCampaignIdRef.current = null;
      setPendingCampaignId(null);
      exposeCampaignId(null);
      return true;
    }
    if (!workIdRef.current) {
      if (!campaignId || !UUID_SCHEMA.safeParse(campaignId).success) return false;
      pendingCampaignIdRef.current = campaignId;
      setPendingCampaignId(campaignId);
      exposeCampaignId(campaignId);
      return true;
    }
    try {
      await linkCampaignMutation.mutateAsync({ workItemId: workIdRef.current, campaignId });
      await detailQuery.refetch();
      pendingCampaignIdRef.current = null;
      setPendingCampaignId(null);
      exposeCampaignId(null);
      setAnnouncement(campaignId ? tHome("composer.campaignLinked") : tHome("composer.campaignRemoved"));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tHome("composer.campaignLinkFailed"));
      return false;
    }
  }, [
    detailQuery,
    exposeCampaignId,
    linkCampaignMutation,
    pendingCampaignIdRef,
    setAnnouncement,
    setError,
    setPendingCampaignId,
    tHome,
    workIdRef,
  ]);

  const mutateSource = useCallback(async (action: ComposerSourceAction) => {
    const expectedUpdatedAt = await resolveCanonicalWorkRevision(action.workItemId);
    if (!expectedUpdatedAt) throw new Error("Recarregue o trabalho antes de alterar a arte.");
    let result: Awaited<ReturnType<typeof sourceMutation.mutateAsync>>;
    try {
      result = await sourceMutation.mutateAsync({ ...action, expectedUpdatedAt });
    } catch (cause) {
      if (isCreativeWorkConflict(cause)) {
        blockStaleRevision(action.workItemId);
        try { await refreshCanonicalWorkRevision(action.workItemId); } catch { /* keep blocked */ }
      }
      throw cause;
    }
    try {
      if (!await refreshCanonicalWorkRevision(action.workItemId)) {
        blockStaleRevision(action.workItemId);
      }
    } catch {
      blockStaleRevision(action.workItemId);
    }
    return result;
  }, [blockStaleRevision, refreshCanonicalWorkRevision, resolveCanonicalWorkRevision, sourceMutation]);

  return { linkCampaign, mutateSource };
}
