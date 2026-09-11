"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { invalidateCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
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
  CreativeWorkBriefingField,
  CreativeWorkBriefingOverrides,
  CreativeWorkIntent,
  InferredBriefing,
} from "@/server/creative-work/contracts";
import type {
  CarouselCopyAuthority,
  CarouselDeckQualityV1,
  CarouselDeckPlanV1,
  CarouselDraftStateV1,
  CarouselLayoutFamily,
  CarouselNarrativeRole,
  CarouselSlideStatus,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";
import type { CarouselEditorialCommand, CarouselEditorialState } from "@/server/creative-work/carousel-editorial-state";
import {
  creativeWorkFactPackSchema,
  inferredBriefingSchema,
} from "@/server/creative-work/contracts";
import type { PublicLayerizationState } from "@/server/layerize/contracts";
import type { LayerEditorAccessV1, PublicLayerEditorSummaryV1 } from "@/server/layer-editor/contracts";
import type { PieceReferenceCategory, PieceReferenceDraft } from "@/server/creative-work/piece-reference";
import { brandTrainingAssetsKey } from "@/lib/hooks/use-brand-training";

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
  toolKind: CreativeWorkIntent;
  status: CreativeWorkStatus;
  brief: SocialPostBrief;
  format: "1:1" | "4:5" | "9:16";
  settings: {
    targetFormats: Array<"1:1" | "4:5" | "9:16">;
    formatMode?: "auto" | "manual";
    textLayout?: "top" | "center" | "bottom" | "side";
    fontAssetKey?: string;
    directionPool?: CreativeDirectionPool;
    briefingOverrides?: CreativeWorkBriefingOverrides;
    briefingVersion?: number;
    carouselDraft?: CarouselDraftStateV1;
    carouselEditorial?: CarouselEditorialState;
  };
  copy: SocialPostCopy | null;
  identitySnapshot: CreativeWorkIdentitySnapshot | null;
  carouselApprovedRevision: string | null;
  carouselQuality: PublicCarouselQualityV1 | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Public carousel deck quality — the private contact-sheet key becomes a boolean. */
export type PublicCarouselQualityV1 = Omit<CarouselDeckQualityV1, "contactSheetKey"> & {
  hasContactSheet: boolean;
};

/**
 * Client projection of one current carousel slide. Storage keys, prompts and
 * provider metadata never leave the server; outputs are reached through the
 * download endpoints.
 */
export type PublicCarouselSlide = {
  id: string;
  lineageId: string;
  parentSlideId: string | null;
  versionNumber: number;
  deckRevision: string;
  position: number;
  role: CarouselNarrativeRole;
  primaryText: string;
  secondaryText: string | null;
  copyAuthority: CarouselCopyAuthority;
  sourceFactIds: string[];
  layoutFamily: CarouselLayoutFamily;
  status: CarouselSlideStatus;
  hasOutput: boolean;
  /** Plan `slideId` used by the storyboard; distinct from the DB row id. */
  planSlideId: string | null;
  errorCode: string | null;
  quality: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export interface CreativeWorkOutput {
  id: string;
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
  status: CreativeWorkOutputStatus;
  hasOutput?: boolean;
  /** Present only for local optimistic drafts; GET never exposes storage keys. */
  outputKey?: string | null;
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
  pieceReference: PieceReferenceDraft | null;
  failureCode: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeWorkDetail {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources: CreativeWorkSource[];
  preparedPlan: PreparedPlanProjectionV1 | null;
  carouselSlides: PublicCarouselSlide[];
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
        carouselSlides?: Array<Pick<PublicCarouselSlide, "status">>;
      }
    | undefined,
) {
  const shouldPoll =
    data?.work.status === "generating" ||
    data?.outputs.some((output) => output.status === "queued" || output.status === "processing" || ["queued", "processing", "reconciling", "finalizing"].includes(output.layerization?.status ?? "")) ||
    // Carousel decks never enter creative_work_outputs: active slides alone
    // keep the polling alive even when the legacy outputs list is empty.
    data?.carouselSlides?.some((slide) => slide.status === "queued" || slide.status === "processing") ||
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
  const code = typeof err.code === "string" ? err.code : legacyCode;
  const translated = translateCreativeWorkClientError(code);
  return new CreativeWorkRequestError(
    translated
      ?? (typeof err.message === "string"
        ? err.message
        : typeof err.error === "string"
          ? err.error
          : "Request failed"),
    code,
    res.status,
    sanitizeCreativeWorkErrorDetails(code, "details" in err ? err.details : null),
  );
}

const CAROUSEL_EDITORIAL_CLIENT_ERRORS: Record<string, string> = {
  research_unavailable: "A pesquisa não ficou disponível. Restrinja a tese ou envie o material.",
  research_insufficient: "A evidência não basta para sustentar a tese. Restrinja o argumento ou envie fontes.",
  invalid_editorial_transition: "Esta etapa editorial ainda não pode ser confirmada. Revise o gancho, o roteiro ou a capa.",
  editorial_plan_invalid: "Não foi possível montar uma proposta editorial segura. Tente novamente.",
  stale_input: "Este trabalho foi alterado. Recarregue e tente novamente.",
  invalid_generation_gate: "Aprove o roteiro e a capa vigentes, depois prepare de novo para gerar.",
};

/** Safe client copy for carousel editorial failures — never raw provider text. */
export function translateCreativeWorkClientError(code: string | null): string | null {
  if (!code) return null;
  return CAROUSEL_EDITORIAL_CLIENT_ERRORS[code] ?? null;
}

function sanitizeCreativeWorkErrorDetails(code: string | null, details: unknown): unknown {
  if (!details || typeof details !== "object") return details;
  if (
    code === "editorial_plan_invalid"
    || code === "research_unavailable"
    || code === "research_insufficient"
  ) {
    const gaps = Array.isArray((details as { gaps?: unknown }).gaps)
      ? (details as { gaps: unknown[] }).gaps.filter((gap): gap is string => typeof gap === "string")
      : undefined;
    return gaps && gaps.length > 0 ? { gaps } : {};
  }
  return details;
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

/** Typed payload of the pre-generation briefing safety check. */
export function extractCreativeWorkBriefingBlocked(cause: unknown): {
  reason: "missing_direction";
  briefing: InferredBriefing;
  factPack: CreativeWorkFactPack;
} | null {
  if (!(cause instanceof Error) || !("code" in cause)) return null;
  if ((cause as { code?: unknown }).code !== "briefing_blocked") return null;
  const details = (cause as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const candidate = details as Record<string, unknown>;
  if (candidate.reason !== "missing_direction") return null;
  const briefing = inferredBriefingSchema.safeParse(candidate.briefing);
  const factPack = creativeWorkFactPackSchema.safeParse(candidate.factPack);
  if (!briefing.success || briefing.data.readiness !== "blocked" || !factPack.success) return null;
  return { reason: "missing_direction", briefing: briefing.data, factPack: factPack.data };
}

/** Canonical detail cache key for one creative work. */
export function creativeWorkKey(workItemId: string) {
  return ["creative-work", workItemId] as const;
}

function mapCarouselSlide(raw: Record<string, unknown>): PublicCarouselSlide {
  // Pick only the public projection fields: storage keys, prompts, contract
  // hashes and provider metadata stay on the server by construction.
  return {
    id: String(raw.id),
    lineageId: String(raw.lineageId),
    parentSlideId: (raw.parentSlideId as string | null) ?? null,
    versionNumber: Number(raw.versionNumber),
    deckRevision: String(raw.deckRevision),
    position: Number(raw.position),
    role: raw.role as CarouselNarrativeRole,
    primaryText: String(raw.primaryText ?? ""),
    secondaryText: (raw.secondaryText as string | null) ?? null,
    copyAuthority: raw.copyAuthority as CarouselCopyAuthority,
    sourceFactIds: Array.isArray(raw.sourceFactIds) ? (raw.sourceFactIds as string[]) : [],
    layoutFamily: raw.layoutFamily as CarouselLayoutFamily,
    status: raw.status as CarouselSlideStatus,
    hasOutput: Boolean(raw.hasOutput),
    planSlideId: typeof raw.planSlideId === "string" && raw.planSlideId.trim().length > 0
      ? raw.planSlideId
      : null,
    errorCode: (raw.errorCode as string | null) ?? null,
    quality: (raw.quality as Record<string, unknown> | null) ?? null,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  };
}

export function mapCreativeWorkDetail(data: {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources?: CreativeWorkSource[];
  preparedPlan?: PreparedPlanProjectionV1 | null;
  carouselSlides?: unknown;
  carouselQuality?: PublicCarouselQualityV1 | null;
  inferredBriefing?: InferredBriefing | null;
  briefingFactPack?: CreativeWorkFactPack | null;
  canLayerize?: boolean;
  layerEditorAccess?: LayerEditorAccessV1;
}): CreativeWorkDetail {
  return {
      work: {
        ...data.work,
        // The detail GET projects deck quality at the payload root; the client
        // aggregate keeps it on the work item.
        carouselApprovedRevision: data.work.carouselApprovedRevision ?? null,
        carouselQuality: data.carouselQuality ?? null,
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
      preparedPlan: data.preparedPlan ?? null,
      carouselSlides: Array.isArray(data.carouselSlides)
        ? (data.carouselSlides as Record<string, unknown>[]).map(mapCarouselSlide)
        : [],
      inferredBriefing: (data.inferredBriefing as InferredBriefing | null | undefined) ?? null,
      briefingFactPack: (data.briefingFactPack as CreativeWorkFactPack | null | undefined) ?? null,
    canLayerize: Boolean(data.canLayerize),
    layerEditorAccess: data.layerEditorAccess,
  };
}

function fetchCreativeWork(workItemId: string, signal?: AbortSignal): Promise<CreativeWorkDetail> {
  return apiFetch(`/api/creative-work/${workItemId}`, { signal }).then(async (res) => {
    if (!res.ok) throw await readError(res);
    return mapCreativeWorkDetail(await res.json());
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

export function patchCreativeWork<T>(workItemId: string, body: unknown, timeoutMs?: number): Promise<T> {
  return patchJson<T>(`/api/creative-work/${workItemId}`, body, timeoutMs);
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
    mutationFn: (input: Omit<CreativeDraftInput, "clientProfileId" | "draftKey"> & { workItemId: string; expectedUpdatedAt: string }) =>
      patchJson<{ work: CreativeWorkDraftItem }>(`/api/creative-work/${input.workItemId}`, {
        action: "autosave",
        expectedUpdatedAt: input.expectedUpdatedAt,
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
        quote?: CreativeWorkQuote;
        preparedPlan?: PreparedPlanProjectionV1;
        // Carousel prepare answers with the frozen deck/visual envelope
        // instead of the legacy projection (see prepare-carousel-work).
        preparedRevision?: string;
        deck?: CarouselDeckPlanV1;
        visualContract?: CarouselVisualContractV1;
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

export function useEditCreativeWorkBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workItemId: string;
      field: CreativeWorkBriefingField;
      value: string | null;
      expectedUpdatedAt: string;
    }) => patchJson<{
      work: CreativeWorkDraftItem;
      briefing: InferredBriefing;
      briefingFactPack: CreativeWorkFactPack;
      briefingOverrides: CreativeWorkBriefingOverrides;
      briefingVersion: number;
    }>(`/api/creative-work/${input.workItemId}`, {
      action: "editBriefing",
      field: input.field,
      value: input.value,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),
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
    mutationFn: ({ workItemId, choice, expectedUpdatedAt }: {
      workItemId: string;
      choice: CreativeWorkBrandChoice;
      expectedUpdatedAt: string;
    }) =>
      patchJson<{ work: CreativeWorkDraftItem }>(`/api/creative-work/${workItemId}`, {
        action: "resolveBrandConflict",
        choice,
        expectedUpdatedAt,
      }),
    onSuccess: (_data, input) => invalidateCreativeDraft(queryClient, input.workItemId),
  });
}

type CreativeSourceAction = (
  | { action: "attachSource"; assetId: string; templateId?: never; usage: CreativeSourceUsage }
  | { action: "attachSource"; templateId: string; assetId?: never; usage: CreativeSourceUsage }
  | { action: "updateSource"; sourceId: string; usage: CreativeSourceUsage }
  | { action: "updatePieceReference"; sourceId: string; category?: PieceReferenceCategory; userInstruction?: string | null }
  | { action: "replacePieceReference"; sourceId: string; assetId: string }
  | { action: "promotePieceReference"; sourceId: string }
  | { action: "retrySource" | "removeSource"; sourceId: string }
  | { action: "editSourceAnalysis"; sourceId: string; content: ContentBrief | null; style: StyleBrief | null }
) & { expectedUpdatedAt: string };

export function useCreativeWorkSourceActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, ...action }: CreativeSourceAction & { workItemId: string }) =>
      patchJson<{ source?: CreativeWorkSource; removed?: boolean; reference?: { id: string; clientProfileId?: string }; alreadySaved?: boolean }>(`/api/creative-work/${workItemId}`, action),
    onSuccess: async (data, input) => {
      await invalidateCreativeDraft(queryClient, input.workItemId);
      if (data.reference?.clientProfileId) await queryClient.invalidateQueries({ queryKey: brandTrainingAssetsKey(data.reference.clientProfileId) });
    },
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
          preparedPlan: current?.preparedPlan ?? null,
          carouselSlides: current?.carouselSlides ?? [],
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
    mutationFn: (input: { workItemId: string; preparedRevision: string; studioSessionId?: string; rolloutVariant?: StudioRolloutVariant }) =>
      postJson<{
        work: CreativeWorkItem;
        outputs?: CreativeWorkOutput[];
        carouselSlides?: PublicCarouselSlide[];
        preparedRevision?: string;
        brandTrainingSuggestion?: string | null;
      }>(
        `/api/creative-work/${input.workItemId}/generate`,
        { action: "initial", preparedRevision: input.preparedRevision, ...(input.studioSessionId ? { studioSessionId: input.studioSessionId } : {}), ...(input.rolloutVariant ? { rolloutVariant: input.rolloutVariant } : {}) },
        120_000,
      ),
    onSuccess: async (data, input) => {
      const workItemId = input.workItemId;
      queryClient.setQueryData<CreativeWorkDetail>(
        ["creative-work", workItemId],
        (current) => ({
          work: {
            ...data.work,
            createdAt: new Date(data.work.createdAt),
            updatedAt: new Date(data.work.updatedAt),
          },
          outputs: (data.outputs ?? []).map((output) => ({
            ...output,
            createdAt: new Date(output.createdAt),
            updatedAt: new Date(output.updatedAt),
          })),
          // Carousel generation answers with slides, never with legacy
          // outputs; seed them so polling starts without a round-trip.
          carouselSlides: Array.isArray(data.carouselSlides)
            ? (data.carouselSlides as unknown as Record<string, unknown>[]).map(mapCarouselSlide)
            : current?.carouselSlides ?? [],
          sources: current?.sources ?? [],
          preparedPlan: current?.preparedPlan ?? null,
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
      saveAsRecipe,
    }: {
      workItemId: string;
      outputId: string;
      saveToLibrary: boolean;
      confirmObjective?: boolean;
      saveAsRecipe?: boolean;
    }) =>
      postJson<{ output: CreativeWorkOutput; recipe: unknown }>(
        `/api/creative-work/${workItemId}/outputs/${outputId}/select`,
        {
          saveToLibrary,
          confirmObjective: confirmObjective ?? false,
          saveAsRecipe: saveAsRecipe ?? false,
        },
      ),
    onSuccess: async (_data, variables) => {
      // Saving the selected output materialises a new workspace asset. The
      // wizard must therefore invalidate both the work detail and the library.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["creative-work", variables.workItemId],
        }),
        queryClient.invalidateQueries({ queryKey: ["workspace-assets"] }),
        queryClient.invalidateQueries({ queryKey: ["creative-work", "recipes"] }),
        invalidateCanonicalWorks(queryClient),
      ]);
    },
    onError: (_error, variables) => queryClient.invalidateQueries({
      queryKey: ["creative-work", variables.workItemId],
    }),
  });
}

