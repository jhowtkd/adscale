"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { collectImageFiles, uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import { apiFetch, isApiRequestUncertain } from "@/lib/api-client";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
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
  extractCreativeWorkBrandConflict,
  extractCreativeWorkBriefingBlocked,
  type CreativeSourceUsage,
  type CreativeWorkBrandChoice,
  type CreativeWorkBrandConflict,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkQuote,
  type CreativeWorkSource,
  type CreativeWorkDetail,
} from "@/lib/hooks/use-creative-work";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import {
  createDefaultCreativeDirectionPool,
  quoteCreativeWork,
  type CreativeDirection,
  type CreativeDirectionPool,
  type CreativeWorkFactPack,
  type CreativeWorkBriefingField,
  type CreativeWorkBriefingOverrides,
  type InferredBriefing,
} from "@/server/creative-work/contracts";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
import { isPieceReferenceReady, MAX_PIECE_REFERENCES, type PieceReferenceCategory } from "@/server/creative-work/piece-reference";

export type ComposerState = "empty" | "saving" | "analyzing" | "ready" | "generating" | "results";
export type ComposerActionPhase = "idle" | "saving" | "preparing" | "submitting" | "reconciling";
export type ComposerIntent = Exclude<CreativeWorkItem["toolKind"], "social_post">;
export type ComposerStage = "entry" | "configure" | "plan" | "generation" | "results";
type Format = CreativeWorkItem["format"];
type DraftSnapshot = {
  request: string;
  intent: ComposerIntent;
  format: Format;
  settings: {
    targetFormats: Format[];
    formatMode: "auto" | "manual";
    textLayout?: "top" | "center" | "bottom" | "side";
    fontAssetKey?: string;
    directionPool?: CreativeDirectionPool;
    briefingOverrides?: CreativeWorkBriefingOverrides;
    briefingVersion?: number;
  };
};
type DraftSource = ({ assetId: string } | { templateId: string }) & { usage?: CreativeSourceUsage };

const COMPOSER_INTENTS = new Set<ComposerIntent>([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
]);
const UUID_SCHEMA = z.string().uuid();
const DRAFT_STORAGE_PREFIX = "adscale:creative-draft:v1";

function draftStorageKey(clientProfileId: string, intent: ComposerIntent): string {
  return `${DRAFT_STORAGE_PREFIX}:${clientProfileId}:${intent}`;
}

function readStoredDraft(clientProfileId: string, intent: ComposerIntent): string | null {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage?.getItem !== "function") return null;
  const value = window.localStorage.getItem(draftStorageKey(clientProfileId, intent));
  return value && UUID_SCHEMA.safeParse(value).success ? value : null;
}

function writeStoredDraft(clientProfileId: string, intent: ComposerIntent, workId: string): void {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function" || !UUID_SCHEMA.safeParse(workId).success) return;
  window.localStorage.setItem(draftStorageKey(clientProfileId, intent), workId);
}

function clearStoredDraft(clientProfileId: string, intent: ComposerIntent): void {
  if (typeof window === "undefined" || typeof window.localStorage?.removeItem !== "function") return;
  window.localStorage.removeItem(draftStorageKey(clientProfileId, intent));
}

function reusableSourceForProtocol(
  previous: ComposerIntent,
  next: ComposerIntent,
  sources: readonly CreativeWorkSource[],
): DraftSource | null {
  if (next === "single") return null;
  const original = sources.find((source) =>
    source.status === "ready"
    && source.usageConfirmed
    && source.usage !== "style"
    && (previous !== "single" || source.usage === "content")
    && Boolean(source.assetId || source.templateId)
  );
  if (!original) return null;
  const identity = original.assetId ? { assetId: original.assetId } : { templateId: original.templateId! };
  return { ...identity, usage: next === "restyle" ? "content" : "both" };
}

function canonicalQuote(
  intent: ComposerIntent,
  format: Format,
  targetFormats: Format[],
  directionPool?: CreativeDirectionPool,
): CreativeWorkQuote {
  const { unitCount, credits } = quoteCreativeWork({ intent, format, targetFormats, directionPool });
  return { unitCount, credits };
}

function signature(snapshot: DraftSnapshot) {
  return JSON.stringify(snapshot);
}

function snapshotFromWork(work: Pick<CreativeWorkItem, "request" | "toolKind" | "format" | "settings">): DraftSnapshot {
  return {
    request: work.request,
    intent: work.toolKind === "social_post" ? "variations" : work.toolKind,
    format: work.format,
    settings: {
      targetFormats: [...work.settings.targetFormats],
      formatMode: work.settings.formatMode ?? "manual",
      ...(work.settings.textLayout ? { textLayout: work.settings.textLayout } : {}),
      ...(work.settings.fontAssetKey ? { fontAssetKey: work.settings.fontAssetKey } : {}),
      ...(work.settings.directionPool ? {
        directionPool: {
          ...work.settings.directionPool,
          directions: work.settings.directionPool.directions.map((direction) => ({ ...direction })),
          selectedIds: [...work.settings.directionPool.selectedIds],
        },
      } : {}),
      ...(work.settings.briefingOverrides ? { briefingOverrides: { ...work.settings.briefingOverrides } } : {}),
      ...(work.settings.briefingVersion !== undefined ? { briefingVersion: work.settings.briefingVersion } : {}),
    },
  };
}

function isCreativeWorkConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: unknown };
  return candidate.status === 409;
}

function focusBrandSwitcher() {
  (document.getElementById("active-brand-switcher-inline")
    ?? document.getElementById("active-brand-switcher"))?.focus();
}

const CREATIVE_ANNOUNCEMENT_EVENT = "adscale:creative-announcement";
const CREATIVE_ANNOUNCEMENT_STORAGE_KEY = "adscale_creative_announcement";

export function projectComposerStage(input: {
  objectiveSelected: boolean;
  detail: CreativeWorkDetail | null;
}): ComposerStage {
  if (!input.objectiveSelected) return "entry";
  if (!input.detail) return "configure";
  if (input.detail.work.status === "draft") return input.detail.preparedPlan ? "plan" : "configure";
  if (input.detail.work.status === "ready" && input.detail.outputs.length === 0) return "plan";
  if (input.detail.work.status === "generating" || input.detail.outputs.some((output) => output.status === "queued" || output.status === "processing")) return "generation";
  return "results";
}

