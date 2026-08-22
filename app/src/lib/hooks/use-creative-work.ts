"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
export {
  getCreativeWorkEvaluatorSummary,
  getCreativeWorkObjectiveVerdict,
  type CreativeWorkObjectiveVerdict,
} from "@/lib/creative-work-selection-policy";
import type {
  BriefingConfidence,
  BriefingReadiness,
  CreativeDirection,
  CreativeDirectionPool,
  CreativeWorkFactPack,
  InferredBriefing,
} from "@/server/creative-work/contracts";
import type { PublicLayerizationState } from "@/server/layerize/contracts";
import type { LayerEditorAccessV1, PublicLayerEditorSummaryV1 } from "@/server/layer-editor/contracts";

export type CreativeWorkStatus =
  | "draft"
  | "ready"
  | "generating"
  | "partial"
  | "completed"
  | "failed";

export type CreativeWorkOutputStatus = "queued" | "processing" | "completed" | "failed";

export type CreativeLevel = "conservative" | "balanced" | "bold";

export interface SocialPostBrief {
  theme: string;
  objective: string;
  audience: string;
  offer: string | null;
}

export interface SocialPostCopy {
  headline: string;
  body: string;
  cta: string;
}

export interface CreativeWorkIdentitySnapshot {
  clientProfileId: string;
  confirmedAt: string;
  assets: Array<{
    referenceId: string;
    assetKey: string;
    label: string;
    category: string;
    usageMode: string;
    hasAlpha: boolean;
    placement: { gravity: string; widthRatio: number } | null;
  }>;
  referenceSelection?: {
    strategy: "ranked" | "manual";
    format: "1:1" | "4:5" | "9:16" | null;
    operatorSelectedReferenceIds: string[];
    reasons: Record<string, string[]>;
  };
  negativePatterns?: Array<{
    referenceId: string;
    label: string;
    description: string;
  }>;
  brandKnowledge?: {
    mode: "published" | "legacy_fallback";
    versionId: string | null;
    versionNumber: number | null;
    versionHash: string | null;
    compiledAt: string | null;
  };
  brandKit: {
    colors: string[];
    fonts: string[];
    fontAssets?: Array<{
      assetKey: string;
      family: string;
      source: string;
      weight: number;
      style: "normal" | "italic";
      sha256: string;
      approvedAt: string;
      approvedByUserId: string;
    }>;
    toneOfVoice: string | null;
    prohibitedElements: string | null;
    requiredElements: string | null;
  };
}

export interface CreativeWorkItem {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  createdByUserId: string;
  draftKey: string | null;
  campaignId: string | null;
  title: string;
  request: string;
  toolKind: "social_post" | "variations" | "single" | "format_adaptation" | "restyle";
  status: CreativeWorkStatus;
  brief: SocialPostBrief;
  format: "1:1" | "4:5" | "9:16";
  settings: {
    targetFormats: Array<"1:1" | "4:5" | "9:16">;
    formatMode?: "auto" | "manual";
    textLayout?: "top" | "center" | "bottom" | "side";
    fontAssetKey?: string;
    directionPool?: CreativeDirectionPool;
  };
  copy: SocialPostCopy | null;
  identitySnapshot: CreativeWorkIdentitySnapshot | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeWorkOutput {
  id: string;
  workspaceId: string;
  workItemId: string;
  creativeLevel: CreativeLevel;
  targetFormat: "1:1" | "4:5" | "9:16";
  versionNumber: number;
  parentOutputId: string | null;
  revisionInstruction: string | null;
  revisionAssetId: string | null;
  retryCount: number;
  /** Durable provider-call authority (R-006) — retry eligibility derives from it. */
  imageCallCount?: number;
  operationKey: string;
  status: CreativeWorkOutputStatus;
  outputKey: string | null;
  cost: number | null;
  failureCode: string | null;
  quality: Record<string, unknown> | null;
  layerization: PublicLayerizationState | null;
  layerEditor: PublicLayerEditorSummaryV1 | null;
  isSelected: boolean;
  directionId?: string | null;
  directionSnapshot?: { label: string; instruction: string; order: number } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type CreativeSourceUsage = "content" | "style" | "both";
export interface CreativeWorkSource {
  id: string;
  workspaceId: string;
  workItemId: string;
  assetId: string | null;
  templateId: string | null;
  name: string;
  previewUrl: string | null;
  origin: "upload" | "template" | "approved_work";
  usage: CreativeSourceUsage;
  usageConfirmed: boolean;
  status: "uploaded" | "analyzing" | "ready" | "failed";
  contentAnalysis: ContentBrief | null;
  styleAnalysis: StyleBrief | null;
  failureCode: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeWorkDetail {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources: CreativeWorkSource[];
  inferredBriefing?: InferredBriefing | null;
  briefingFactPack?: CreativeWorkFactPack | null;
  canLayerize?: boolean;
  layerEditorAccess?: LayerEditorAccessV1;
}

export interface CreativeWorkCampaignOption {
  id: string;
  name: string;
  clientProfileId: string | null;
}

export function creativeWorkRefetchInterval(
  data:
    | {
        work: Pick<CreativeWorkItem, "status">;
        outputs: Array<Pick<CreativeWorkOutput, "status"> & { layerization?: PublicLayerizationState | null }>;
      }
    | undefined,
) {
  const shouldPoll =
    data?.work.status === "generating" ||
    data?.outputs.some((output) => output.status === "queued" || output.status === "processing" || ["queued", "processing", "reconciling", "finalizing"].includes(output.layerization?.status ?? "")) ||
    ("sources" in (data ?? {}) &&
      (data as CreativeWorkDetail).sources.some(
        (source) => source.status === "uploaded" || source.status === "analyzing",
      ));
  if (!shouldPoll) return false;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }
  return 2000;
}

export class CreativeWorkRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
    /** Typed 422 payload (e.g. brand_conflict choices / invalid_context violations). */
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "CreativeWorkRequestError";
  }
}

