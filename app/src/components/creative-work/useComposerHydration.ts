"use client";

import { useEffect, type MutableRefObject } from "react";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type { CreativeWorkItem, CreativeWorkQuote } from "@/lib/hooks/use-creative-work";
import {
  createDefaultCreativeDirectionPool,
  type CreativeDirectionPool,
  type CreativeWorkBriefingOverrides,
  type CreativeWorkFactPack,
  type InferredBriefing,
} from "@/server/creative-work/contracts";
import { composerHydrationAction } from "./composer-hydrate";
import type { ComposerRevisionWriter } from "./composer-revision";
import {
  canonicalQuote,
  clearStoredDraft,
  signature,
  snapshotFromWork,
  type ComposerIntent,
} from "./composer-state";

type Format = CreativeWorkItem["format"];

type HydrationDetail = {
  work: CreativeWorkItem;
  preparedPlan?: { preparedRevision: string } | null;
  inferredBriefing?: InferredBriefing | null;
  briefingFactPack?: CreativeWorkFactPack | null;
};

export function useComposerHydration({
  detail,
  initialWorkId,
  workflowVariant,
  hydratedWorkRef,
  workIdRef,
  requestRef,
  intentRef,
  objectiveRef,
  formatRef,
  targetFormatsRef,
  textLayoutRef,
  fontAssetKeyRef,
  directionPoolRef,
  directionTouchedRef,
  formatModeRef,
  briefingOverridesRef,
  briefingVersionRef,
  lastPersistedRef,
  preparedPlanInputRef,
  setPreparedPlanInput,
  hydratingPreparedPlanRevisionRef,
  setCanonicalWorkRevision,
  setWorkId,
  setRequestState,
  setInferredBriefingContext,
  setBriefingEditState,
  setIntent,
  setObjective,
  setFormat,
  setFormatMode,
  setTargetFormats,
  setTextLayout,
  setFontAssetKey,
  setDirectionPool,
  setDirectionSuggestionState,
  setQuote,
}: {
  detail: HydrationDetail | undefined;
  initialWorkId?: string;
  workflowVariant: StudioRolloutVariant;
  hydratedWorkRef: MutableRefObject<string | null>;
  workIdRef: MutableRefObject<string | null>;
  requestRef: MutableRefObject<string>;
  intentRef: MutableRefObject<ComposerIntent>;
  objectiveRef: MutableRefObject<ComposerIntent | null>;
  formatRef: MutableRefObject<Format>;
  targetFormatsRef: MutableRefObject<Format[]>;
  textLayoutRef: MutableRefObject<"top" | "center" | "bottom" | "side">;
  fontAssetKeyRef: MutableRefObject<string | null>;
  directionPoolRef: MutableRefObject<CreativeDirectionPool | null>;
  directionTouchedRef: MutableRefObject<boolean>;
  formatModeRef: MutableRefObject<"auto" | "manual">;
  briefingOverridesRef: MutableRefObject<CreativeWorkBriefingOverrides | undefined>;
  briefingVersionRef: MutableRefObject<number | undefined>;
  lastPersistedRef: MutableRefObject<string | null>;
  preparedPlanInputRef: MutableRefObject<{ revision: string; signature: string } | null>;
  setPreparedPlanInput: (value: { revision: string; signature: string } | null) => void;
  hydratingPreparedPlanRevisionRef: MutableRefObject<string | null>;
  setCanonicalWorkRevision: ComposerRevisionWriter;
  setWorkId: (value: string | null) => void;
  setRequestState: (value: string) => void;
  setInferredBriefingContext: (value: {
    briefing: InferredBriefing;
    factPack: CreativeWorkFactPack;
  } | null) => void;
  setBriefingEditState: (value: "idle") => void;
  setIntent: (value: ComposerIntent) => void;
  setObjective: (value: ComposerIntent | null) => void;
  setFormat: (value: Format) => void;
  setFormatMode: (value: "auto" | "manual") => void;
  setTargetFormats: (value: Format[]) => void;
  setTextLayout: (value: "top" | "center" | "bottom" | "side") => void;
  setFontAssetKey: (value: string | null) => void;
  setDirectionPool: (value: CreativeDirectionPool | null) => void;
  setDirectionSuggestionState: (value: "idle" | "ready") => void;
  setQuote: (value: CreativeWorkQuote) => void;
}) {
  useEffect(() => {
    const work = detail?.work;
    if (!work) return;
    const hydration = composerHydrationAction({
      hydratedId: hydratedWorkRef.current,
      workId: work.id,
      status: work.status,
      initialWorkId,
    });
    if (hydration === "skip") return;
    if (hydration === "clear_stale_restore") {
      clearStoredDraft(work.clientProfileId, work.toolKind === "social_post" ? "variations" : work.toolKind);
      workIdRef.current = null;
      // The persisted query is the source of truth for this invalid restored id.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkId(null);
      return;
    }
    hydratedWorkRef.current = work.id;
    workIdRef.current = work.id;
    requestRef.current = work.request;
    const hydrated = snapshotFromWork(work);
    const hydratedDirectionPool = hydrated.settings.directionPool
      ?? (hydrated.intent === "variations" ? createDefaultCreativeDirectionPool() : null);
    intentRef.current = hydrated.intent;
    formatRef.current = hydrated.format;
    targetFormatsRef.current = hydrated.settings.targetFormats;
    textLayoutRef.current = hydrated.settings.textLayout ?? "top";
    fontAssetKeyRef.current = hydrated.settings.fontAssetKey ?? null;
    // Keep legacy drafts on the three-level contract until the user changes a
    // direction; the visible default pool is only materialized on interaction.
    directionPoolRef.current = hydrated.settings.directionPool ?? null;
    // A persisted manual selection is a user choice, not a fresh default that
    // an initial suggestion response may replace on resume.
    directionTouchedRef.current = Boolean(hydrated.settings.directionPool
      && !hydrated.settings.directionPool.directions.some((direction) => direction.provenance === "ai-suggestion"));
    formatModeRef.current = hydrated.settings.formatMode;
    briefingOverridesRef.current = hydrated.settings.briefingOverrides;
    briefingVersionRef.current = hydrated.settings.briefingVersion;
    const hydratedSignature = signature(hydrated);
    lastPersistedRef.current = hydratedSignature;
    if (work.updatedAt) {
      setCanonicalWorkRevision(work.id, work.updatedAt);
    }
    const hydratedPlan = detail?.preparedPlan;
    if (initialWorkId && hydratedPlan) {
      setPreparedPlanInput({
        revision: hydratedPlan.preparedRevision,
        signature: hydratedSignature,
      });
      // The plan effect runs after this hydration effect with the pre-hydrate
      // render signature. Skip only that transition; later user edits still
      // compare against the canonical hydrated snapshot normally.
      hydratingPreparedPlanRevisionRef.current = hydratedPlan.preparedRevision;
    }
    /* TanStack Query is the external persisted source for hydration. */
    setRequestState(work.request);
    setInferredBriefingContext(
      detail?.inferredBriefing && detail.briefingFactPack
        ? { briefing: detail.inferredBriefing, factPack: detail.briefingFactPack }
        : null,
    );
    setBriefingEditState("idle");
    setIntent(intentRef.current);
    if (workflowVariant === "progressive" && !objectiveRef.current) {
      objectiveRef.current = hydrated.intent;
      setObjective(hydrated.intent);
    }
    setFormat(work.format);
    setFormatMode(hydrated.settings.formatMode);
    setTargetFormats(work.settings.targetFormats);
    setTextLayout(hydrated.settings.textLayout ?? "top");
    setFontAssetKey(hydrated.settings.fontAssetKey ?? null);
    setDirectionPool(hydratedDirectionPool);
    // Persisted AI suggestions mean a suggestion round already completed —
    // surface "Sugerir novamente" instead of fetching again on reload (#129).
    setDirectionSuggestionState(
      hydrated.settings.directionPool?.directions.some((direction) => direction.provenance === "ai-suggestion")
        ? "ready"
        : "idle",
    );
    setQuote(canonicalQuote(
      hydrated.intent,
      hydrated.format,
      hydrated.settings.targetFormats,
      hydrated.settings.directionPool ?? hydratedDirectionPool ?? undefined,
    ));
  }, [
    briefingOverridesRef,
    briefingVersionRef,
    detail,
    directionPoolRef,
    directionTouchedRef,
    fontAssetKeyRef,
    formatModeRef,
    formatRef,
    hydratedWorkRef,
    hydratingPreparedPlanRevisionRef,
    initialWorkId,
    intentRef,
    lastPersistedRef,
    objectiveRef,
    preparedPlanInputRef,
    setPreparedPlanInput,
    requestRef,
    setBriefingEditState,
    setCanonicalWorkRevision,
    setDirectionPool,
    setDirectionSuggestionState,
    setFontAssetKey,
    setFormat,
    setFormatMode,
    setInferredBriefingContext,
    setIntent,
    setObjective,
    setQuote,
    setRequestState,
    setTargetFormats,
    setTextLayout,
    setWorkId,
    targetFormatsRef,
    textLayoutRef,
    workIdRef,
    workflowVariant,
  ]);
}
