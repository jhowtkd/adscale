"use client";

import { useEffect, type MutableRefObject } from "react";

export function useComposerFieldRefs({
  workId,
  pendingCampaignId,
  request,
  intent,
  objective,
  format,
  targetFormats,
  textLayout,
  fontAssetKey,
  workIdRef,
  pendingCampaignIdRef,
  requestRef,
  intentRef,
  objectiveRef,
  formatRef,
  targetFormatsRef,
  textLayoutRef,
  fontAssetKeyRef,
}: {
  workId: string | null;
  pendingCampaignId: string | null;
  request: string;
  intent: unknown;
  objective: unknown;
  format: unknown;
  targetFormats: unknown;
  textLayout: unknown;
  fontAssetKey: string | null;
  workIdRef: MutableRefObject<string | null>;
  pendingCampaignIdRef: MutableRefObject<string | null>;
  requestRef: MutableRefObject<string>;
  intentRef: MutableRefObject<unknown>;
  objectiveRef: MutableRefObject<unknown>;
  formatRef: MutableRefObject<unknown>;
  targetFormatsRef: MutableRefObject<unknown>;
  textLayoutRef: MutableRefObject<unknown>;
  fontAssetKeyRef: MutableRefObject<string | null>;
}): void {
  useEffect(() => { workIdRef.current = workId; }, [workId, workIdRef]);
  useEffect(() => { pendingCampaignIdRef.current = pendingCampaignId; }, [pendingCampaignId, pendingCampaignIdRef]);
  useEffect(() => { requestRef.current = request; }, [request, requestRef]);
  useEffect(() => { intentRef.current = intent; }, [intent, intentRef]);
  useEffect(() => { objectiveRef.current = objective; }, [objective, objectiveRef]);
  useEffect(() => { formatRef.current = format; }, [format, formatRef]);
  useEffect(() => { targetFormatsRef.current = targetFormats; }, [targetFormats, targetFormatsRef]);
  useEffect(() => { textLayoutRef.current = textLayout; }, [textLayout, textLayoutRef]);
  useEffect(() => { fontAssetKeyRef.current = fontAssetKey; }, [fontAssetKey, fontAssetKeyRef]);
}
