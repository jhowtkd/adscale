import { apiFetch } from "@/lib/api-client";
import {
  artifactPromotionConflictSchema,
  artifactPromotionResultSchema,
  artifactVersionComparisonSchema,
  comparisonAcknowledgementSchema,
  type ArtifactPromotionCommand,
  type ComparisonAcknowledgementCommand,
} from "@/lib/assistant/artifact-version";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { assistantThreadQueryKey } from "./use-assistant-threads";

export class ArtifactPromotionConflictError extends Error {
  constructor(
    public readonly recovery: ReturnType<
      typeof artifactPromotionConflictSchema.parse
    >
  ) {
    super(recovery.message);
    this.name = "ArtifactPromotionConflictError";
  }
}

export function assistantArtifactVersionsQueryKey(threadId: string) {
  return [...assistantThreadQueryKey(threadId), "artifact-versions"] as const;
}

export function assistantArtifactComparisonQueryKey(input: {
  threadId: string;
  lineageId: string;
  versionAId: string;
  versionBId: string;
  includeUnchanged?: boolean;
}) {
  return [
    ...assistantArtifactVersionsQueryKey(input.threadId),
    "compare",
    input.lineageId,
    input.versionAId,
    input.versionBId,
    input.includeUnchanged ?? false,
  ] as const;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return new Error(
    typeof body.message === "string"
      ? body.message
      : typeof body.error === "string"
        ? body.error
        : fallback
  );
}

export function useAssistantArtifactComparison(input: {
  threadId: string | null;
  lineageId: string | null;
  versionAId: string | null;
  versionBId: string | null;
  includeUnchanged?: boolean;
}) {
  const validPair = Boolean(
    input.threadId &&
      input.lineageId &&
      input.versionAId &&
      input.versionBId &&
      input.versionAId !== input.versionBId
  );

  return useQuery({
    queryKey: validPair
      ? assistantArtifactComparisonQueryKey(input as {
          threadId: string;
          lineageId: string;
          versionAId: string;
          versionBId: string;
          includeUnchanged?: boolean;
        })
      : [...assistantArtifactVersionsQueryKey(input.threadId ?? "disabled"), "compare", "disabled"],
    enabled: validPair,
    queryFn: async () => {
      const response = await apiFetch(
        `/api/assistant/threads/${input.threadId}/artifact-versions/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineageId: input.lineageId,
            versionAId: input.versionAId,
            versionBId: input.versionBId,
            ...(input.includeUnchanged ? { includeUnchanged: true } : {}),
          }),
        }
      );
      if (!response.ok) throw await responseError(response, "Erro ao comparar versões");
      return artifactVersionComparisonSchema.parse(await response.json());
    },
  });
}

export function useAcknowledgeLinkedPlanComparison(threadId: string) {
  return useMutation({
    mutationFn: async (command: ComparisonAcknowledgementCommand) => {
      const response = await apiFetch(
        `/api/assistant/threads/${threadId}/artifact-versions/comparison-acknowledgements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      );
      if (!response.ok) {
        throw await responseError(response, "Erro ao registrar comparação");
      }
      return comparisonAcknowledgementSchema.parse(await response.json());
    },
    retry: false,
  });
}

export function usePromoteAssistantArtifactVersion(threadId: string) {
  const queryClient = useQueryClient();
  const invalidateCanonicalState = () => {
    void queryClient.invalidateQueries({
      queryKey: assistantThreadQueryKey(threadId),
    });
    void queryClient.invalidateQueries({
      queryKey: assistantArtifactVersionsQueryKey(threadId),
    });
  };

  return useMutation({
    mutationFn: async (command: ArtifactPromotionCommand) => {
      const response = await apiFetch(
        `/api/assistant/threads/${threadId}/artifact-versions/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        throw new ArtifactPromotionConflictError(
          artifactPromotionConflictSchema.parse(body)
        );
      }
      if (!response.ok) {
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : "Erro ao atualizar versão oficial"
        );
      }
      return artifactPromotionResultSchema.parse(body);
    },
    retry: false,
    onSuccess: invalidateCanonicalState,
    onError: (error) => {
      if (error instanceof ArtifactPromotionConflictError) {
        invalidateCanonicalState();
      }
    },
  });
}