export function useDownloadOutputUrl() {
  return (workItemId: string, outputId: string, format: "original" | "psd" | "zip" = "original") =>
    `/api/creative-work/${workItemId}/outputs/${outputId}/download${format === "original" ? "" : `?format=${format}`}`;
}

// ---------------------------------------------------------------------------
// Carousel wizard (Criar carrossel) — one mutations family over the same
// creative-work detail cache. Carousel decks never enter
// creative_work_outputs, so these never touch output keys or the legacy
// generate/plan surface.
// ---------------------------------------------------------------------------

export function usePlanCarouselWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, expectedUpdatedAt, answers, command }: {
      workItemId: string;
      expectedUpdatedAt: string;
      answers: Record<string, string>;
      command?: CarouselEditorialCommand;
    }) =>
      postJson<{
        work: CreativeWorkItem;
        draft: CarouselDraftStateV1;
        findings?: unknown;
        editorial: CarouselEditorialState;
      }>(
        `/api/creative-work/${workItemId}/carousel/plan`,
        { expectedUpdatedAt, answers, ...(command ? { command } : {}) },
        120_000,
      ),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: creativeWorkKey(input.workItemId) }),
  });
}

export type CarouselSlideRevisionCommand =
  | { kind: "copy"; expectedVersion: number; primaryText: string; secondaryText: string | null }
  | { kind: "visual"; expectedVersion: number; instruction: string }
  | { kind: "retry"; expectedVersion: number };

