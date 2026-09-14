import { apiFetch } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export interface BrandTrainingStatus {
  profile: { id: string; name: string };
  trained: boolean;
  missing: string[];
  needsReview: boolean;
  voice: {
    configured: boolean;
    reviewStatus: "pending_review" | "approved" | "changes_requested" | null;
  };
  /**
   * Open calibration session, when one exists. A pending/calibrating session
   * is NOT active training: the previous version (if any) stays in use until
   * the validated candidate is explicitly activated.
   */
  calibration: {
    sessionId: string;
    status: "review" | "calibrating" | "pending";
    round: number | null;
    roundsCompleted: number;
    extensionCount: number;
  } | null;
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
      const guideCount = entries.filter((e) => e.kind === "guide").length;
      const timeoutMs = Math.min(
        300_000,
        Math.max(120_000, 90_000 + guideCount * 20_000),
      );
      const res = await apiFetch(url, { method: "POST", body: formData, timeoutMs });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.result as MultiExtractResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
      queryClient.invalidateQueries({ queryKey: ["brand-kit", clientProfileId] });
      queryClient.invalidateQueries({ queryKey: ["brand-knowledge", clientProfileId] });
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
          body: JSON.stringify(
            creativeDescriptions !== undefined ? { creativeDescriptions } : {},
          ),
          timeoutMs: 120_000,
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

export interface BrandFontAssetRecord {
  assetKey: string;
  family: string;
  source: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
  sha256: string;
  reviewStatus?: "pending_approval" | "approved" | "archived";
  uploadedAt?: string;
  uploadedByUserId?: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  archivedAt?: string | null;
  archivedByUserId?: string | null;
}

const brandFontsKey = (clientProfileId: string) =>
  ["brand-fonts", clientProfileId] as const;

export function useBrandFonts(clientProfileId: string | null) {
  return useQuery({
    queryKey: brandFontsKey(clientProfileId ?? ""),
    queryFn: async (): Promise<BrandFontAssetRecord[]> => {
      const res = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-fonts`);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return Array.isArray(data?.fonts) ? data.fonts : [];
    },
    enabled: Boolean(clientProfileId),
  });
}

export function useUploadBrandFont(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      family: string;
      source: string;
      weight: BrandFontAssetRecord["weight"];
      style: BrandFontAssetRecord["style"];
    }): Promise<BrandFontAssetRecord> => {
      const form = new FormData();
      form.set("file", input.file);
      form.set("family", input.family);
      form.set("source", input.source);
      form.set("weight", String(input.weight));
      form.set("style", input.style);
      form.set("rightsConfirmed", "true");
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/brand-fonts`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.font as BrandFontAssetRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandFontsKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export function useReviewBrandFont(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      assetKey: string;
      reviewStatus: "approved" | "archived";
    }): Promise<BrandFontAssetRecord> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/brand-fonts`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.font as BrandFontAssetRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandFontsKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Approved visual assets (Tasks 3-5).                                *
 * ------------------------------------------------------------------ */

export interface BrandTrainingAssetMetadata {
  hasAlpha?: boolean;
  originalMimeType?: string;
}

export interface BrandTrainingAssetRecord {
  id: string;
  clientProfileId: string;
  assetKey: string;
  label: string;
  reviewStatus:
    | "pending_analysis"
    | "pending_approval"
    | "approved"
    | "archived"
    | "rejected";
  rejectionReason?: {
    code:
      | "brand_drift"
      | "excessive_accent_color"
      | "generic_stock_photo"
      | "decorative_3d"
      | "text_density"
      | "weak_hierarchy"
      | "literal_reference_copy"
      | "prohibited_element"
      | "other";
    note?: string;
  } | null;
  trainingCategory?:
    | "logo"
    | "graphic"
    | "character"
    | "visual_reference"
    | null;
  usageMode?: "exact" | "reference" | "rule" | null;
  trainingAnalysis?: {
    description: string;
    visualAttributes: string[];
    rules: string[];
    constraints: string[];
    confidence: number;
  } | null;
  reviewedAt: string | Date | null;
  reviewedByUserId: string | null;
  createdAt: string | Date;
  asset: {
    id: string;
    key: string;
    type: string;
    metadata?: BrandTrainingAssetMetadata | null;
  };
  url: string;
}

export const brandTrainingAssetsKey = (clientProfileId: string) =>
  ["brand-training-assets", clientProfileId] as const;

export function useBrandTrainingAssets(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: brandTrainingAssetsKey(clientProfileId ?? ""),
    queryFn: async (): Promise<BrandTrainingAssetRecord[]> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/training-assets`,
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      const list = Array.isArray(data?.references) ? data.references : [];
      return list.filter(
        (entry: unknown): entry is BrandTrainingAssetRecord =>
          entry !== null && typeof entry === "object",
      );
    },
    enabled: Boolean(clientProfileId),
    refetchInterval: (query) => {
      const assets = query.state.data as BrandTrainingAssetRecord[] | undefined;
      return assets?.some((asset) => asset.reviewStatus === "pending_analysis")
        ? 2_500
        : false;
    },
  });

  useEffect(() => {
    if (query.data?.some((asset) => asset.reviewStatus === "pending_approval")) {
      void queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    }
  }, [clientProfileId, query.data, queryClient]);

  return query;
}

