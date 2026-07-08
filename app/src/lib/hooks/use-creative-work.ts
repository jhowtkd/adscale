"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

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
  offer: string;
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
  brandKit: {
    colors: string[];
    fonts: string[];
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
  toolKind: "social_post";
  status: CreativeWorkStatus;
  brief: SocialPostBrief;
  format: "1:1" | "4:5" | "9:16";
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
  status: CreativeWorkOutputStatus;
  outputKey: string | null;
  cost: number | null;
  failureCode: string | null;
  quality: Record<string, unknown> | null;
  isSelected: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeWorkDetail {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
}

async function readError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return typeof err.error === "string" ? err.error : "Request failed";
}

function fetchCreativeWork(workItemId: string): Promise<CreativeWorkDetail> {
  return apiFetch(`/api/creative-work/${workItemId}`).then(async (res) => {
    if (!res.ok) throw new Error(await readError(res));
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
    if (!res.ok) throw new Error(await readError(res));
    return res.json() as Promise<{ options: IdentityOption[] }>;
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await readError(res));
    return res.json() as Promise<T>;
  });
}

function patchJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await readError(res));
    return res.json() as Promise<T>;
  });
}

export function useCreativeWork(workItemId: string | null | undefined) {
  return useQuery({
    queryKey: ["creative-work", workItemId],
    queryFn: () => fetchCreativeWork(workItemId!),
    enabled: Boolean(workItemId),
    refetchInterval: (query) => {
      if (!workItemId) return false;
      const data = query.state.data as CreativeWorkDetail | undefined;
      if (!data) return false;
      // Only poll while the work is actively generating outputs. Once any
      // terminal status lands (partial, completed, failed) we stop the timer
      // because the row won't progress without user action.
      return data.work.status === "generating" ? 2000 : false;
    },
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["creative-work", result.work.id] });
    },
  });
}

export function useGenerateCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) =>
      postJson<{ copy: SocialPostCopy }>(`/api/creative-work/${workItemId}/copy`),
    onSuccess: (_data, workItemId) => {
      queryClient.invalidateQueries({ queryKey: ["creative-work", workItemId] });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["creative-work", variables.workItemId] });
    },
  });
}

export function useTriggerTriplet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) =>
      postJson<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[] }>(
        `/api/creative-work/${workItemId}/generate`,
      ),
    onSuccess: (_data, workItemId) => {
      queryClient.invalidateQueries({ queryKey: ["creative-work", workItemId] });
    },
  });
}

export function useRetryOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, outputId }: { workItemId: string; outputId: string }) =>
      postJson<{ output: CreativeWorkOutput }>(
        `/api/creative-work/${workItemId}/outputs/${outputId}/retry`,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["creative-work", variables.workItemId] });
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
    }: {
      workItemId: string;
      outputId: string;
      saveToLibrary: boolean;
    }) =>
      postJson<{ output: CreativeWorkOutput }>(
        `/api/creative-work/${workItemId}/outputs/${outputId}/select`,
        { saveToLibrary },
      ),
    onSuccess: (_data, variables) => {
      // Saving the selected output materialises a new workspace asset. The
      // wizard must therefore invalidate both the work detail and the library.
      queryClient.invalidateQueries({ queryKey: ["creative-work", variables.workItemId] });
      queryClient.invalidateQueries({ queryKey: ["workspace-assets"] });
    },
  });
}

export function useDownloadOutputUrl() {
  return (workItemId: string, outputId: string) =>
    `/api/creative-work/${workItemId}/outputs/${outputId}/download`;
}