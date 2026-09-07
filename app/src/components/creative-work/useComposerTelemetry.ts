"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

type WorkLike = {
  id: string;
  toolKind: string;
};

type DetailLike = {
  work: WorkLike;
  outputs: Array<{ status: string }>;
} | null | undefined;

export function useComposerTelemetry({
  workspaceId,
  studioSessionId,
  workflowVariant,
  initialWorkId,
  initialObjective,
  detail,
}: {
  workspaceId?: string;
  studioSessionId?: string;
  workflowVariant: StudioRolloutVariant | string;
  initialWorkId?: string;
  initialObjective: string | null;
  detail: DetailLike;
}) {
  const { recordEvent } = useRecordBetaEvent(undefined, { includeBetaSession: false });
  const canonicalEventsRef = useRef(new Set<string>());

  const recordStudioEvent = useCallback((eventKey: string, properties: Record<string, string | number | boolean> = {}) => {
    if (!workspaceId || !studioSessionId) return;
    recordEvent(eventKey, {
      studioSessionId,
      rolloutVariant: workflowVariant,
      ...properties,
    });
  }, [recordEvent, studioSessionId, workflowVariant, workspaceId]);

  const recordCanonicalEvent = useCallback((eventKey: string, creativeWorkId: string, properties: Record<string, string | number | boolean> = {}) => {
    const key = `${eventKey}:${creativeWorkId}`;
    if (canonicalEventsRef.current.has(key)) return;
    canonicalEventsRef.current.add(key);
    recordStudioEvent(eventKey, { creativeWorkId, ...properties });
  }, [recordStudioEvent]);

  useEffect(() => {
    recordStudioEvent("studio_entry_started");
    if (workflowVariant !== "progressive" && initialObjective) {
      recordStudioEvent("studio_goal_selected", { protocol: initialObjective });
    }
  }, [initialObjective, recordStudioEvent, workflowVariant]);

  useEffect(() => {
    if (!initialWorkId || !detail?.work) return;
    recordCanonicalEvent("creative_work_reopened", detail.work.id, {
      protocol: detail.work.toolKind === "social_post" ? "variations" : detail.work.toolKind,
    });
  }, [detail?.work, initialWorkId, recordCanonicalEvent]);

  useEffect(() => {
    if (!detail || !detail.outputs.some((output) => ["completed", "failed"].includes(output.status))) return;
    recordCanonicalEvent("creative_work_reviewed", detail.work.id, {
      protocol: detail.work.toolKind === "social_post" ? "variations" : detail.work.toolKind,
    });
  }, [detail, recordCanonicalEvent]);

  return { recordStudioEvent, recordCanonicalEvent };
}
