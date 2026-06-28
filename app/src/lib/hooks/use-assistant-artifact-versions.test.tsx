import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import {
  ArtifactPromotionConflictError,
  assistantArtifactVersionsQueryKey,
  useAcknowledgeLinkedPlanComparison,
  useAssistantArtifactComparison,
  usePromoteAssistantArtifactVersion,
} from "./use-assistant-artifact-versions";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);
const threadId = "thread-1";
const lineageId = "00000000-0000-4000-8000-000000000001";
const versionAId = "00000000-0000-4000-8000-000000000002";
const versionBId = "00000000-0000-4000-8000-000000000003";
const artifactId = "00000000-0000-4000-8000-000000000004";

function wrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } },
})) {
  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    },
  };
}

function version(id: string, versionNumber: number) {
  return {
    id,
    lineageId,
    versionNumber,
    sourceVersionId: null,
    status: "ready",
    snapshot: {
      type: "plan",
      strategy: "Estratégia",
      angles: [],
      hooks: [],
      ctas: [],
      constraints: null,
    },
    provenance: {
      origin: "native",
      originalArtifactId: artifactId,
      sourceVersionId: null,
      messageId: null,
      actionId: null,
      planVersionId: null,
      format: null,
      generationMode: null,
    },
    feedback: null,
    createdAt: "2026-06-28T12:00:00.000Z",
  };
}

const lineageState = {
  lineageId,
  artifactType: "plan",
  approvedCurrent: version(versionAId, 1),
  working: version(versionBId, 2),
  versions: [version(versionBId, 2), version(versionAId, 1)],
  pendingProposals: [],
  generationStatus: null,
};

describe("useAssistantArtifactComparison", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not request an incomplete or same-version pair", () => {
    const { Wrapper } = wrapper();
    renderHook(
      () =>
        useAssistantArtifactComparison({
          threadId,
          lineageId,
          versionAId,
          versionBId: versionAId,
        }),
      { wrapper: Wrapper }
    );

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("keys and fetches one valid scoped pair", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          type: "plan",
          headRevision: 2,
          versionA: {
            versionNumber: 1,
            status: "approved",
            createdAt: "2026-06-28T12:00:00.000Z",
            feedback: null,
          },
          versionB: {
            versionNumber: 2,
            status: "ready",
            createdAt: "2026-06-28T13:00:00.000Z",
            feedback: "Mais direto",
          },
          fields: [],
        }),
    } as unknown as Response);
    const { Wrapper, queryClient } = wrapper();
    const { result } = renderHook(
      () =>
        useAssistantArtifactComparison({
          threadId,
          lineageId,
          versionAId,
          versionBId,
        }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.versionA.createdAt).toBeInstanceOf(Date);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/assistant/threads/${threadId}/artifact-versions/compare`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lineageId, versionAId, versionBId }),
      })
    );
    expect(queryClient.getQueryCache().findAll({
      queryKey: [...assistantArtifactVersionsQueryKey(threadId), "compare", lineageId],
    })).toHaveLength(1);
  });
});

describe("artifact version mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses persisted comparison acknowledgements", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: "00000000-0000-4000-8000-000000000005",
        creativeTargetVersionId: versionBId,
        planLineageId: lineageId,
        linkedPlanVersionId: versionBId,
        comparedOfficialPlanVersionId: versionAId,
        expectedPlanRevision: 2,
        createdAt: "2026-06-28T14:00:00.000Z",
      }),
    } as unknown as Response);
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => useAcknowledgeLinkedPlanComparison(threadId),
      { wrapper: Wrapper }
    );

    const acknowledgement = await result.current.mutateAsync({
      creativeTargetVersionId: versionBId,
      planLineageId: lineageId,
      linkedPlanVersionId: versionBId,
      comparedOfficialPlanVersionId: versionAId,
      expectedPlanRevision: 2,
    });

    expect(acknowledgement.createdAt).toBeInstanceOf(Date);
  });

  it("surfaces one typed 409 without retry and invalidates canonical caches", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        error: "revisionConflict",
        message: "A versão oficial mudou enquanto você comparava.",
        previousOfficialLabel: "v1",
        currentOfficialLabel: "v2",
        state: [lineageState],
      }),
    } as unknown as Response);
    const { Wrapper, queryClient } = wrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => usePromoteAssistantArtifactVersion(threadId),
      { wrapper: Wrapper }
    );

    const command = {
      type: "creative" as const,
      operationId: "00000000-0000-4000-8000-000000000006",
      lineageId,
      targetVersionId: versionBId,
      expectedOfficialVersionId: versionAId,
      expectedRevision: 1,
      planTransition: {
        lineageId,
        targetVersionId: versionBId,
        expectedOfficialVersionId: versionAId,
        expectedRevision: 2,
        acknowledgementId: "00000000-0000-4000-8000-000000000005",
      },
    };

    await expect(result.current.mutateAsync(command)).rejects.toBeInstanceOf(
      ArtifactPromotionConflictError
    );

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/assistant/threads/${threadId}/artifact-versions/promote`,
      expect.objectContaining({ body: JSON.stringify(command) })
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["assistant", "thread", threadId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: assistantArtifactVersionsQueryKey(threadId),
      });
    });
  });
});