async function readError(res: Response): Promise<CreativeWorkRequestError> {
  const body: unknown = await res.json().catch(() => ({}));
  const err = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const legacyCode = res.status === 429 && typeof err.error === "string" ? err.error : null;
  return new CreativeWorkRequestError(
    typeof err.message === "string"
      ? err.message
      : typeof err.error === "string"
        ? err.error
        : "Request failed",
    typeof err.code === "string" ? err.code : legacyCode,
    res.status,
    "details" in err ? err.details : null,
  );
}

// ---------------------------------------------------------------------------
// R-008: typed failure categories + tri-state quality projection.
// ---------------------------------------------------------------------------

/** Stable failure categories projected to the user (R-008 / spec 10). */
export type CreativeWorkFailureCategory =
  | "timeout"
  | "invalid_context"
  | "factual_violation"
  | "brand_conflict"
  | "reference_failure"
  | "unknown";

/**
 * Maps a persisted (sanitized) failure code to its stable UI category.
 * Internal codes may be more specific; the UI only ever sees these six.
 */
export function categorizeCreativeWorkFailure(
  failureCode: string | null | undefined,
): CreativeWorkFailureCategory {
  if (!failureCode) return "unknown";
  if (failureCode === "invalid_context") return "invalid_context";
  if (failureCode === "factual_violation") return "factual_violation";
  if (failureCode === "brand_conflict") return "brand_conflict";
  if (failureCode === "reference_failure") return "reference_failure";
  if (failureCode.includes("timeout") || failureCode.includes("timed_out")) return "timeout";
  return "unknown";
}

/** Absolute provider-call ceiling per output (mirrors server R-006). */
export const CREATIVE_WORK_RETRY_IMAGE_CALL_LIMIT = 2;

/**
 * R-006/R-008: the free retry only exists for a failed INITIAL output whose
 * durable image-call budget still has a call. Budget exhaustion
 * (`image_call_budget_exhausted`), revisions and non-failed outputs never
 * show the action — the server enforces the same rule (`concurrent_change`
 * stays a transient 409 the UI simply re-reads via polling).
 */
export function isCreativeWorkRetryEligible(
  output: Pick<CreativeWorkOutput, "status" | "parentOutputId" | "imageCallCount">,
): boolean {
  return (
    output.status === "failed" &&
    !output.parentOutputId &&
    (output.imageCallCount ?? 0) < CREATIVE_WORK_RETRY_IMAGE_CALL_LIMIT
  );
}

export type CreativeWorkBrandChoice = "source" | "active";

/** Typed payload of the 422 brand_conflict response (R-003/R-008). */
export interface CreativeWorkBrandConflict {
  detectedBrand: string;
  activeBrand: string;
  sourceId: string;
  choices: readonly CreativeWorkBrandChoice[];
}

