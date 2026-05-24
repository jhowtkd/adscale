import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CopyVariant {
  id: string;
  derivationId: string;
  workspaceId: string;
  headline: string;
  ctaText: string | null;
  toneLabel: string | null;
  confidenceScore: number | null;
  isSelected: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useCopyVariants(derivationId: string) {
  return useQuery<{ variants: CopyVariant[] }>({
    queryKey: ["copy-variants", derivationId],
    queryFn: async () => {
      const res = await apiFetch(`/api/derivations/${derivationId}/copy-variants`);
      if (!res.ok) throw new Error("Failed to load copy variants");
      return res.json();
    },
    enabled: Boolean(derivationId),
  });
}

export function useGenerateCopyVariants(derivationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: { count?: number; tones?: string[]; platform?: string } = {}) => {
      const res = await apiFetch(`/api/derivations/${derivationId}/copy-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate copy variants");
      }
      return res.json() as Promise<{ variants: CopyVariant[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy-variants", derivationId] });
    },
  });
}

export function useSelectCopyVariant(derivationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ variantId, isSelected }: { variantId: string; isSelected: boolean }) => {
      const res = await apiFetch(`/api/derivations/${derivationId}/copy-variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSelected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to select copy variant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy-variants", derivationId] });
    },
  });
}