export function useUploadBrandTrainingAsset(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<BrandTrainingAssetRecord> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/training-assets`,
        { method: "POST", body: formData },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.reference as BrandTrainingAssetRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandTrainingAssetsKey(clientProfileId ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: ["brand-training-status", clientProfileId],
      });
      queryClient.invalidateQueries({ queryKey: ["brand-knowledge", clientProfileId] });
    },
  });
}

export interface BrandKnowledgeClaimRecord {
  id: string;
  claimKey: string;
  value: unknown;
  authority: "human" | "explicit" | "measured" | "inferred";
  confidence: "low" | "medium" | "high";
  status: "candidate" | "approved" | "rejected" | "superseded";
  evidenceRefs: Array<{ type: string; id: string; path: string; sourceHash: string }>;
}

export interface BrandKnowledgePayload {
  claims: BrandKnowledgeClaimRecord[];
  conflicts: Array<{
    claimKey: string;
    comparison: "conflict" | "human_needed";
    claims: Array<Pick<BrandKnowledgeClaimRecord, "id" | "value" | "authority" | "confidence" | "evidenceRefs">>;
  }>;
  versions: Array<{
    id: string;
    versionNumber: number;
    hash: string;
    status: "active" | "superseded";
    publishedByUserId: string;
    publishedAt: string;
    snapshot?: { claims: Array<{ id: string; claimKey: string; value: unknown; evidenceRefs: BrandKnowledgeClaimRecord["evidenceRefs"]; reviewedByUserId: string; reviewedAt: string }> };
  }>;
  activeVersion: { id: string; versionNumber: number; hash: string; status: "active" } | null;
}

const brandKnowledgeKey = (clientProfileId: string) => ["brand-knowledge", clientProfileId] as const;

export function useBrandKnowledge(clientProfileId: string | null) {
  return useQuery({
    queryKey: brandKnowledgeKey(clientProfileId ?? ""),
    queryFn: async (): Promise<BrandKnowledgePayload> => {
      const response = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-knowledge`);
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    enabled: Boolean(clientProfileId),
  });
}

export function useReviewBrandKnowledgeClaim(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      claimId: string;
      status: "approved" | "rejected";
      value?: unknown;
      alternatives?: Array<{ claimId: string; value: unknown }>;
    }) => {
      const response = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-knowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKnowledgeKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export function useReviewRepertoire(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      expectedRevision: number;
      value: unknown;
    }) => {
      const response = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-knowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "review_repertoire", ...input }),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKnowledgeKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: brandCalibrationKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export type SynthesizeRepertoireError = Error & { code?: string };