export function useCreativeComposer({
  initialWorkId,
  initialIntent = "variations",
  workspaceId,
  workflowVariant = "control",
  studioSessionId,
  focusComposer = false,
  initialTemplateId,
  freshEntry = false,
}: {
  initialWorkId?: string;
  initialIntent?: ComposerIntent;
  workspaceId?: string;
  workflowVariant?: StudioRolloutVariant;
  studioSessionId?: string;
  focusComposer?: boolean;
  initialTemplateId?: string;
  /** A canonical Studio entry that intentionally starts without draft resume. */
  freshEntry?: boolean;
} = {}) {
  const tResults = useTranslations("dashboard.home.composer.results");
  const active = useActiveClientProfile();
  const initialTargetFormats: Format[] = initialIntent === "format_adaptation"
    ? ["1:1", "9:16"]
    : [];
  const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
  const [request, setRequestState] = useState("");
  const [intent, setIntent] = useState<ComposerIntent>(initialIntent);
  const [format, setFormat] = useState<Format>("4:5");
  const [formatMode, setFormatMode] = useState<"auto" | "manual">("auto");
  const [targetFormats, setTargetFormats] = useState<Format[]>(initialTargetFormats);
  const [textLayout, setTextLayout] = useState<"top" | "center" | "bottom" | "side">("top");
  const [fontAssetKey, setFontAssetKey] = useState<string | null>(null);
  const [directionPool, setDirectionPool] = useState<CreativeDirectionPool | null>(
    initialIntent === "variations" ? createDefaultCreativeDirectionPool() : null,
  );
  const [quote, setQuote] = useState(() => canonicalQuote(
    initialIntent,
    "4:5",
    initialTargetFormats,
    initialIntent === "variations" ? createDefaultCreativeDirectionPool() : undefined,
  ));
  const [inferredBriefingContext, setInferredBriefingContext] = useState<{
    briefing: InferredBriefing;
    factPack: CreativeWorkFactPack;
  } | null>(null);
  const inferredBriefing = inferredBriefingContext?.briefing ?? null;
  const briefingFactPack = inferredBriefingContext?.factPack ?? null;
  const [briefingEditState, setBriefingEditState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [directionSuggestionState, setDirectionSuggestionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // #129: the pending set carries how it was fetched — the initial/late
  // response replaces the current pool (preserveSelection=false); an explicit
  // "Sugerir novamente" merges and keeps the selected chips (true).
  const [pendingDirectionSuggestions, setPendingDirectionSuggestions] = useState<{
    directions: CreativeDirection[];
    preserveSelection: boolean;
  } | null>(null);
  // Counts explicit "Sugerir novamente" requests. Persisted AI suggestions
  // block only the automatic first fetch (token 0); an explicit request must
  // always trigger a new suggestion call (#129).
  const [directionSuggestionRetryToken, setDirectionSuggestionRetryToken] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const uploadInFlightRef = useRef(false);
  const [actionPhase, setActionPhase] = useState<ComposerActionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [approvalErrorOutputId, setApprovalErrorOutputId] = useState<string | null>(null);
  // R-008: the only new visible decision — the restyle brand-authority
  // conflict raised by the 422 prepare response.
  const [brandConflict, setBrandConflict] = useState<CreativeWorkBrandConflict | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingProtocolSwitch, setPendingProtocolSwitch] = useState<ComposerIntent | null>(null);
  const [protocolSwitchNotice, setProtocolSwitchNotice] = useState<{
    from: ComposerIntent;
    to: ComposerIntent;
  } | null>(null);
  const [brandTrainingSuggestion, setBrandTrainingSuggestion] = useState<string | null>(null);
  const [failedInitialTemplateId, setFailedInitialTemplateId] = useState<string | null>(null);
  const [templateRetryToken, setTemplateRetryToken] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const draftKeyRef = useRef(crypto.randomUUID());
  const workIdRef = useRef(workId);
  const requestRef = useRef(request);
  const intentRef = useRef(intent);
  const formatRef = useRef(format);
  const targetFormatsRef = useRef(targetFormats);
  const textLayoutRef = useRef<"top" | "center" | "bottom" | "side">("top");
  const fontAssetKeyRef = useRef<string | null>(null);
  const directionPoolRef = useRef<CreativeDirectionPool | null>(directionPool);
  const formatModeRef = useRef<"auto" | "manual">("auto");
  const briefingOverridesRef = useRef<CreativeWorkBriefingOverrides | undefined>(undefined);
  const briefingVersionRef = useRef<number | undefined>(undefined);
  const hydratedWorkRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const createInFlightRef = useRef<Promise<string | null> | null>(null);
  const draftEpochRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const submitGuardRef = useRef(false);
  const directionSuggestionRequestedRef = useRef<string | null>(null);
  const directionTouchedRef = useRef(false);
  const autosaveBlockedWorkRef = useRef<string | null>(null);
  const didFocusComposerRef = useRef(false);
  const focusFrameRef = useRef<number | null>(null);
  const autoTemplateRef = useRef<string | null>(null);
  const consumedTemplateUrlRef = useRef(false);
  const mountedRef = useRef(false);
  const restoredProfileRef = useRef<string | null>(null);
  const lifecycleRef = useRef(0);
  const persistOnUnmountRef = useRef<() => Promise<void>>(async () => undefined);
  const revisionAttemptsRef = useRef(new Map<string, { revisionKey: string; revisionAssetId: string | null }>());

  const detailQuery = useCreativeWork(workId);
  const brandFontsQuery = useBrandFonts(
    intent === "single"
      ? detailQuery.data?.work.clientProfileId ?? active.activeClientProfileId ?? null
      : null,
  );
  const brandKnowledgeQuery = useBrandKnowledge(
    intent === "single" && !detailQuery.data?.work.identitySnapshot?.brandKnowledge
      ? detailQuery.data?.work.clientProfileId ?? active.activeClientProfileId ?? null
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

  useEffect(() => { workIdRef.current = workId; }, [workId]);
  useEffect(() => { requestRef.current = request; }, [request]);
  useEffect(() => { intentRef.current = intent; }, [intent]);
  useEffect(() => { formatRef.current = format; }, [format]);
  useEffect(() => { targetFormatsRef.current = targetFormats; }, [targetFormats]);
  useEffect(() => { textLayoutRef.current = textLayout; }, [textLayout]);
  useEffect(() => { fontAssetKeyRef.current = fontAssetKey; }, [fontAssetKey]);

  useEffect(() => {
    recordStudioEvent("studio_entry_started");
    // The control presentation still starts with its visible default protocol.
    recordStudioEvent("studio_goal_selected", { protocol: initialIntent });
  }, [initialIntent, recordStudioEvent]);

  useEffect(() => {
    if (!initialWorkId || !detailQuery.data?.work) return;
    recordCanonicalEvent("creative_work_reopened", detailQuery.data.work.id, {
      protocol: detailQuery.data.work.toolKind === "social_post" ? "variations" : detailQuery.data.work.toolKind,
    });
  }, [detailQuery.data?.work, initialWorkId, recordCanonicalEvent]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail || !detail.outputs.some((output) => ["completed", "failed"].includes(output.status))) return;
    recordCanonicalEvent("creative_work_reviewed", detail.work.id, {
      protocol: detail.work.toolKind === "social_post" ? "variations" : detail.work.toolKind,
    });
  }, [detailQuery.data, recordCanonicalEvent]);

  useEffect(() => {
    const work = detailQuery.data?.work;
    if (!work || hydratedWorkRef.current === work.id) return;
    if (!initialWorkId && work.status !== "draft") {
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
    formatModeRef.current = hydrated.settings.formatMode;
    briefingOverridesRef.current = hydrated.settings.briefingOverrides;
    briefingVersionRef.current = hydrated.settings.briefingVersion;
    lastPersistedRef.current = signature(hydrated);
    /* TanStack Query is the external persisted source for hydration. */
    setRequestState(work.request);
    setInferredBriefingContext(
      detailQuery.data?.inferredBriefing && detailQuery.data.briefingFactPack
        ? { briefing: detailQuery.data.inferredBriefing, factPack: detailQuery.data.briefingFactPack }
        : null,
    );
    setBriefingEditState("idle");
    setIntent(intentRef.current);
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
  }, [detailQuery.data, initialWorkId]);

  const captureSnapshot = useCallback((): DraftSnapshot => ({
    request: requestRef.current,
    intent: intentRef.current,
    format: formatRef.current,
    settings: {
      targetFormats: [...targetFormatsRef.current],
      formatMode: formatModeRef.current,
      ...(intentRef.current === "single" ? {
        ...(textLayoutRef.current !== "top" ? { textLayout: textLayoutRef.current } : {}),
        ...(fontAssetKeyRef.current ? { fontAssetKey: fontAssetKeyRef.current } : {}),
      } : {}),
      ...(directionPoolRef.current ? {
        directionPool: {
          ...directionPoolRef.current,
          directions: directionPoolRef.current.directions.map((direction) => ({ ...direction })),
          selectedIds: [...directionPoolRef.current.selectedIds],
        },
      } : {}),
      ...(briefingOverridesRef.current ? { briefingOverrides: { ...briefingOverridesRef.current } } : {}),
      ...(briefingVersionRef.current !== undefined ? { briefingVersion: briefingVersionRef.current } : {}),
    },
  }), []);

  const enqueueSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = saveChainRef.current.then(operation, operation);
    saveChainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const exposeWorkId = useCallback((id: string) => {
    if (typeof window === "undefined" || !UUID_SCHEMA.safeParse(id).success) return;
    const params = new URLSearchParams(window.location.search);
    params.set("workId", id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  const exposeIntent = useCallback((next: ComposerIntent) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("workId");
    params.set("intent", next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  useEffect(() => {
    const profileId = active.activeClientProfileId;
    if (freshEntry || initialWorkId || workIdRef.current || !profileId || restoredProfileRef.current === profileId) return;
    restoredProfileRef.current = profileId;
    const storedWorkId = readStoredDraft(profileId, intentRef.current);
    if (!storedWorkId) return;
    workIdRef.current = storedWorkId;
    setWorkId(storedWorkId);
    exposeWorkId(storedWorkId);
  }, [active.activeClientProfileId, exposeWorkId, freshEntry, initialWorkId]);

  const consumeInitialTemplateParams = useCallback(() => {
    if (
      typeof window === "undefined"
      || !initialTemplateId
      || consumedTemplateUrlRef.current
    ) return;
    const current = new URLSearchParams(window.location.search);
    if (current.get("templateId") !== initialTemplateId) return;

    const canonical = new URLSearchParams();
    const workIdCandidate = current.get("workId") ?? workIdRef.current;
    if (workIdCandidate && UUID_SCHEMA.safeParse(workIdCandidate).success) {
      canonical.set("workId", workIdCandidate);
    }
    const intentCandidate = current.get("intent");
    if (intentCandidate && COMPOSER_INTENTS.has(intentCandidate as ComposerIntent)) {
      canonical.set("intent", intentCandidate);
    }
    const query = canonical.toString();
    const destination = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", destination);
    consumedTemplateUrlRef.current = true;
  }, [initialTemplateId]);

  const ensureDraft = useCallback((source?: DraftSource, silent = false) => {
    if (workIdRef.current) return Promise.resolve(workIdRef.current);
    if (createInFlightRef.current) {
      const creating = createInFlightRef.current;
      if (!source) return creating;
      // A debounced text autosave may already be creating the draft while an
      // upload finishes. Preserve that newly-arrived source instead of
      // returning the source-less in-flight promise and silently dropping it.
      return creating.then(async (id) => {
        if (!id) return null;
        await sourceMutation.mutateAsync({
          workItemId: id,
          action: "attachSource",
          ...source,
          usage: source.usage ?? "both",
        });
        return id;
      });
    }
    if (!active.activeClientProfileId) {
      focusBrandSwitcher();
      return Promise.resolve(null);
    }
    const snapshot = captureSnapshot();
    if (!snapshot.request && !source) return Promise.resolve(null);
    const draftEpoch = draftEpochRef.current;

    const promise = enqueueSave(async () => {
      const result = await createMutation.mutateAsync({
        clientProfileId: active.activeClientProfileId!,
        draftKey: draftKeyRef.current,
        ...snapshot,
        ...(source ? { ...source, usage: source.usage ?? "both" } : {}),
      });
      if (!UUID_SCHEMA.safeParse(result.work.id).success) {
        throw new Error("Identificador do trabalho inválido");
      }
      if (draftEpoch !== draftEpochRef.current) return null;
      recordCanonicalEvent("creative_work_started", result.work.id, {
        protocol: result.work.toolKind === "social_post" ? "variations" : result.work.toolKind,
        inputMode: snapshot.request.trim() ? (source ? "both" : "text") : "art",
      });
      workIdRef.current = result.work.id;
      lastPersistedRef.current = signature(snapshotFromWork(result.work));
      writeStoredDraft(active.activeClientProfileId!, intentRef.current, result.work.id);
      if (!silent && mountedRef.current) {
        setWorkId(result.work.id);
        setQuote(result.quote);
        setAnnouncement("Rascunho salvo");
        exposeWorkId(result.work.id);
      }
      return result.work.id;
    }).catch((cause) => {
      if (draftEpoch === draftEpochRef.current && !silent && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Falha ao salvar rascunho");
      }
      return null;
    }).finally(() => {
      if (createInFlightRef.current === promise) createInFlightRef.current = null;
    });
    createInFlightRef.current = promise;
    return promise;
  }, [active.activeClientProfileId, captureSnapshot, createMutation, enqueueSave, exposeWorkId, recordCanonicalEvent, sourceMutation]);

  const persistSnapshot = useCallback((id: string, snapshot: DraftSnapshot, announce = true) => enqueueSave(async () => {
    if (autosaveBlockedWorkRef.current === id) return;
    const sentSignature = signature(snapshot);
    if (sentSignature === lastPersistedRef.current) return;
    try {
      await autosaveMutation.mutateAsync({ workItemId: id, ...snapshot });
    } catch (cause) {
      const code = cause instanceof Error && "code" in cause
        ? (cause as Error & { code?: unknown }).code
        : cause instanceof Error
          ? cause.message
          : null;
      if (code === "creativeWorkNotDraft") autosaveBlockedWorkRef.current = id;
      throw cause;
    }
    lastPersistedRef.current = sentSignature;
    if (announce && mountedRef.current) setAnnouncement("Alterações salvas");
  }), [autosaveMutation, enqueueSave]);

  const flushAutosave = useCallback(async (): Promise<string | null> => {
    if (initialWorkId && !hydratedWorkRef.current) return null;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft();
    if (!id) return null;
    if (autosaveBlockedWorkRef.current === id) return null;
    const current = detailQuery.data?.work;
    if (current?.id === id && current.status !== "draft") return null;
    for (;;) {
      await saveChainRef.current;
      const snapshot = captureSnapshot();
      if (signature(snapshot) === lastPersistedRef.current) return id;
      await persistSnapshot(id, snapshot);
    }
  }, [captureSnapshot, detailQuery.data?.work, ensureDraft, initialWorkId, persistSnapshot]);

  persistOnUnmountRef.current = async () => {
    if (initialWorkId && !hydratedWorkRef.current) return;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft(undefined, true);
    if (!id) return;
    if (autosaveBlockedWorkRef.current === id) return;
    const current = detailQuery.data?.work;
    if (current?.id === id && current.status !== "draft") return;
    const snapshot = captureSnapshot();
    if (signature(snapshot) !== lastPersistedRef.current) {
      await persistSnapshot(id, snapshot, false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = ++lifecycleRef.current;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        // StrictMode immediately installs a newer lifecycle before this microtask runs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (lifecycleRef.current === lifecycle) void persistOnUnmountRef.current();
      });
    };
  }, []);

  useEffect(() => {
    const receiveAnnouncement = (event: Event) => {
      const message = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : null;
      if (!message) return;
      setAnnouncement(message);
      try {
        window.sessionStorage.removeItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
      } catch {
        /* Storage is optional; the event still reaches the mounted composer. */
      }
    };
    window.addEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
    try {
      const pending = window.sessionStorage.getItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
      if (pending) receiveAnnouncement(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: pending }));
    } catch {
      /* Storage is optional; future announcements still arrive through the event. */
    }
    return () => window.removeEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
  }, []);

  const announce = useCallback((message: string) => {
    if (mountedRef.current) setAnnouncement(message);
    if (typeof window === "undefined") return;
    try {
      // Creating the first draft canonicalizes the URL and can remount the
      // composer before an upload finishes. Keep the message until the new
      // live region consumes it, and broadcast for the already-mounted case.
      window.sessionStorage.setItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY, message);
    } catch {
      /* Storage is optional; the event remains the primary delivery path. */
    }
    window.dispatchEvent(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: message }));
  }, []);

  useEffect(() => {
    if (!focusComposer || didFocusComposerRef.current || focusFrameRef.current !== null) return;
    const frame = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      didFocusComposerRef.current = true;
    });
    focusFrameRef.current = frame;
  }, [focusComposer]);

  useEffect(() => {
    if (initialWorkId && !hydratedWorkRef.current) return;
    const current = detailQuery.data?.work;
    if (workIdRef.current && (!current || current.id !== workIdRef.current)) return;
    if (workIdRef.current && current?.id === workIdRef.current && current.status !== "draft") return;
    if (workIdRef.current && autosaveBlockedWorkRef.current === workIdRef.current) return;
    const timer = window.setTimeout(() => {
      if (!workIdRef.current && !active.activeClientProfileId) {
        if (requestRef.current.trim()) focusBrandSwitcher();
        return;
      }
      const save = async () => {
        const id = workIdRef.current ?? await ensureDraft();
        if (id) await persistSnapshot(id, captureSnapshot());
      };
      void save().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao salvar"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [active.activeClientProfileId, captureSnapshot, detailQuery.data?.work, directionPool, ensureDraft, fontAssetKey, format, formatMode, initialWorkId, intent, persistSnapshot, request, targetFormats, textLayout]);

  const setRequest = useCallback((value: string) => {
    requestRef.current = value;
    setRequestState(value);
    setInferredBriefingContext(null);
    setBriefingEditState("idle");
  }, []);

  const editBriefingField = useCallback(async (field: CreativeWorkBriefingField, value: string) => {
    const id = workIdRef.current;
    const current = detailQuery.data?.work;
    if (!id || !current || current.status !== "draft" || intentRef.current !== "single" || !inferredBriefing) return;
    setBriefingEditState("saving");
    setError(null);
    try {
      const edited = await editBriefingMutation.mutateAsync({
        workItemId: id,
        field,
        value: value.trim() || null,
        expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
      });
      briefingOverridesRef.current = edited.briefingOverrides;
      briefingVersionRef.current = edited.briefingVersion;
      setInferredBriefingContext({ briefing: edited.briefing, factPack: edited.briefingFactPack });
      setBriefingEditState("saved");
      setAnnouncement("Briefing salvo");
    } catch (cause) {
      setBriefingEditState("error");
      setError(cause instanceof Error ? cause.message : "Falha ao salvar o briefing");
    }
  }, [detailQuery.data?.work, editBriefingMutation, inferredBriefing]);

  const switchToProtocol = useCallback(async (next: ComposerIntent) => {
    const previous = intentRef.current;
    if (next === previous) return;

    const currentWork = detailQuery.data?.work;
    const currentWorkId = workIdRef.current;
    const currentIsDraft = Boolean(currentWorkId && currentWork?.id === currentWorkId && currentWork.status === "draft");
    const currentHasContext = currentIsDraft && Boolean(currentWork?.request.trim() || detailQuery.data?.sources.length);
    const profileId = currentWork?.clientProfileId ?? active.activeClientProfileId;
    const reusableSource = reusableSourceForProtocol(previous, next, detailQuery.data?.sources ?? []);

    if (currentIsDraft) {
      try {
        setActionPhase("saving");
        await flushAutosave();
      } catch (cause) {
        setActionPhase("idle");
        setError(cause instanceof Error ? cause.message : "Falha ao preservar o rascunho");
        return;
      }
      if (profileId && currentWorkId) writeStoredDraft(profileId, previous, currentWorkId);
    }

    draftEpochRef.current += 1;
    createInFlightRef.current = null;
    autosaveBlockedWorkRef.current = null;
    hydratedWorkRef.current = null;
    lastPersistedRef.current = null;
    requestRef.current = "";
    setRequestState("");
    setError(null);
    setBrandConflict(null);
    setInferredBriefingContext(null);
    setBriefingEditState("idle");
    briefingOverridesRef.current = undefined;
    briefingVersionRef.current = undefined;
    directionSuggestionRequestedRef.current = null;
    directionTouchedRef.current = false;
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("idle");
    setDirectionSuggestionRetryToken(0);
    setActionPhase("idle");
    intentRef.current = next;
    setIntent(next);
    const nextTargets: Format[] = next === "format_adaptation" ? ["1:1", "9:16"] : [];
    targetFormatsRef.current = nextTargets;
    setTargetFormats(nextTargets);
    textLayoutRef.current = "top";
    fontAssetKeyRef.current = null;
    setTextLayout("top");
    setFontAssetKey(null);
    const nextDirectionPool = next === "variations" ? createDefaultCreativeDirectionPool() : null;
    directionPoolRef.current = nextDirectionPool;
    setDirectionPool(nextDirectionPool);
    setQuote(canonicalQuote(next, formatRef.current, nextTargets, nextDirectionPool ?? undefined));
    const nextWorkId = profileId ? readStoredDraft(profileId, next) : null;
    workIdRef.current = nextWorkId;
    setWorkId(nextWorkId);
    if (nextWorkId) exposeWorkId(nextWorkId);
    else {
      draftKeyRef.current = crypto.randomUUID();
      exposeIntent(next);
      if (reusableSource) await ensureDraft(reusableSource);
    }
    setProtocolSwitchNotice(currentHasContext ? { from: previous, to: next } : null);
    if (next !== "restyle") requestAnimationFrame(() => composerRef.current?.focus());
  }, [active.activeClientProfileId, detailQuery.data, ensureDraft, exposeIntent, exposeWorkId, flushAutosave]);

  const selectIntent = useCallback((next: ComposerIntent) => {
    if (next === intentRef.current) return;
    const currentSnapshot = captureSnapshot();
    const hasUnsavedChanges = lastPersistedRef.current !== null
      && signature(currentSnapshot) !== lastPersistedRef.current;
    const hasPendingWork = isUploading
      || actionPhase !== "idle"
      || sourceMutation.isPending
      || createMutation.isPending
      || Boolean(createInFlightRef.current)
      || hasUnsavedChanges;
    if (hasPendingWork) {
      setPendingProtocolSwitch(next);
      return;
    }
    void switchToProtocol(next);
  }, [actionPhase, captureSnapshot, createMutation.isPending, isUploading, sourceMutation.isPending, switchToProtocol]);

  const confirmProtocolSwitch = useCallback(() => {
    const next = pendingProtocolSwitch;
    setPendingProtocolSwitch(null);
    if (next) void switchToProtocol(next);
  }, [pendingProtocolSwitch, switchToProtocol]);

  const cancelProtocolSwitch = useCallback(() => setPendingProtocolSwitch(null), []);

  const returnToPreviousProtocol = useCallback(() => {
    const previous = protocolSwitchNotice?.from;
    if (!previous) return;
    void switchToProtocol(previous);
  }, [protocolSwitchNotice, switchToProtocol]);

  const toggleDirection = useCallback((directionId: string) => {
    if (intentRef.current !== "variations") return;
    const current = directionPoolRef.current ?? createDefaultCreativeDirectionPool();
    const selectedIds = current.selectedIds.includes(directionId)
      ? current.selectedIds.filter((id) => id !== directionId)
      : current.selectedIds.length < 5
        ? [...current.selectedIds, directionId]
        : current.selectedIds;
    if (selectedIds.length === 0 || selectedIds === current.selectedIds) return;
    const next = { ...current, selectedIds };
    directionTouchedRef.current = true;
    directionPoolRef.current = next;
    setDirectionPool(next);
    setQuote(canonicalQuote("variations", formatRef.current, targetFormatsRef.current, next));
  }, []);

  const setManualDirectionInstruction = useCallback((manualInstruction: string) => {
    if (intentRef.current !== "variations") return;
    const current = directionPoolRef.current ?? createDefaultCreativeDirectionPool();
    const next = { ...current, manualInstruction: manualInstruction || null };
    directionTouchedRef.current = true;
    directionPoolRef.current = next;
    setDirectionPool(next);
  }, []);

  const applyDirectionSuggestions = useCallback((suggestions: CreativeDirection[], preserveSelection = true) => {
    if (suggestions.length === 0) return;
    const current = directionPoolRef.current;
    // #129: "Sugerir novamente" keeps every selected chip and replaces only
    // the unselected ones, up to five. The untouched first auto-apply and the
    // confirmed initial/late response pass preserveSelection=false so the
    // received set replaces the current pool with its top suggestions selected.
    const keptDirections = preserveSelection && current
      ? current.directions.filter((direction) => current.selectedIds.includes(direction.id))
      : [];
    const directions = [...keptDirections];
    for (const suggestion of suggestions) {
      if (directions.length >= 5) break;
      if (!directions.some((direction) => direction.id === suggestion.id)) directions.push(suggestion);
    }
    if (directions.length === 0) return;
    const next = {
      version: 1,
      directions,
      selectedIds: keptDirections.length > 0
        ? keptDirections.map((direction) => direction.id)
        : directions.slice(0, 3).map((direction) => direction.id),
      manualInstruction: current?.manualInstruction ?? null,
    } satisfies CreativeDirectionPool;
    directionPoolRef.current = next;
    setDirectionPool(next);
    setQuote(canonicalQuote("variations", formatRef.current, targetFormatsRef.current, next));
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("ready");
  }, []);

  const requestDirectionSuggestions = useCallback(() => {
    directionSuggestionRequestedRef.current = null;
    setDirectionSuggestionState("idle");
    setDirectionSuggestionRetryToken((value) => value + 1);
  }, []);

  const keepCurrentDirections = useCallback(() => {
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("ready");
  }, []);

  useEffect(() => {
    const currentWork = detailQuery.data?.work;
    const readySource = detailQuery.data?.sources.find((source) => source.status === "ready");
    if (
      intent !== "variations"
      || !workId
      || !readySource
      || (currentWork && currentWork.status !== "draft")
      // Persisted AI suggestions block only the automatic fetch; an explicit
      // "Sugerir novamente" (retry token > 0) always fetches again (#129).
      || (directionSuggestionRetryToken === 0
        && currentWork?.settings.directionPool?.directions.some((direction) => direction.provenance === "ai-suggestion"))
      || directionSuggestionRequestedRef.current === workId
    ) return;

    directionSuggestionRequestedRef.current = workId;
    setDirectionSuggestionState("loading");
    // Captured at fetch time: retry token 0 is the initial/late response
    // (replace the pool on apply); token > 0 is "Sugerir novamente" (merge).
    const preserveSelection = directionSuggestionRetryToken > 0;
    void suggestDirectionMutation.mutateAsync(workId).then((result) => {
      if (directionTouchedRef.current) {
        setPendingDirectionSuggestions({ directions: result.directions, preserveSelection });
        setDirectionSuggestionState("ready");
      } else {
        applyDirectionSuggestions(result.directions, preserveSelection);
      }
    }).catch(() => setDirectionSuggestionState("error"));
  }, [applyDirectionSuggestions, detailQuery.data?.sources, detailQuery.data?.work, directionSuggestionRetryToken, directionSuggestionState, intent, suggestDirectionMutation, workId]);

  const toggleTargetFormat = useCallback((value: Format) => {
    setTargetFormats((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      targetFormatsRef.current = next;
      setQuote(canonicalQuote(intentRef.current, formatRef.current, next, directionPoolRef.current ?? undefined));
      return next;
    });
  }, []);

  const addFiles = useCallback(async (
    files: FileList | File[] | null,
    preferredUsage?: CreativeSourceUsage,
  ) => {
    const images = collectImageFiles(files);
    if (images.length === 0) return;
    const accepted = intentRef.current === "single"
      ? images.slice(0, Math.max(0, MAX_PIECE_REFERENCES - (detailQuery.data?.sources.filter((source) => source.assetId).length ?? 0)))
      : images;
    const rejectedByLimit = images.length - accepted.length;
    if (accepted.length === 0) {
      announce(`Limite de 3 atingido; ${rejectedByLimit} arquivo${rejectedByLimit === 1 ? "" : "s"} não enviado${rejectedByLimit === 1 ? "" : "s"}`);
      return;
    }
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }
    uploadInFlightRef.current = true;
    setIsUploading(true);
    setError(null);
    try {
      let hasRestyleContent = Boolean(detailQuery.data?.sources.some((source) =>
        source.usageConfirmed && (source.usage === "content" || source.usage === "both")
      ));
      for (const file of accepted) {
        const uploaded = await uploadChatAttachment(file);
        const usage: CreativeSourceUsage = preferredUsage ?? (intentRef.current === "restyle"
          ? (hasRestyleContent ? "style" : "content")
          : "both");
        if (usage === "content") hasRestyleContent = true;
        const existingId = workIdRef.current;
        if (!existingId) {
          await ensureDraft({ assetId: uploaded.assetId, usage });
        } else {
          await sourceMutation.mutateAsync({
            workItemId: existingId,
            action: "attachSource",
            assetId: uploaded.assetId,
            usage,
          });
        }
      }
      setInferredBriefingContext(null);
      const addedAnnouncement = accepted.length === 1 ? "Arte adicionada" : `${accepted.length} artes adicionadas`;
      announce(rejectedByLimit > 0 ? `${addedAnnouncement}; ${rejectedByLimit} arquivo${rejectedByLimit === 1 ? "" : "s"} não enviado${rejectedByLimit === 1 ? "" : "s"} pelo limite de 3` : addedAnnouncement);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar arte");
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [active.activeClientProfileId, announce, detailQuery.data?.sources, ensureDraft, sourceMutation]);

  const attachDraftSource = useCallback(async (source: DraftSource): Promise<boolean> => {
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return false;
    }
    const existingId = workIdRef.current;
    if (existingId) {
      await sourceMutation.mutateAsync({
        workItemId: existingId,
        action: "attachSource",
        ...source,
        usage: source.usage ?? (intentRef.current === "restyle" ? "style" : "both"),
      });
      setInferredBriefingContext(null);
      return true;
    }
    return Boolean(await ensureDraft(source));
  }, [active.activeClientProfileId, ensureDraft, sourceMutation]);

  const addInspiration = useCallback(async (inspiration: CreativeInspiration) => {
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }
    setError(null);
    if (!inspiration.templateId && !inspiration.assetId && !inspiration.curatedInspirationId) {
      setError("Inspiração indisponível");
      return;
    }
    try {
      let assetId = inspiration.assetId;
      if (inspiration.curatedInspirationId) {
        const response = await apiFetch(
          `/api/creative-work/inspirations/${inspiration.curatedInspirationId}`,
          { method: "POST", timeoutMs: 60_000 },
        );
        const payload = await response.json().catch(() => ({})) as { assetId?: string; error?: string };
        if (!response.ok || !payload.assetId) {
          throw new Error(payload.error ?? "Falha ao preparar inspiração");
        }
        assetId = payload.assetId;
      }
      selectIntent(inspiration.suggestedIntent === "social_post" ? "variations" : inspiration.suggestedIntent);
      const source: DraftSource = inspiration.templateId
        ? { templateId: inspiration.templateId, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" }
        : { assetId: assetId!, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" };
      if (!await attachDraftSource(source)) return;
      setAnnouncement("Inspiração adicionada");
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
    }
  }, [active.activeClientProfileId, attachDraftSource, selectIntent]);

  const retryInitialTemplate = useCallback(() => {
    if (!initialTemplateId) return;
    autoTemplateRef.current = null;
    setFailedInitialTemplateId(null);
    setError(null);
    setTemplateRetryToken((value) => value + 1);
  }, [initialTemplateId]);

  useEffect(() => {
    if (!initialTemplateId || autoTemplateRef.current === initialTemplateId) return;
    if (active.isLoading) return;
    if (initialWorkId && !hydratedWorkRef.current) return;
    if (detailQuery.data?.sources.some((source) => source.templateId === initialTemplateId)) {
      autoTemplateRef.current = initialTemplateId;
      consumeInitialTemplateParams();
      return;
    }
    if (failedInitialTemplateId === initialTemplateId) return;
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }

    autoTemplateRef.current = initialTemplateId;
    void attachDraftSource({ templateId: initialTemplateId })
      .then((attached) => {
        if (!attached) {
          autoTemplateRef.current = null;
          if (mountedRef.current) setFailedInitialTemplateId(initialTemplateId);
          return;
        }
        consumeInitialTemplateParams();
        if (mountedRef.current) {
          setFailedInitialTemplateId(null);
          setAnnouncement("Inspiração adicionada");
        }
      })
      .catch((cause) => {
        autoTemplateRef.current = null;
        if (mountedRef.current) {
          setFailedInitialTemplateId(initialTemplateId);
          setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
        }
      });
  }, [
    active.activeClientProfileId,
    active.isLoading,
    attachDraftSource,
    consumeInitialTemplateParams,
    detailQuery.data?.sources,
    failedInitialTemplateId,
    initialTemplateId,
    initialWorkId,
    templateRetryToken,
  ]);

  const runSourceAction = useCallback(async (action: Parameters<typeof sourceMutation.mutateAsync>[0]): Promise<boolean> => {
    try {
      await sourceMutation.mutateAsync(action);
      setInferredBriefingContext(null);
      if (action.action === "updateSource") {
        recordStudioEvent("studio_source_role_selected", {
          creativeWorkId: action.workItemId,
          sourceRole: action.usage,
        });
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
      return false;
    }
  }, [recordStudioEvent, sourceMutation]);

  const updateSource = useCallback((sourceId: string, usage: CreativeSourceUsage) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "updateSource", sourceId, usage });
  }, [runSourceAction]);
  const editSource = useCallback((sourceId: string, content: ContentBrief | null, style: StyleBrief | null) => {
    if (!workIdRef.current) return Promise.resolve(false);
    return runSourceAction({
      workItemId: workIdRef.current,
      action: "editSourceAnalysis",
      sourceId,
      content,
      style,
    });
  }, [runSourceAction]);
  const retrySource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    const workItemId = workIdRef.current;
    return sourceMutation.mutateAsync({ workItemId, action: "retrySource", sourceId })
      .then(() => {
        setInferredBriefingContext(null);
      })
      .catch(async (cause) => {
        // A poll or a duplicate click may win the source CAS between the
        // detail read and retry. The server's 409 is a safe no-op: refresh
        // the canonical source state instead of surfacing "Entrada inválida".
        if (isCreativeWorkConflict(cause)) {
          await detailQuery.refetch();
          setInferredBriefingContext(null);
          setError(null);
          return;
        }
        setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
      });
  }, [detailQuery, sourceMutation]);
  const removeSource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "removeSource", sourceId });
  }, [runSourceAction]);
  const updatePieceReference = useCallback((sourceId: string, patch: { category?: PieceReferenceCategory; userInstruction?: string | null }) => {
    if (!workIdRef.current) return Promise.resolve(false);
    return runSourceAction({ workItemId: workIdRef.current, action: "updatePieceReference", sourceId, ...patch });
  }, [runSourceAction]);
  const replacePieceReference = useCallback(async (sourceId: string, file: File) => {
    if (!workIdRef.current) return false;
    // The upload precedes the source mutation; hold the same visible lock for
    // both so submit cannot prepare between selecting a replacement and its
    // committed atomic source update.
    uploadInFlightRef.current = true;
    setIsUploading(true);
    try {
      const uploaded = await uploadChatAttachment(file);
      return await runSourceAction({ workItemId: workIdRef.current, action: "replacePieceReference", sourceId, assetId: uploaded.assetId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao substituir arte");
      return false;
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [runSourceAction]);
  const promotePieceReference = useCallback(async (sourceId: string) => {
    if (!workIdRef.current) return false;
    return runSourceAction({ workItemId: workIdRef.current, action: "promotePieceReference", sourceId });
  }, [runSourceAction]);

  const submissionBlocked = () => submitGuardRef.current
    || generateMutation.isPending
    || editBriefingMutation.isPending
    || briefingEditState === "saving"
    || inferredBriefing?.readiness === "blocked"
    || sourceMutation.isPending
    || isUploading
    || uploadInFlightRef.current;

  const preparePlanCommand = useCallback(async (): Promise<PreparedPlanProjectionV1 | null> => {
    const current = detailQuery.data?.work;
    if (current && current.status !== "draft") return detailQuery.data?.preparedPlan ?? null;
    setActionPhase("saving");
    setError(null);
    setBrandConflict(null);
    try {
      const id = await flushAutosave();
      if (!id) return null;
      const pendingSources = (detailQuery.data?.sources ?? []).filter((source) => source.status === "uploaded" || source.status === "analyzing");
      if (pendingSources.length > 0) {
        setError("Aguarde a análise da arte terminar antes de gerar.");
        return null;
      }
      setActionPhase("preparing");
      const prepared = await prepareMutation.mutateAsync({ workItemId: id });
      if (prepared.briefing && prepared.briefingFactPack) setInferredBriefingContext({ briefing: prepared.briefing, factPack: prepared.briefingFactPack });
      lastPersistedRef.current = signature(snapshotFromWork(prepared.work));
      setQuote(prepared.quote);
      formatRef.current = prepared.work.format;
      setFormat(prepared.work.format);
      recordCanonicalEvent("briefing_ready", id, { protocol: prepared.preparedPlan.protocol });
      return prepared.preparedPlan;
    } catch (cause) {
      const conflict = extractCreativeWorkBrandConflict(cause);
      if (conflict) setBrandConflict(conflict);
      else {
        const blocked = extractCreativeWorkBriefingBlocked(cause);
        if (blocked) setInferredBriefingContext({ briefing: blocked.briefing, factPack: blocked.factPack });
        setError(cause instanceof Error ? cause.message : "Falha ao preparar plano");
      }
      return null;
    } finally {
      setActionPhase("idle");
    }
  }, [detailQuery.data, flushAutosave, prepareMutation, recordCanonicalEvent]);

  const confirmGenerationCommand = useCallback(async (preparedRevision?: string): Promise<void> => {
    const current = detailQuery.data?.work;
    const id = current?.id ?? workIdRef.current;
    const revision = preparedRevision ?? detailQuery.data?.preparedPlan?.preparedRevision;
    if (!id || !revision) {
      setError("Revise o plano antes de gerar.");
      return;
    }
    if (current && current.status !== "draft" && !(current.status === "ready" && (detailQuery.data?.outputs.length ?? 0) === 0)) return;
    setActionPhase("submitting");
    setError(null);
    try {
      const generated = await generateMutation.mutateAsync({ workItemId: id, preparedRevision: revision, ...(studioSessionId ? { studioSessionId } : {}), rolloutVariant: workflowVariant });
      setBrandConflict(null);
      setBrandTrainingSuggestion(generated.brandTrainingSuggestion);
      setAnnouncement("Geração iniciada");
      recordStudioEvent("studio_plan_confirmed", { creativeWorkId: id });
    } catch (cause) {
      if (isApiRequestUncertain(cause) && workIdRef.current) {
        setActionPhase("reconciling");
        try {
          const reconciled = await detailQuery.refetch();
          const detail = reconciled.data;
          if (detail && (detail.work.status === "generating" || detail.outputs.length > 0)) {
            setError(null);
            setAnnouncement("Geração aceita; acompanhando o processamento");
          } else setError("A geração não foi confirmada. Tente gerar novamente.");
        } catch {
          setError("Não foi possível confirmar o estado da geração. Atualize e tente novamente.");
        }
      } else setError(cause instanceof Error ? cause.message : "Falha ao gerar");
    } finally {
      setActionPhase("idle");
    }
  }, [detailQuery, generateMutation, recordStudioEvent, studioSessionId, workflowVariant]);

  const preparePlan = useCallback(async () => {
    if (submissionBlocked()) return null;
    submitGuardRef.current = true;
    try { return await preparePlanCommand(); }
    finally { submitGuardRef.current = false; }
  }, [preparePlanCommand]);

  const confirmGeneration = useCallback(async (preparedRevision?: string) => {
    if (submissionBlocked()) return;
    submitGuardRef.current = true;
    try { await confirmGenerationCommand(preparedRevision); }
    finally { submitGuardRef.current = false; }
  }, [confirmGenerationCommand]);

  const generateLegacy = useCallback(async () => {
    if (submissionBlocked()) return;
    submitGuardRef.current = true;
    try {
      const current = detailQuery.data?.work;
      const resumePrepared = Boolean(current && current.status === "ready" && (detailQuery.data?.outputs.length ?? 0) === 0);
      const plan = resumePrepared ? detailQuery.data?.preparedPlan ?? null : await preparePlanCommand();
      if (!plan) return;
      await confirmGenerationCommand(plan?.preparedRevision);
    } finally { submitGuardRef.current = false; }
  }, [confirmGenerationCommand, detailQuery.data, preparePlanCommand]);

  const resolveBrandConflict = useCallback(async (choice: CreativeWorkBrandChoice) => {
    // Double-click guard: one choice in flight per conflict.
    if (!workIdRef.current || !brandConflict || resolveBrandConflictMutation.isPending) return;
    try {
      // The corrected authority is shown through a new prepared plan; only
      // the temporary control wrapper may subsequently confirm generation.
      await resolveBrandConflictMutation.mutateAsync({ workItemId: workIdRef.current, choice });
      setBrandConflict(null);
      setAnnouncement("Escolha de marca salva");
      const plan = await preparePlan();
      if (workflowVariant === "control" && plan) await confirmGeneration(plan.preparedRevision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar escolha de marca");
    }
  }, [brandConflict, confirmGeneration, preparePlan, resolveBrandConflictMutation, workflowVariant]);

  const retryOutput = useCallback(async (outputId: string) => {
    if (!workIdRef.current) return;
    try {
      await retryOutputMutation.mutateAsync({ workItemId: workIdRef.current, outputId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao repetir proposta");
    }
  }, [retryOutputMutation]);

  const layerizeOutput = useCallback(async (outputId: string, retry = false, operationId = crypto.randomUUID()): Promise<"accepted" | "terminal" | "uncertain"> => {
    if (!workIdRef.current) return "terminal";
    try {
      await layerizeOutputMutation.mutateAsync({ workItemId: workIdRef.current, outputId, operationId, ...(retry ? { retry: true } : {}) });
      setAnnouncement(retry ? tResults("layerizeRestarted") : tResults("layerizeStarted"));
      return "accepted";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tResults("layerizeRequestFailed"));
      const code = typeof cause === "object" && cause && "code" in cause ? (cause as { code?: string }).code : null;
      return isApiRequestUncertain(cause) || code === "creativeWorkLayerizationDispatchFailed" ? "uncertain" : "terminal";
    }
  }, [layerizeOutputMutation, tResults]);

  const approveOutput = useCallback(async (outputId: string, confirmObjective = false) => {
    if (!workIdRef.current) return;
    setApprovalErrorOutputId(null);
    try {
      await selectOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        saveToLibrary: false,
        confirmObjective,
      });
      setAnnouncement("Proposta aprovada");
      recordCanonicalEvent("creative_work_approved", workIdRef.current, {
        protocol: detailQuery.data?.work.toolKind === "social_post" ? "variations" : detailQuery.data?.work.toolKind ?? "variations",
      });
    } catch (cause) {
      setApprovalErrorOutputId(outputId);
      setError(cause instanceof Error ? cause.message : "Falha ao aprovar proposta");
    }
  }, [detailQuery.data?.work.toolKind, recordCanonicalEvent, selectOutputMutation]);

  const reviseOutput = useCallback(async (outputId: string, instruction: string, attachment: File | null) => {
    if (!workIdRef.current || !instruction.trim()) return;
    const attemptKey = `${outputId}:${instruction.trim()}:${attachment?.name ?? ""}:${attachment?.size ?? 0}`;
    try {
      let attempt = revisionAttemptsRef.current.get(attemptKey);
      if (!attempt) {
        const uploaded = attachment ? await uploadChatAttachment(attachment) : null;
        attempt = { revisionKey: crypto.randomUUID(), revisionAssetId: uploaded?.assetId ?? null };
        revisionAttemptsRef.current.set(attemptKey, attempt);
      }
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        instruction: instruction.trim(),
        ...attempt,
      });
      revisionAttemptsRef.current.delete(attemptKey);
      setAnnouncement("Nova versão em geração");
      recordStudioEvent("studio_refinement_started", { creativeWorkId: workIdRef.current });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar nova versão");
    }
  }, [recordStudioEvent, reviseOutputMutation]);

  const retryRevisionOutput = useCallback(async (output: CreativeWorkOutput) => {
    if (!workIdRef.current || !output.parentOutputId || !output.revisionInstruction) return;
    try {
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId: output.parentOutputId,
        revisionKey: crypto.randomUUID(),
        instruction: output.revisionInstruction,
        revisionAssetId: output.revisionAssetId,
      });
      setAnnouncement("Nova tentativa em geração");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao tentar nova versão");
    }
  }, [reviseOutputMutation]);

  const linkCampaign = useCallback(async (campaignId: string | null) => {
    if (!workIdRef.current) return;
    try {
      await linkCampaignMutation.mutateAsync({ workItemId: workIdRef.current, campaignId });
      setAnnouncement(campaignId ? "Campanha vinculada" : "Campanha removida");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao agrupar em campanha");
    }
  }, [linkCampaignMutation]);

  const detail = detailQuery.data;
  const objectiveSelected = true;
  const preparedPlan = detail?.preparedPlan ?? null;
  const stage = projectComposerStage({ objectiveSelected, detail: detail ?? null });
  const state = useMemo<ComposerState>(() => {
    if (generateMutation.isPending || detail?.work.status === "generating") return "generating";
    if (detail && (detail.outputs.length > 0 || ["partial", "completed", "failed"].includes(detail.work.status))) return "results";
    if (isUploading || createMutation.isPending || autosaveMutation.isPending || sourceMutation.isPending) return "saving";
    if (prepareMutation.isPending || detail?.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) return "analyzing";
    if (workId || request.trim() || detail?.sources.length) return "ready";
    return "empty";
  }, [autosaveMutation.isPending, createMutation.isPending, detail, generateMutation.isPending, isUploading, prepareMutation.isPending, request, sourceMutation.isPending, workId]);

  const storedProfileId = detail?.work.clientProfileId;
  const isRestoringWork = Boolean(initialWorkId && !detail);
  const clientProfileId = isRestoringWork ? null : storedProfileId ?? active.activeClientProfileId;
  const brandName = active.profiles.find((profile) => profile.id === storedProfileId)?.name
    ?? (isRestoringWork ? null : active.activeProfile?.name)
    ?? null;
  const sources = detail?.sources ?? [];
  const readySources = sources.filter((source) => source.status === "ready");
  const restyleOriginal = readySources.find((source) => source.usage === "content")
    ?? readySources.find((source) => source.usage === "both")
    ?? null;
  const restyleStyle = readySources.find((source) => source.usage === "style") ?? null;
  const hasMeaningfulInput = intent === "restyle"
    ? Boolean(
      restyleOriginal
      && restyleStyle
      && restyleOriginal.id !== restyleStyle.id,
    )
    : intent === "variations" || intent === "format_adaptation"
      ? readySources.length > 0
      : Boolean(request.trim() || sources.length);
  const canGenerate = Boolean(clientProfileId) && hasMeaningfulInput
    && (!detail?.work || detail.work.status === "draft"
      // A "ready" work without outputs holds a confirmed prepare whose
      // generation never landed — the submit stays retryable.
      || (detail.work.status === "ready" && detail.outputs.length === 0))
    && !sources.some((source) => source.status === "uploaded" || source.status === "analyzing" || (intent === "single" && source.status === "failed"))
    && (intent !== "single" || !sources.some((source) => source.pieceReference ? !isPieceReferenceReady(source.pieceReference) : source.usageConfirmed === false))
    && (intent !== "format_adaptation" || targetFormats.length > 0)
    && (intent !== "single" || fontOptions.length <= 1 || Boolean(fontAssetKey))
    && !isUploading && actionPhase === "idle" && !generateMutation.isPending && !sourceMutation.isPending
    && !editBriefingMutation.isPending && briefingEditState !== "saving"
    && inferredBriefing?.readiness !== "blocked"
    // A brand choice being applied resumes the submit itself — a manual
    // click in that window would race it with a concurrent generate.
    && !resolveBrandConflictMutation.isPending;

  const campaigns = (campaignQuery.data ?? []).filter((campaign) =>
    !campaign.clientProfileId || campaign.clientProfileId === storedProfileId,
  );
  const persistedBrandTrainingSuggestion = detail?.work.identitySnapshot
    && Array.isArray(detail.work.identitySnapshot.assets)
    && detail.work.identitySnapshot.assets.length === 0
    && detail.work.status !== "draft"
    ? "missing_visual_references"
    : null;
  const frozenKnowledge = detail?.work.identitySnapshot?.brandKnowledge;
  const brandIdentity = intent === "single"
    ? frozenKnowledge
      ? {
          source: "snapshot" as const,
          mode: frozenKnowledge.mode,
          versionNumber: frozenKnowledge.versionNumber,
          assets: (detail?.work.identitySnapshot?.assets ?? []).map((asset) => ({
            referenceId: asset.referenceId,
            label: asset.label,
            usageMode: asset.usageMode,
            reasons: detail?.work.identitySnapshot?.referenceSelection?.reasons[asset.referenceId] ?? [],
          })),
        }
      : {
          source: "live" as const,
          mode: brandKnowledgeQuery.data?.activeVersion ? "published" as const : "legacy_fallback" as const,
          versionNumber: brandKnowledgeQuery.data?.activeVersion?.versionNumber ?? null,
          assets: [],
        }
    : null;

  return {
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>, request, setRequest,
    intent, selectIntent, format, formatMode, setFormat: (value: Format) => {
      formatRef.current = value;
      formatModeRef.current = "manual";
      setFormatMode("manual");
      setFormat(value);
      setQuote(canonicalQuote(intentRef.current, value, targetFormatsRef.current, directionPoolRef.current ?? undefined));
    },
    setFormatAuto: () => {
      formatModeRef.current = "auto";
      setFormatMode("auto");
    },
    targetFormats, toggleTargetFormat,
    textLayout,
    setTextLayout: (value: "top" | "center" | "bottom" | "side") => {
      textLayoutRef.current = value;
      setTextLayout(value);
    },
    fontAssetKey,
    setFontAssetKey: (value: string | null) => {
      fontAssetKeyRef.current = value;
      setFontAssetKey(value);
    },
    fontOptions,
    directionPool, toggleDirection, setManualDirectionInstruction,
    directionSuggestionState, pendingDirectionSuggestions, applyDirectionSuggestions, requestDirectionSuggestions, keepCurrentDirections,
    state, stage, objectiveSelected, preparedPlan, actionPhase, workId, clientProfileId, brandName,
    pendingProtocolSwitch, confirmProtocolSwitch, cancelProtocolSwitch,
    protocolSwitchNotice, returnToPreviousProtocol,
    sources: detail?.sources ?? [], outputs: detail?.outputs ?? [], quote, canGenerate, isUploading,
    sourceMutationPending: sourceMutation.isPending,
    settingsLocked: Boolean(detail?.work && detail.work.status !== "draft"),
    inferredBriefing, briefingFactPack, brandIdentity,
    briefingOverrides: detail?.work.settings.briefingOverrides ?? briefingOverridesRef.current ?? {},
    editBriefingField, briefingEditState,
    campaignId: detail?.work.campaignId ?? null, campaigns,
    error, announcement, approvalErrorOutputId, brandTrainingSuggestion: brandTrainingSuggestion ?? persistedBrandTrainingSuggestion,
    brandConflict, resolveBrandConflict,
    isResolvingBrandConflict: resolveBrandConflictMutation.isPending,
    requiresBrandSelection: active.requiresSelection,
    retryInitialTemplate: failedInitialTemplateId
      && !detail?.sources.some((source) => source.templateId === failedInitialTemplateId)
      ? retryInitialTemplate
      : null,
    workError: Boolean(workId && detailQuery.isError),
    addFiles, addInspiration, updateSource, editSource, retrySource, removeSource, updatePieceReference, replacePieceReference, promotePieceReference, preparePlan, confirmGeneration, generateLegacy,
    retryOutput, retryRevisionOutput, approveOutput, reviseOutput, linkCampaign,
    canLayerize: detail?.canLayerize ?? false,
    layerEditorAccess: detail?.layerEditorAccess,
    layerizeOutput,
    downloadLayerizedOutput: (outputId: string, format: "psd" | "zip") => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId, format), "_blank", "noopener,noreferrer");
    },
    downloadOutput: (outputId: string) => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId), "_blank", "noopener,noreferrer");
    },
    isRetryingOutput: (outputId: string) => retryOutputMutation.isPending && retryOutputMutation.variables?.outputId === outputId,
    isLayerizingOutput: (outputId: string) => layerizeOutputMutation.isPending && layerizeOutputMutation.variables?.outputId === outputId,
    isApprovingOutput: (outputId: string) => selectOutputMutation.isPending && selectOutputMutation.variables?.outputId === outputId,
    isRevisingOutput: (outputId: string) => {
      if (!reviseOutputMutation.isPending) return false;
      if (reviseOutputMutation.variables?.outputId === outputId) return true;
      const current = detail?.outputs.find((output) => output.id === outputId);
      return current?.parentOutputId === reviseOutputMutation.variables?.outputId
        && current.revisionInstruction === reviseOutputMutation.variables?.instruction
        && current.revisionAssetId === reviseOutputMutation.variables?.revisionAssetId;
    },
    refreshOutputs: async () => { await detailQuery.refetch(); },
  };
}

export type CreativeComposerModel = ReturnType<typeof useCreativeComposer>;
export type CreativeComposerViewModel = Omit<CreativeComposerModel, "composerRef">;