/** Structural brand-conflict extraction — safe across mocked module boundaries. */
export function extractCreativeWorkBrandConflict(cause: unknown): CreativeWorkBrandConflict | null {
  if (!(cause instanceof Error) || !("code" in cause)) return null;
  if ((cause as { code?: unknown }).code !== "brand_conflict") return null;
  const details = (cause as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const candidate = details as Partial<CreativeWorkBrandConflict>;
  if (typeof candidate.detectedBrand !== "string" || !Array.isArray(candidate.choices)) return null;
  return {
    detectedBrand: candidate.detectedBrand,
    activeBrand: typeof candidate.activeBrand === "string" ? candidate.activeBrand : "",
    sourceId: typeof candidate.sourceId === "string" ? candidate.sourceId : "",
    choices: candidate.choices as readonly CreativeWorkBrandChoice[],
  };
}

function fetchCreativeWork(workItemId: string, signal?: AbortSignal): Promise<CreativeWorkDetail> {
  return apiFetch(`/api/creative-work/${workItemId}`, { signal }).then(async (res) => {
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    return {
      work: {
        ...data.work,
        createdAt: new Date(data.work.createdAt),
        updatedAt: new Date(data.work.updatedAt),
      },
      outputs: (data.outputs as CreativeWorkOutput[]).map((o) => ({
        ...o,
        createdAt: new Date(o.createdAt),
        updatedAt: new Date(o.updatedAt),
      })),
      sources: (data.sources as CreativeWorkSource[] ?? []).map((source) => ({
        ...source,
        createdAt: new Date(source.createdAt),
        updatedAt: new Date(source.updatedAt),
      })),
      inferredBriefing: (data.inferredBriefing as InferredBriefing | null | undefined) ?? null,
      briefingFactPack: (data.briefingFactPack as CreativeWorkFactPack | null | undefined) ?? null,
      canLayerize: Boolean(data.canLayerize),
    };
  });
}

/**
 * One row in the wizard's assets step. Mirrors the server-side
 * `buildIdentityOptions` return value, with the fields the UI needs
 * stripped to a flat, serialisable shape.
 */
export interface IdentityOption {
  referenceId: string;
  label: string;
  category: string;
  usageMode: string;
  reason: string;
}

function fetchIdentityOptions(workItemId: string): Promise<{ options: IdentityOption[] }> {
  return apiFetch(`/api/creative-work/${workItemId}/identity-options`).then(async (res) => {
    if (!res.ok) throw await readError(res);
    return res.json() as Promise<{ options: IdentityOption[] }>;
  });
}

function postJson<T>(url: string, body?: unknown, timeoutMs?: number): Promise<T> {
  return apiFetch(url, {
    method: "POST",
    timeoutMs,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw await readError(res);
    return res.json() as Promise<T>;
  });
}

function patchJson<T>(url: string, body: unknown, timeoutMs?: number): Promise<T> {
  return apiFetch(url, {
    method: "PATCH",
    timeoutMs,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw await readError(res);
    return res.json() as Promise<T>;
  });
}

export function useCreativeWork(workItemId: string | null | undefined) {
  return useQuery({
    queryKey: ["creative-work", workItemId],
    queryFn: ({ signal }) => fetchCreativeWork(workItemId!, signal),
    enabled: Boolean(workItemId),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (!workItemId) return false;
      const data = query.state.data as CreativeWorkDetail | undefined;
      if (!data) return false;
      return creativeWorkRefetchInterval(data);
    },
  });
}

export function useCreativeWorkCampaigns(enabled: boolean) {
  return useQuery({
    queryKey: ["creative-work", "campaign-options"],
    enabled,
    staleTime: 30_000,
    queryFn: () => apiFetch("/api/campaigns?limit=50").then(async (res) => {
      if (!res.ok) throw await readError(res);
      const data = await res.json() as { campaigns?: CreativeWorkCampaignOption[] };
      return data.campaigns ?? [];
    }),
  });
}

export function useIdentityOptions(workItemId: string | null | undefined) {
  return useQuery({
    queryKey: ["identity-options", workItemId],
    queryFn: () => fetchIdentityOptions(workItemId!),
    enabled: Boolean(workItemId),
    // The options only change when the underlying work item changes; the
    // same brief + same client profile is always a stable recommendation.
    staleTime: 30_000,
  });
}

