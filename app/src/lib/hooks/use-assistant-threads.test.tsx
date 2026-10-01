import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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
      headRevision: 0,
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

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(
      () => useAssistantThreads("profile-1", null, { enabled: false }),
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
        timeoutMs: 60_000,
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

// Ticket 08: the free diagnosis arrives from a background task, so the thread is polled while the
// persisted messages say one is pending (also after the person left and came back).
describe("useAssistantThread — polling while the diagnosis is pending", () => {
  const T0 = new Date("2026-10-01T12:00:00.000Z");
  const message = (id: string, type: string, payload: Record<string, unknown>, at = new Date()) => ({
    id, threadId: "thread-1", type, content: id, payload, sequence: Number(id.replace(/\D/g, "") || 1), createdAt: at.toISOString(),
  });
  const respond = (messages: unknown[]) => ({ ok: true, json: () => Promise.resolve({ thread: threadFixture, messages }) }) as unknown as Response;
  const pendingMessages = () => [message("m1", "assistant", { handoffStep: "done" }), message("m2", "equipe_event", { kind: "diagnosis.started" })];
  const cardMessages = () => [...pendingMessages(), message("m3", "equipe_card", { kind: "diagnosis", status: "ready" })];
  const calls = () => mockApiFetch.mock.calls.length;
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(T0);
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("asks again every 3 seconds while the messages wait for a diagnosis, and stops when the card arrives", async () => {
    mockApiFetch.mockResolvedValueOnce(respond(pendingMessages())).mockResolvedValueOnce(respond(pendingMessages())).mockResolvedValue(respond(cardMessages()));
    const { result } = renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    expect(result.current.data?.messages).toHaveLength(2);
    expect(calls()).toBe(1);

    await advance(2_999);
    expect(calls()).toBe(1);
    await advance(1);
    expect(calls()).toBe(2);
    await advance(3_000);
    expect(calls()).toBe(3);
    await advance(50);
    expect(result.current.data?.messages.at(-1)?.payload).toMatchObject({ kind: "diagnosis", status: "ready" });

    // the card is in: no more asking
    await advance(30_000);
    expect(calls()).toBe(3);
  });

  it("an error card (failed) also ends the polling", async () => {
    const failed = [...pendingMessages(), message("m3", "equipe_card", { kind: "diagnosis", status: "failed" })];
    mockApiFetch.mockResolvedValueOnce(respond(pendingMessages())).mockResolvedValue(respond(failed));
    renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    await advance(3_000);
    expect(calls()).toBe(2);
    await advance(30_000);
    expect(calls()).toBe(2);
  });

  it("never polls without pollWhileActive", async () => {
    mockApiFetch.mockResolvedValue(respond(pendingMessages()));
    renderHook(() => useAssistantThread("thread-1"), { wrapper: createWrapper() });
    await advance(0);
    await advance(60_000);
    expect(calls()).toBe(1);
  });

  it("does not poll a thread that has nothing pending", async () => {
    mockApiFetch.mockResolvedValue(respond([message("m1", "user", {})]));
    renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    await advance(60_000);
    expect(calls()).toBe(1);
  });

  it("keeps the 10 s polling for an active action card", async () => {
    mockApiFetch.mockResolvedValue(respond([message("m1", "action_card", { status: "pending" })]));
    renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    expect(calls()).toBe(1);
    await advance(9_999);
    expect(calls()).toBe(1);
    await advance(1);
    expect(calls()).toBe(2);
  });

  it("leaving and coming back with the diagnosis still pending polls again (the state is in the messages)", async () => {
    mockApiFetch.mockResolvedValue(respond(pendingMessages()));
    const first = renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    first.unmount();
    await advance(60_000); // nobody is watching: no requests
    const before = calls();

    // a new mount (a different query client: a fresh tab) fetches and keeps polling
    renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    expect(calls()).toBe(before + 1);
    await advance(3_000);
    expect(calls()).toBe(before + 2);
    await advance(3_000);
    expect(calls()).toBe(before + 3);
  });

  it("stops after the 15-minute window of an old marker", async () => {
    const old = new Date(T0.getTime() - 14 * 60_000 - 50_000);
    mockApiFetch.mockResolvedValue(respond([message("m1", "assistant", { handoffStep: "done" }, old)]));
    renderHook(() => useAssistantThread("thread-1", { pollWhileActive: true }), { wrapper: createWrapper() });
    await advance(0);
    await advance(3_000);
    expect(calls()).toBeGreaterThan(1); // still inside the window
    await advance(60_000); // the window closes (marker is now older than 15 min)
    const settled = calls();
    await advance(60_000);
    expect(calls()).toBe(settled);
  });
});