export function useReviseCarouselSlide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, slideId, revisionKey, ...command }: CarouselSlideRevisionCommand & {
      workItemId: string;
      slideId: string;
      revisionKey: string;
    }) =>
      postJson<{ slide: PublicCarouselSlide; slides: PublicCarouselSlide[]; replay: boolean }>(
        `/api/creative-work/${workItemId}/carousel/slides/${slideId}/revise`,
        { ...command, revisionKey },
        120_000,
      ),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: creativeWorkKey(input.workItemId) }),
  });
}

export function useReviseCarouselDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, expectedRevision, revisionKey, plan, globalVisualInstruction }: {
      workItemId: string;
      expectedRevision: string;
      revisionKey: string;
      plan: CarouselDeckPlanV1;
      globalVisualInstruction: string | null;
    }) =>
      postJson<{ work: CreativeWorkItem; slides: PublicCarouselSlide[]; deckRevision: string; replay: boolean }>(
        `/api/creative-work/${workItemId}/carousel/revise`,
        { expectedRevision, revisionKey, plan, globalVisualInstruction },
        120_000,
      ),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: creativeWorkKey(input.workItemId) }),
  });
}

export function useApproveCarouselDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, revision }: { workItemId: string; revision: string }) =>
      patchJson<{ approvedRevision: string | null; replay: boolean }>(
        `/api/creative-work/${workItemId}`,
        { action: "approveCarousel", revision },
      ),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: creativeWorkKey(input.workItemId) }),
  });
}

export function useExportCarouselDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId }: { workItemId: string }) =>
      apiFetch(`/api/creative-work/${workItemId}/carousel/export`).then(async (res) => {
        if (!res.ok) throw await readError(res);
        return res.blob();
      }),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: creativeWorkKey(input.workItemId) }),
  });
}