export function useSynthesizeRepertoire(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      referenceIds?: string[];
      feedback?: Array<{ outputId: string; rating: "good" | "bad"; note: string }>;
    }) => {
      const response = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-knowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "synthesize_repertoire", ...input }),
        timeoutMs: 180_000,
      });
      if (!response.ok) {
        // The API body carries a machine-readable code next to the localized
        // message; the review needs the code to offer a subset picker on
        // brandRepertoireSelectionRequired instead of a dead error.
        const body = await response.json().catch(() => ({}));
        const failure: SynthesizeRepertoireError = new Error(
          typeof body?.error === "string" ? body.error : "Request failed",
        );
        if (typeof body?.code === "string") failure.code = body.code;
        throw failure;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKnowledgeKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export function usePublishBrandKnowledge(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proof: { sessionId: string; expectedRevision: number; candidateHash: string }) => {
      const response = await apiFetch(`/api/client-profiles/${clientProfileId}/brand-knowledge/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKnowledgeKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: brandCalibrationKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export interface BrandCalibrationExample {
  workItemId: string;
  outputId: string | null;
  previewUrl: string | null;
  assessment: {
    status: "queued" | "processing" | "completed" | "failed";
    objective: "pass" | "fail" | "inconclusive";
    rating: "good" | "bad" | null;
    needsHumanReview: boolean;
  };
}

export interface BrandCalibrationSessionPayload {
  id: string;
  status: "review" | "calibrating" | "pending" | "activated" | "archived";
  revision: number;
  candidate: { hash: string };
  rounds: Array<{
    number: number;
    candidate: { hash: string };
    quoteCredits: number;
    coverage: string[];
    slots: Array<{
      index: number;
      workItemId: string;
      outputId: string | null;
      feedback: { rating: "good" | "bad"; note: string; dimensions: string[] } | null;
    }>;
  }>;
  extensionCount: number;
}

export interface BrandCalibrationPayload {
  session: BrandCalibrationSessionPayload | null;
  activeVersionId: string | null;
  quoteCredits: number;
  examples: BrandCalibrationExample[];
  /** Reviewed language/rule/person IDs the latest round does not exercise. */
  uncovered: string[];
}

export type BrandCalibrationCommand =
  | { action: "create"; expectedActiveVersionId: string | null }
  | { action: "start"; sessionId: string; expectedRevision: number; acceptedCredits: number }
  | {
      action: "feedback";
      sessionId: string;
      expectedRevision: number;
      round: number;
      slot: number;
      rating: "good" | "bad";
      note: string;
      dimensions: string[];
    }
  | { action: "extend"; sessionId: string; expectedRevision: number }
  | { action: "archive"; sessionId: string; expectedRevision: number };

export const brandCalibrationKey = (clientProfileId: string) =>
  ["brand-calibration", clientProfileId] as const;

export function useBrandCalibration(clientProfileId: string | null) {
  return useQuery({
    queryKey: brandCalibrationKey(clientProfileId ?? ""),
    queryFn: async (): Promise<BrandCalibrationPayload> => {
      const response = await apiFetch(
        `/api/client-profiles/${clientProfileId}/brand-knowledge/calibration`,
      );
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    enabled: Boolean(clientProfileId),
    refetchInterval: (query) => {
      const payload = query.state.data as BrandCalibrationPayload | undefined;
      return payload?.examples.some(
        (example) =>
          example.assessment.status === "queued" || example.assessment.status === "processing",
      )
        ? 5_000
        : false;
    },
  });
}

export function useCalibrationCommand(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (command: BrandCalibrationCommand) => {
      const response = await apiFetch(
        `/api/client-profiles/${clientProfileId}/brand-knowledge/calibration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandCalibrationKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: brandKnowledgeKey(clientProfileId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["brand-training-status", clientProfileId] });
    },
  });
}

export interface ReviewBrandTrainingAssetInput {
  referenceId: string;
  trainingCategory: "logo" | "graphic" | "character" | "person" | "visual_reference";
  usageMode: "exact" | "reference" | "rule";
  analysis: BrandTrainingAssetRecord["trainingAnalysis"] | null;
  reviewStatus: "approved" | "archived" | "rejected";
  rejectionReason?: BrandTrainingAssetRecord["rejectionReason"];
}

export function useReviewBrandTrainingAsset(clientProfileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ReviewBrandTrainingAssetInput,
    ): Promise<BrandTrainingAssetRecord> => {
      const res = await apiFetch(
        `/api/client-profiles/${clientProfileId}/training-assets/${input.referenceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainingCategory: input.trainingCategory,
            usageMode: input.usageMode,
            analysis: input.analysis,
            reviewStatus: input.reviewStatus,
            rejectionReason: input.rejectionReason ?? null,
          }),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      return data.reference as BrandTrainingAssetRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandTrainingAssetsKey(clientProfileId ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: ["brand-training-status", clientProfileId],
      });
    },
  });
}