export function useCreateCreativeWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      clientProfileId: string;
      toolKind: "social_post";
      format: "1:1" | "4:5" | "9:16";
      brief: SocialPostBrief;
    }) => postJson<{ work: CreativeWorkItem }>("/api/creative-work", input),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work", result.work.id] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export type CreativeDraftInput = {
  clientProfileId: string;
  draftKey: string;
  request: string;
  intent: CreativeWorkItem["toolKind"];
  format: CreativeWorkItem["format"];
  settings: CreativeWorkItem["settings"];
  assetId?: string;
  templateId?: string;
  usage?: CreativeSourceUsage;
};

export type CreativeWorkDraftItem = Omit<CreativeWorkItem, "brief"> & { brief: SocialPostBrief | null };
export type CreativeWorkQuote = { unitCount: number; credits: number };

async function invalidateCreativeDraft(queryClient: ReturnType<typeof useQueryClient>, workItemId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["creative-work"] }),
    queryClient.invalidateQueries({ queryKey: ["creative-work", workItemId] }),
    invalidateCanonicalWorks(queryClient),
  ]);
}

export function useCreateCreativeWorkDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreativeDraftInput) => postJson<{
      work: CreativeWorkDraftItem;
      quote: CreativeWorkQuote;
      source?: CreativeWorkSource;
    }>("/api/creative-work", input),
    onSuccess: (data) => invalidateCreativeDraft(queryClient, data.work.id),
  });
}

export function useAutosaveCreativeWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreativeDraftInput, "clientProfileId" | "draftKey"> & { workItemId: string }) =>
      patchJson<{ work: CreativeWorkDraftItem }>(`/api/creative-work/${input.workItemId}`, {
        action: "autosave",
        request: input.request,
        intent: input.intent,
        format: input.format,
        settings: input.settings,
      }),
    onSuccess: (_data, input) => invalidateCreativeDraft(queryClient, input.workItemId),
  });
}

export function usePrepareCreativeWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workItemId: string }) =>
      patchJson<{
        work: CreativeWorkDraftItem;
        quote: CreativeWorkQuote;
        briefing?: InferredBriefing;
        briefingFactPack?: CreativeWorkFactPack;
        readiness?: BriefingReadiness;
        confidence?: BriefingConfidence;
      }>(
        `/api/creative-work/${input.workItemId}`,
        { action: "prepare" },
        120_000,
      ),
    onSuccess: (_data, input) => invalidateCreativeDraft(queryClient, input.workItemId),
  });
}

/**
 * R-003/R-008: persists the restyle brand-conflict choice on the SAME draft
 * (autosaved server-side) so the interrupted generate submit can resume
 * without creating a new draft or asking again.
 */
export function useResolveBrandConflict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, choice }: { workItemId: string; choice: CreativeWorkBrandChoice }) =>
      patchJson<{ work: CreativeWorkDraftItem }>(`/api/creative-work/${workItemId}`, {
        action: "resolveBrandConflict",
        choice,
      }),
    onSuccess: (_data, input) => invalidateCreativeDraft(queryClient, input.workItemId),
  });
}

type CreativeSourceAction =
  | { action: "attachSource"; assetId: string; templateId?: never; usage: CreativeSourceUsage }
  | { action: "attachSource"; templateId: string; assetId?: never; usage: CreativeSourceUsage }
  | { action: "updateSource"; sourceId: string; usage: CreativeSourceUsage }
  | { action: "retrySource" | "removeSource"; sourceId: string }
  | { action: "editSourceAnalysis"; sourceId: string; content: ContentBrief | null; style: StyleBrief | null };

export function useCreativeWorkSourceActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, ...action }: CreativeSourceAction & { workItemId: string }) =>
      patchJson<{ source?: CreativeWorkSource; removed?: boolean }>(`/api/creative-work/${workItemId}`, action),
    onSuccess: (_data, input) => invalidateCreativeDraft(queryClient, input.workItemId),
    onError: (_error, input) => invalidateCreativeDraft(queryClient, input.workItemId),
  });
}

export function useGenerateCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async (workItemId: string) => {
      // The detail query starts as soon as a newly-created workId becomes
      // active. Cancel that pre-copy snapshot so it cannot resolve after the
      // provider response and overwrite the generated copy in the cache/UI.
      await queryClient.cancelQueries({
        queryKey: ["creative-work", workItemId],
      });
    },
    mutationFn: (workItemId: string) =>
      postJson<{ copy: SocialPostCopy; work: CreativeWorkItem }>(
        `/api/creative-work/${workItemId}/copy`,
        undefined,
        120_000,
      ),
    onSuccess: (result, workItemId) => {
      const work = {
        ...result.work,
        createdAt: new Date(result.work.createdAt),
        updatedAt: new Date(result.work.updatedAt),
      };
      queryClient.setQueryData<CreativeWorkDetail>(
        ["creative-work", workItemId],
        (current) => ({
          work,
          outputs: current?.outputs ?? [],
          sources: current?.sources ?? [],
          inferredBriefing: current?.inferredBriefing ?? null,
          briefingFactPack: current?.briefingFactPack ?? null,
        })
      );
      void queryClient.invalidateQueries({
        queryKey: ["creative-work", workItemId],
      });
      void invalidateCanonicalWorks(queryClient);
    },
  });
}

