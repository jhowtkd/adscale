import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CompetitorAnalysis {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  name: string;
  platform: string | null;
  website: string | null;
  screenshots: string[] | null;
  screenshotUrls: string[];
  strengths: unknown;
  weaknesses: unknown;
  differentiators: unknown;
  analysis: Record<string, unknown> | null;
  analyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompetitorAnalysisData {
  visualPatterns: {
    colors?: string[];
    composition?: string;
    typography?: string;
  };
  messaging: {
    headlineStyle?: string;
    ctaStyle?: string;
    offerType?: string;
  };
  strengths: string[];
  weaknesses: string[];
  differentiationOpportunities: string[];
}

export interface DifferentiationStrategy {
  recommendations: string[];
  insights: string[];
}

async function fetchCompetitorAnalyses(campaignId: string): Promise<CompetitorAnalysis[]> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/competitors`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar análises de concorrentes");
  }
  const data = await res.json();
  return (data.competitors ?? []).map((c: CompetitorAnalysis) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    analyzedAt: c.analyzedAt ? new Date(c.analyzedAt) : null,
  }));
}

async function createCompetitorAnalysis(payload: {
  campaignId: string;
  name: string;
  platform?: string | null;
  website?: string | null;
  screenshotKeys?: string[];
  strengths?: string[];
  weaknesses?: string[];
  differentiators?: string[];
  analysis?: Record<string, unknown> | null;
}): Promise<CompetitorAnalysis> {
  const res = await apiFetch(`/api/campaigns/${payload.campaignId}/competitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      platform: payload.platform,
      website: payload.website,
      screenshotKeys: payload.screenshotKeys,
      strengths: payload.strengths,
      weaknesses: payload.weaknesses,
      differentiators: payload.differentiators,
      analysis: payload.analysis,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar análise de concorrente");
  }
  const data = await res.json();
  const c = data.competitor as CompetitorAnalysis;
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    analyzedAt: c.analyzedAt ? new Date(c.analyzedAt) : null,
  };
}

async function analyzeCompetitorScreenshots(payload: {
  campaignId: string;
  files: File[];
  name?: string;
  platform?: string;
}): Promise<CompetitorAnalysisData> {
  const formData = new FormData();
  payload.files.forEach((file) => formData.append("files", file));
  if (payload.name) formData.append("name", payload.name);
  if (payload.platform) formData.append("platform", payload.platform);

  const res = await apiFetch(`/api/campaigns/${payload.campaignId}/competitors/analyze`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao analisar screenshots");
  }
  const data = await res.json();
  return data.analysis;
}

async function generateDifferentiationStrategy(campaignId: string): Promise<DifferentiationStrategy> {
  const res = await apiFetch(`/api/campaigns/${campaignId}/competitors/strategy`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao gerar estratégia de diferenciação");
  }
  const data = await res.json();
  return data.strategy;
}

async function deleteCompetitorAnalysis(payload: {
  campaignId: string;
  competitorId: string;
}): Promise<void> {
  const res = await apiFetch(
    `/api/campaigns/${payload.campaignId}/competitors/${payload.competitorId}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir análise de concorrente");
  }
}

export function useCompetitorAnalyses(campaignId: string) {
  return useQuery({
    queryKey: ["competitor-analyses", campaignId],
    queryFn: () => fetchCompetitorAnalyses(campaignId),
    enabled: !!campaignId && campaignId !== "new",
  });
}

export function useCreateCompetitorAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompetitorAnalysis,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["competitor-analyses", variables.campaignId] });
    },
  });
}

export function useAnalyzeCompetitorScreenshots() {
  return useMutation({
    mutationFn: analyzeCompetitorScreenshots,
  });
}

export function useGenerateDifferentiationStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateDifferentiationStrategy,
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["competitor-analyses", campaignId] });
    },
  });
}

export function useDeleteCompetitorAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCompetitorAnalysis,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["competitor-analyses", variables.campaignId] });
    },
  });
}
