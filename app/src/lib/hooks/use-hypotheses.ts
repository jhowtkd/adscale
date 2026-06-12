import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  ComparisonVerdict,
  HypothesisOutcome,
  HypothesisPrimaryMetric,
  VariantComparisonReport,
} from "@/server/performance/hypothesis/types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export interface HypothesisVariantLink {
  id: string;
  derivationId: string;
  role: "control" | "variant";
  label: string | null;
}

export interface CampaignHypothesis {
  id: string;
  campaignId: string;
  title: string | null;
  variableKey: string;
  primaryMetric: HypothesisPrimaryMetric;
  expectedDirection: "increase" | "decrease";
  rationale: string;
  kind: "controlled_hypothesis" | "observational";
  platform: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  outcome: HypothesisOutcome | null;
  status: string;
  lastComparisonAt: string | null;
  variants: HypothesisVariantLink[];
  createdAt: string;
}

export interface StoredComparison {
  id: string;
  hypothesisId: string | null;
  kind: "controlled_hypothesis" | "observational";
  verdict: ComparisonVerdict;
  primaryMetric: string;
  outcome: HypothesisOutcome | null;
  createdAt: string;
  variantResults: VariantComparisonReport | null;
}

export interface CreateHypothesisPayload {
  title?: string | null;
  variableKey: string;
  primaryMetric: HypothesisPrimaryMetric;
  expectedDirection: "increase" | "decrease";
  rationale: string;
  platform?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  variants: Array<{
    derivationId: string;
    role: "control" | "variant";
    label?: string | null;
  }>;
}

export function useCampaignHypotheses(campaignId: string) {
  return useQuery({
    queryKey: ["campaign-hypotheses", campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/hypotheses`);
      return parseJsonResponse<{ hypotheses: CampaignHypothesis[] }>(res);
    },
    enabled: Boolean(campaignId),
  });
}

export function useCampaignComparisons(campaignId: string) {
  return useQuery({
    queryKey: ["campaign-comparisons", campaignId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/comparisons`);
      return parseJsonResponse<{ comparisons: StoredComparison[] }>(res);
    },
    enabled: Boolean(campaignId),
  });
}

export function useCreateHypothesis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateHypothesisPayload) => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/hypotheses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ hypothesis: CampaignHypothesis }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-hypotheses", campaignId] });
    },
  });
}

export function useCompareHypothesis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hypothesisId: string) => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/hypotheses/${hypothesisId}/compare`,
        { method: "POST" }
      );
      return parseJsonResponse<{ report: VariantComparisonReport; comparisonId: string }>(
        res
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-hypotheses", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-comparisons", campaignId] });
    },
  });
}

export function useObservationalComparison(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      primaryMetric: HypothesisPrimaryMetric;
      derivationIds: string[];
      platform?: string | null;
    }) => {
      const res = await apiFetch(`/api/campaigns/${campaignId}/comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse<{ report: VariantComparisonReport; comparisonId: string }>(
        res
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-comparisons", campaignId] });
    },
  });
}

export function useDeleteHypothesis(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hypothesisId: string) => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/hypotheses/${hypothesisId}`,
        { method: "DELETE" }
      );
      return parseJsonResponse<{ ok: boolean }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-hypotheses", campaignId] });
    },
  });
}

export const VERDICT_LABELS: Record<ComparisonVerdict, string> = {
  winner: "Vencedor identificado",
  no_clear_winner: "Sem vencedor claro",
  insufficient_evidence: "Evidência insuficiente",
  not_comparable: "Não comparável",
};

export const OUTCOME_LABELS: Record<HypothesisOutcome, string> = {
  supported: "Suportada",
  contradicted: "Contrariada",
  inconclusive: "Inconclusiva",
};
