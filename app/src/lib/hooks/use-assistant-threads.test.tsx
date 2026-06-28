import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAssistantThreads,
  useAssistantThread,
  useCreateAssistantThread,
} from "./use-assistant-threads";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const threadFixture = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  campaignId: null,
  name: "Cliente",
  isDefault: false,
  migratedFromThreadId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const versionId = "00000000-0000-4000-8000-000000000001";
const lineageId = "00000000-0000-4000-8000-000000000002";
const artifactId = "00000000-0000-4000-8000-000000000003";

const artifactVersionStateFixture = {
  lineages: [
    {
      lineageId,
      artifactType: "plan",
      approvedCurrent: {
        id: versionId,
        lineageId,
        versionNumber: 1,
        sourceVersionId: null,
        status: "approved",
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
      },
      working: null,
      versions: [],
      pendingProposals: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          lineageId,
          sourceVersionId: versionId,
          proposalType: "plan_revision",
          status: "pending",
          feedback: "Mais direto",
          payload: {
            type: "plan_revision",
            schemaVersion: 1,
            summary: "Encurtar",
            proposedSnapshot: {
              type: "plan",
              strategy: "Direta",
              angles: [],
              hooks: [],
              ctas: [],
              constraints: null,
            },
            changes: [{ field: "strategy", description: "Encurtar" }],
            writes: ["Nova versão"],
          },
          createdAt: "2026-06-28T12:01:00.000Z",
          updatedAt: "2026-06-28T12:02:00.000Z",
        },
      ],
      generationStatus: null,
    },
  ],
};

describe("useAssistantThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ threads: [threadFixture] }),
    } as unknown as Response);
  });

  it("fetches threads with clientProfileId query param", async () => {
    const { result } = renderHook(
      () => useAssistantThreads("profile-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads?clientProfileId=profile-1"
    );
  });

  it("includes campaignId when filtering by campaign", async () => {
    const { result } = renderHook(
      () => useAssistantThreads("profile-1", "camp-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads?clientProfileId=profile-1&campaignId=camp-1"
    );
  });

  it("uses null sentinel for client-level threads", async () => {
    const { result } = renderHook(
      () => useAssistantThreads("profile-1", null),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads?clientProfileId=profile-1&campaignId=null"
    );
  });

  it("does not fetch when clientProfileId is null", () => {
    const { result } = renderHook(
      () => useAssistantThreads(null),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useAssistantThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          thread: threadFixture,
          messages: [
            {
              id: "msg-1",
              threadId: "thread-1",
              type: "user",
              content: "Hello",
              payload: {},
              sequence: 1,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
    } as unknown as Response);
  });

  it("fetches thread detail with messages", async () => {
    const { result } = renderHook(
      () => useAssistantThread("thread-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data?.thread.id).toBe("thread-1");
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads/thread-1"
    );
    expect(result.current.data?.messages).toHaveLength(1);
  });

  it("preserves version state and coerces nested timestamps", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          thread: threadFixture,
          messages: [],
          artifactVersionState: artifactVersionStateFixture,
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useAssistantThread("thread-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.artifactVersionState?.lineages).toHaveLength(1);
    });

    const lineage = result.current.data!.artifactVersionState!.lineages[0]!;
    expect(lineage.approvedCurrent?.createdAt).toBeInstanceOf(Date);
    expect(lineage.pendingProposals[0]?.createdAt).toBeInstanceOf(Date);
    expect(lineage.pendingProposals[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it("does not fetch when threadId is null", () => {
    const { result } = renderHook(
      () => useAssistantThread(null),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useCreateAssistantThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ thread: threadFixture }),
    } as unknown as Response);
  });

  it("posts thread body and invalidates assistant thread lists", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useCreateAssistantThread(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync({
      clientProfileId: "profile-1",
      campaignId: "camp-1",
      isDefault: true,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          clientProfileId: "profile-1",
          campaignId: "camp-1",
          isDefault: true,
        }),
      })
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["assistant", "threads"],
    });
  });
});
