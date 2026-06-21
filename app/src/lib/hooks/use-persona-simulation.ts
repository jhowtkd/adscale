import { apiFetch } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export interface PersonaResult {
  understands: string;
  rejects: string;
  wants: string;
  wouldClick: boolean;
  rationale: string;
}

export interface PersonaSimulationResults {
  skeptical_buyer: PersonaResult;
  warm_lead: PersonaResult;
  financial_decision_maker: PersonaResult;
  beginner: PersonaResult;
}

export interface PersonaSimulation {
  id: string;
  sourceType: "derivation" | "landing_page";
  sourceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaSimulationResponse {
  simulation: PersonaSimulation;
  results: PersonaSimulationResults;
  cached?: boolean;
  stale?: boolean;
}

async function fetchPersonaSimulation(
  sourceType: "derivation" | "landing_page",
  sourceId: string
): Promise<PersonaSimulationResponse | null> {
  const res = await apiFetch(
    `/api/creatives/${sourceId}/persona-simulation?sourceType=${sourceType}`
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load persona analysis");
  }
  return res.json();
}

export function usePersonaSimulation(
  sourceType: "derivation" | "landing_page",
  sourceId: string | null
) {
  return useQuery({
    queryKey: ["persona-simulation", sourceType, sourceId],
    queryFn: () => fetchPersonaSimulation(sourceType, sourceId!),
    enabled: !!sourceId,
  });
}

export function useCreatePersonaSimulation() {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation<
    PersonaSimulationResponse,
    Error,
    { sourceType: "derivation" | "landing_page"; sourceId: string }
  >({
    mutationFn: async ({ sourceType, sourceId }) => {
      const res = await apiFetch(`/api/creatives/${sourceId}/persona-simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("personaSimulationFailed"));
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      addToast("success", t("personaSimulationComplete"));
      queryClient.invalidateQueries({
        queryKey: ["persona-simulation", variables.sourceType, variables.sourceId],
      });
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("personaSimulationFailed")
      );
    },
  });
}
