import { apiFetch } from "@/lib/api-client";
import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import {
  createLoadError,
  getLoadErrorKind,
  CampaignLoadError,
  type DerivationLoadErrorKind,
} from "@/lib/campaign-load-error";
import { STALE_TIME } from "@/lib/query-config";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { CATALOG_PAGE_MAX_LIMIT } from "@/lib/catalog-page";
import {
  isPendingDerivationWork,
  type CampaignDerivationSummary,
} from "@/lib/campaign-derivation-summary";

export type { DerivationLoadErrorKind, CampaignDerivationSummary };
export type DerivationLoadError = CampaignLoadError;

export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
  variationLevelFit?: number;
  informationPreservation?: number;
}

export interface Derivation {
  id: string;
  campaignId: string;
  workspaceId: string;
  planId: string | null;
  parentId: string | null;
  status: string;
  prompt: string | null;
  outputKey: string | null;
  imageUrl: string | null;
  format: string | null;
  generationMode: string | null;
  variantIndex: number | null;
  ctaText: string | null;
  cost: number | null;
  feedback: string | null;
  qualityScore?: number | null;
  scoreStatus?: ScoreStatus | null;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
  scoredAt?: Date | null;
  qaStatus?: "pending" | "ready" | "warning" | "review" | "failed" | null;
  qaChecklist?: Record<string, { status: string; note: string }> | null;
  qaIssues?: string[] | null;
  qaSuggestions?: string[] | null;
  qaAnalyzedAt?: Date | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
  hardFailures?: Array<{ code: string; message: string; criterion?: string }> | null;
  regenerationPrimaryReason?: string | null;
  regenerationIssueBreakdown?: import("@/lib/regeneration-preview-types").RegenerationIssueBreakdown | null;
  polishSuggestions?: string[] | null;
  qualityGatedAt?: Date | null;
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
  styleAssetId?: string | null;
  isPreview?: boolean;
  autoRetryAttempted?: boolean;
  autoRetryReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Server-calculated produce rules (Phase 6 / item 49). */
export type WorkspaceProduceSurface = {
  batchCreditBreakdown: {
    jobCount: number;
    unitCost: number;
    totalCredits: number;
    generationMode: string;
  } | null;
  batchCreditEstimate: number;
  showPreviewGate: boolean;
  shouldAutoContinuePreview: boolean;
  activePreviewId: string | null;
};

/** One page of `GET /api/campaigns/[id]/derivations` (#503). */
export type DerivationsPage = {
  derivations: Derivation[];
  nextCursor: string | null;
  /** First page only: computed over every Peça of the Campanha. */
  produceSurface: WorkspaceProduceSurface | null;
  /** First page only: computed over every Peça of the Campanha. */
  summary: CampaignDerivationSummary | null;
};


type DerivationsResponse = {
  derivations?: Derivation[];
  nextCursor?: string | null;
  produceSurface?: WorkspaceProduceSurface;
  summary?: CampaignDerivationSummary;
};

async function requestDerivations(path: string): Promise<DerivationsResponse> {
  try {
    const res = await apiFetch(path);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw createLoadError(
        (err.error as string | undefined) || "Failed to load derivations",
        {
          status: res.status,
          code: err.code as string | undefined,
        }
      );
    }
    return (await res.json()) as DerivationsResponse;
  } catch (error) {
    if (error instanceof CampaignLoadError) {
      throw error;
    }
    throw createLoadError(
      error instanceof Error ? error.message : "Failed to load derivations",
      { cause: error }
    );
  }
}

function derivationsPath(campaignId: string) {
  return `/api/campaigns/${campaignId}/derivations`;
}

async function fetchDerivationsPage(
  campaignId: string,
  cursor: string | null
): Promise<DerivationsPage> {
  const path = derivationsPath(campaignId);
  const data = await requestDerivations(
    cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path
  );
  return {
    derivations: (data.derivations ?? []).map(normalizeDerivationDates),
    nextCursor: data.nextCursor ?? null,
    produceSurface: data.produceSurface ?? null,
    summary: data.summary ?? null,
  };
}

async function fetchDerivationsByIds(
  campaignId: string,
  ids: readonly string[]
): Promise<Derivation[]> {
  const data = await requestDerivations(
    `${derivationsPath(campaignId)}?ids=${ids.join(",")}`
  );
  return (data.derivations ?? []).map(normalizeDerivationDates);
}

function normalizeDerivationDates(d: Derivation): Derivation {
  return {
    ...d,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
    scoredAt: d.scoredAt ? new Date(d.scoredAt) : null,
    qaAnalyzedAt: d.qaAnalyzedAt ? new Date(d.qaAnalyzedAt) : null,
    qualityGatedAt: d.qualityGatedAt ? new Date(d.qualityGatedAt) : null,
  };
}

export function hasPendingDerivationWork(data: Derivation[] | undefined) {
  return Boolean(data?.some(isPendingDerivationWork));
}

/**
 * Polling cadence (D6): only while the Campanha still has pending work, as the
 * server summary says for ALL its Peças, with the 3 s / 5 s / 10 s backoff.
 */
