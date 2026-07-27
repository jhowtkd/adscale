import { apiFetch } from "@/lib/api-client";
import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";
import {
  createLoadError,
  getLoadErrorKind,
  CampaignLoadError,
  type DerivationLoadErrorKind,
} from "@/lib/campaign-load-error";
import { STALE_TIME } from "@/lib/query-config";
import { invalidateWorkListProjections } from "@/lib/hooks/use-canonical-works";
import { createMutationIdempotency } from "@/lib/hooks/mutation-idempotency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

export type { DerivationLoadErrorKind };
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

export type DerivationsQueryData = {
  derivations: Derivation[];
  produceSurface: WorkspaceProduceSurface | null;
};

async function fetchDerivations(
  campaignId: string
): Promise<DerivationsQueryData> {
  try {
    const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`);
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
    const data = await res.json();
    const raw = data.derivations as Derivation[];
    return {
      derivations: raw.map((d) => ({
        ...d,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
        scoredAt: d.scoredAt ? new Date(d.scoredAt) : null,
        qaAnalyzedAt: d.qaAnalyzedAt ? new Date(d.qaAnalyzedAt) : null,
        qualityGatedAt: d.qualityGatedAt ? new Date(d.qualityGatedAt) : null,
      })),
      produceSurface: (data.produceSurface as WorkspaceProduceSurface) ?? null,
    };
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

function mergeDerivations(
  existing: Derivation[] | undefined,
  incoming: Derivation[]
): Derivation[] {
  const byId = new Map<string, Derivation>();
  for (const item of existing ?? []) {
    byId.set(item.id, item);
  }
  for (const item of incoming) {
    byId.set(item.id, normalizeDerivationDates(item));
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  return merged;
}

export function hasPendingDerivationWork(data: Derivation[] | undefined) {
  return Boolean(
    data?.some(
      (d) =>
        d.status === "queued" ||
        d.status === "processing" ||
        d.scoreStatus === "heuristic" ||
        (d.status === "completed" && d.scoreStatus === "pending") ||
        // Preview approval depends on the quality gate, which runs after
        // scoring. Keep polling through that second lifecycle boundary.
        (d.isPreview &&
          d.status === "completed" &&
          d.qualityGatedAt == null)
    )
  );
}

async function createDerivations(
  campaignId: string,
  options?: {
    preview?: boolean;
    outputLearningApplication?: OutputLearningApplicationSnapshot;
  }
): Promise<Derivation[]> {
  const body: {
    preview: boolean;
    outputLearningApplication?: OutputLearningApplicationSnapshot;
  } = { preview: options?.preview ?? false };
  if (options?.outputLearningApplication) {
    body.outputLearningApplication = options.outputLearningApplication;
  }
  const res = await apiFetch(`/api/campaigns/${campaignId}/derivations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar derivações");
  }
  const data = await res.json();
  return data.derivations as Derivation[];
}

export function useDerivations(
  campaignId: string,
  options?: { enablePolling?: boolean }
) {
  const enablePolling = options?.enablePolling ?? true;
  const query = useQuery({
    queryKey: ["derivations", campaignId],
    queryFn: () => fetchDerivations(campaignId),
    enabled: !!campaignId && campaignId !== "new",
    staleTime: STALE_TIME.DYNAMIC,
    refetchInterval: (query) => {
      if (!enablePolling) return false;
      const payload = query.state.data as DerivationsQueryData | undefined;
      const data = payload?.derivations;
      const hasPending = hasPendingDerivationWork(data);
      if (!hasPending) return false;

      // Progressive backoff based on time since first pending observation
      const pendingSince = query.state.dataUpdatedAt;
      const elapsed = Date.now() - pendingSince;
      if (elapsed < 30000) return 3000;      // First 30s: every 3s
      if (elapsed < 120000) return 5000;     // Next 90s: every 5s
      return 10000;                           // After 2min: every 10s
    },
  });

  return {
    ...query,
    /** Back-compat: callers still treat `data` as Derivation[]. */
    data: query.data?.derivations,
    produceSurface: query.data?.produceSurface ?? null,
    errorKind: query.error ? getLoadErrorKind(query.error) : null,
    loadError: query.error,
  };
}

export function useCreateDerivations(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options?: {
      preview?: boolean;
      outputLearningApplication?: OutputLearningApplicationSnapshot;
    }) => createDerivations(campaignId, options),
    onSuccess: (created) => {
      queryClient.setQueryData<DerivationsQueryData>(
        ["derivations", campaignId],
        (old) => ({
          derivations: mergeDerivations(old?.derivations, created),
          produceSurface: old?.produceSurface ?? null,
        })
      );
      queryClient.invalidateQueries({
        queryKey: ["derivations", campaignId],
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      void invalidateWorkListProjections(queryClient);
    },
  });
}

export function useRestyleCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  // Keep key only across transport loss; any Response ends the attempt.
  const idempotencyRef = useRef(createMutationIdempotency());
  return useMutation({
    retry: 0,
    mutationFn: async (input: {
      styleAssetIds?: string[];
      styleIntensity?: string;
    }) => {
      const key = idempotencyRef.current.current();
      let res: Response;
      try {
        res = await apiFetch(`/api/campaigns/${campaignId}/restyle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(input),
        });
      } catch (error) {
        // No Response — keep key for retry after lost connection.
        throw error;
      }
      // Confirmed Response (2xx or error body) ends this attempt.
      idempotencyRef.current.rotateAfterResponse();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao criar restyling");
      }
      const data = await res.json();
      return data.derivations as Derivation[];
    },
    onSuccess: (created) => {
      queryClient.setQueryData<DerivationsQueryData>(
        ["derivations", campaignId],
        (old) => ({
          derivations: mergeDerivations(old?.derivations, created),
          produceSurface: old?.produceSurface ?? null,
        })
      );
      queryClient.invalidateQueries({ queryKey: ["derivations", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      void invalidateWorkListProjections(queryClient);
    },
  });
}
