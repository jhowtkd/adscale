import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface BrandTrainingStatus {
  profile: { id: string; name: string };
  trained: boolean;
  missing: string[];
  voice: {
    configured: boolean;
    reviewStatus: "pending_review" | "approved" | "changes_requested" | null;
  };
}

export interface MultiExtractEntry {
  fileName: string;
  kind: "guide" | "logo" | "creative";
}

export interface MultiExtractResult {
  brandKit: {
    colors?: string[];
    fonts?: string[];
    toneOfVoice?: string;
    prohibitedElements?: string;
    requiredElements?: string;
    logoDescription?: string;
  };
  assets: Array<{
    kind: "guide" | "logo" | "creative";
    fileName: string;
    assetKey: string;
    url: string;
  }>;
  charges: Array<{ fileName: string; kind: "guide" | "logo" | "creative"; charged: boolean }>;
}

export interface BrandVoiceConfigPayload {
  principles: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  authorityAndClaims: string[];
  inviteRhythm: string[];
  correctButSoulless: string[];
  matchTerms?: string[];
}

export interface BrandVoiceConfig {
  clientProfileId: string;
  voiceId: string;
  displayName: string;
  config: BrandVoiceConfigPayload;
  reviewStatus: "pending_review" | "approved" | "changes_requested";
  source: string | null;
}

async function readError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return typeof err.error === "string" ? err.error : "Request failed";
}

export function useBrandTrainingStatus(clientProfileId: string | null) {
  return useQuery({
    queryKey: ["brand-training-status", clientProfileId],
    queryFn: async (): Promise<BrandTrainingStatus> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/training-status`,
      );
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
    enabled: Boolean(clientProfileId),
  });
}

export function useExtractMulti(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entries,
      files,
    }: {
      entries: MultiExtractEntry[];
      files: Record<string, File>;
    }): Promise<MultiExtractResult> => {
      const formData = new FormData();
      formData.append("entries", JSON.stringify(entries));
      for (const entry of entries) {
        const file = files[entry.fileName];
        if (file) formData.append(entry.fileName, file);
      }
      const url = clientProfileId
        ? `/api/workspace/brand-kit/extract-multi?clientProfileId=${encodeURIComponent(clientProfileId)}`
        : "/api/workspace/brand-kit/extract-multi";
      const res = await apiFetch(url, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.result as MultiExtractResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
      queryClient.invalidateQueries({ queryKey: ["brandKit", clientProfileId] });
    },
  });
}

export function useExtractVoice(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      creativeDescriptions?: string[],
    ): Promise<BrandVoiceConfig> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/voice/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creativeDescriptions }),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.config as BrandVoiceConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export function useApproveVoice(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      config?: BrandVoiceConfigPayload,
    ): Promise<BrandVoiceConfig> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/voice/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config ? { config } : {}),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.config as BrandVoiceConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}