export function derivationsPollInterval(
  summary: CampaignDerivationSummary | null | undefined,
  pendingSince: number,
  now: number = Date.now()
): number | false {
  if (!summary?.hasPendingWork) return false;
  // Progressive backoff based on time since first pending observation
  const elapsed = now - pendingSince;
  if (elapsed < 30000) return 3000;      // First 30s: every 3s
  if (elapsed < 120000) return 5000;     // Next 90s: every 5s
  return 10000;                           // After 2min: every 10s
}

function uniqueIds(ids: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const id of ids) if (id) seen.add(id);
  return [...seen];
}

/**
 * Peças of a Campanha, one keyset page at a time (#503).
 *
 * - `data` is the loaded pages, newest first; "Carregar mais" is `fetchNextPage`.
 * - `summary` and `produceSurface` come from the first page and cover every
 *   Peça, so counts, the stage and polling never depend on what is loaded.
 * - Polling refetches the loaded pages while `summary.hasPendingWork` (D6).
 * - `selectedIds` are resolved with `ids=` while selected, so a refetch that
 *   pushes one out of the loaded pages does not lose it (D7). The active preview
 *   is resolved the same way when it is not loaded. The approved Peça is known
 *   by id from `summary.approvedIds` and is not fetched: nothing shows it yet.
 */
export function useDerivations(
  campaignId: string,
  options?: {
    enablePolling?: boolean;
    selectedIds?: readonly (string | null | undefined)[];
  }
) {
  const enablePolling = options?.enablePolling ?? true;
  const enabled = !!campaignId && campaignId !== "new";
  // When the Campanha started having pending work, for the 3/5/10 s backoff.
  // `dataUpdatedAt` restarted it on every poll, which kept polling at 3 s forever.
  const pendingSinceRef = useRef<number | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["derivations", campaignId],
    queryFn: ({ pageParam }) => fetchDerivationsPage(campaignId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: STALE_TIME.DYNAMIC,
    refetchInterval: (query) => {
      const pending = query.state.data?.pages[0]?.summary;
      if (!enablePolling || !pending?.hasPendingWork) {
        pendingSinceRef.current = null;
        return false;
      }
      pendingSinceRef.current ??= Date.now();
      return derivationsPollInterval(pending, pendingSinceRef.current);
    },
  });

  const pages = query.data?.pages;
  const summary = pages?.[0]?.summary ?? null;
  const produceSurface = pages?.[0]?.produceSurface ?? null;
  const loaded = useMemo(() => {
    const byId = new Map<string, Derivation>();
    for (const page of pages ?? []) {
      for (const d of page.derivations) if (!byId.has(d.id)) byId.set(d.id, d);
    }
    return [...byId.values()];
  }, [pages]);

  const selectedKey = uniqueIds(options?.selectedIds ?? []).sort().join(",");
  const activePreviewId = produceSurface?.activePreviewId;
  const idsToResolve = useMemo(() => {
    const loadedIds = new Set(loaded.map((d) => d.id));
    const preview = activePreviewId && !loadedIds.has(activePreviewId) ? [activePreviewId] : [];
    return uniqueIds([...(selectedKey ? selectedKey.split(",") : []), ...preview])
      .sort()
      .slice(0, CATALOG_PAGE_MAX_LIMIT);
  }, [loaded, selectedKey, activePreviewId]);

  const resolved = useQuery({
    queryKey: ["derivations", campaignId, "ids", idsToResolve.join(",")],
    queryFn: () => fetchDerivationsByIds(campaignId, idsToResolve),
    // Loaded pages, not `isSuccess`: a failed "Carregar mais" must not switch
    // the selection off.
    enabled: enabled && query.data !== undefined && idsToResolve.length > 0,
    staleTime: STALE_TIME.DYNAMIC,
    placeholderData: keepPreviousData,
    // Only a selection rides the polling cycle; the preview is refreshed by the
    // invalidations that change it.
    refetchInterval: () =>
      enablePolling && selectedKey && summary?.hasPendingWork
        ? derivationsPollInterval(summary, pendingSinceRef.current ?? Date.now())
        : false,
  });
  const resolvedData = resolved.data;
  const resolvedDerivations = useMemo(() => {
    // A loaded row wins: it came with the same refetch. Rows kept from a
    // previous key are dropped once their id is no longer requested.
    const loadedIds = new Set(loaded.map((d) => d.id));
    const requested = new Set(idsToResolve);
    return (resolvedData ?? []).filter(
      (d) => requested.has(d.id) && !loadedIds.has(d.id)
    );
  }, [loaded, resolvedData, idsToResolve]);

  return {
    ...query,
    /** Loaded pages, newest first. */
    data: query.data ? loaded : undefined,
    /** Selected or referenced Peças outside the loaded pages, fetched with `ids=`. */
    resolvedDerivations,
    summary,
    produceSurface,
    errorKind: query.error ? getLoadErrorKind(query.error) : null,
    loadError: query.error,
  };
}