export function useConfirmCreativeWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workItemId: string; copy: SocialPostCopy; selectedReferenceIds: string[] }) =>
      patchJson<{ work: CreativeWorkItem }>(`/api/creative-work/${input.workItemId}`, {
        copy: input.copy,
        selectedReferenceIds: input.selectedReferenceIds,
      }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["creative-work", variables.workItemId],
        }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useTriggerTriplet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) =>
      postJson<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[]; brandTrainingSuggestion: string | null }>(
        `/api/creative-work/${workItemId}/generate`,
        { action: "initial" },
        120_000,
      ),
    onSuccess: async (data, workItemId) => {
      queryClient.setQueryData<CreativeWorkDetail>(
        ["creative-work", workItemId],
        (current) => ({
          work: {
            ...data.work,
            createdAt: new Date(data.work.createdAt),
            updatedAt: new Date(data.work.updatedAt),
          },
          outputs: data.outputs.map((output) => ({
            ...output,
            createdAt: new Date(output.createdAt),
            updatedAt: new Date(output.updatedAt),
          })),
          sources: current?.sources ?? [],
        })
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work", workItemId] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useSuggestCreativeDirections() {
  return useMutation({
    mutationFn: (workItemId: string) =>
      postJson<{ directions: CreativeDirection[] }>(`/api/creative-work/${workItemId}/suggest`, undefined, 60_000),
  });
}

export function useRetryOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, outputId }: { workItemId: string; outputId: string }) =>
      postJson<{ output: CreativeWorkOutput }>(
        `/api/creative-work/${workItemId}/outputs/${outputId}/retry`,
      ),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["creative-work", variables.workItemId],
        }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useLayerizeOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, outputId, operationId, retry }: { workItemId: string; outputId: string; operationId: string; retry?: boolean }) =>
      patchJson<{ state: PublicLayerizationState }>(`/api/creative-work/${workItemId}`, {
        action: "layerizeOutput",
        outputId,
        operationId,
        ...(retry ? { retry: true } : {}),
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["creative-work", variables.workItemId] });
    },
  });
}

export function useReviseOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, ...command }: {
      workItemId: string;
      outputId: string;
      revisionKey: string;
      instruction: string;
      revisionAssetId: string | null;
    }) => postJson<{ output: CreativeWorkOutput }>(
      `/api/creative-work/${workItemId}/generate`,
      { action: "revision", ...command },
    ),
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work", input.workItemId] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
    onError: (_error, input) => queryClient.invalidateQueries({ queryKey: ["creative-work", input.workItemId] }),
  });
}

export function useLinkCreativeWorkCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, campaignId }: { workItemId: string; campaignId: string | null }) =>
      patchJson<{ work: CreativeWorkItem }>(`/api/creative-work/${workItemId}`, { action: "linkCampaign", campaignId }),
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-work", input.workItemId] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useSelectOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workItemId,
      outputId,
      saveToLibrary,
      confirmObjective,
    }: {
      workItemId: string;
      outputId: string;
      saveToLibrary: boolean;
      confirmObjective?: boolean;
    }) =>
      postJson<{ output: CreativeWorkOutput }>(
        `/api/creative-work/${workItemId}/outputs/${outputId}/select`,
        { saveToLibrary, confirmObjective: confirmObjective ?? false },
      ),
    onSuccess: async (_data, variables) => {
      // Saving the selected output materialises a new workspace asset. The
      // wizard must therefore invalidate both the work detail and the library.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["creative-work", variables.workItemId],
        }),
        queryClient.invalidateQueries({ queryKey: ["workspace-assets"] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
  });
}

export function useDownloadOutputUrl() {
  return (workItemId: string, outputId: string, format: "original" | "psd" | "zip" = "original") =>
    `/api/creative-work/${workItemId}/outputs/${outputId}/download${format === "original" ? "" : `?format=${format}`}`;
}
