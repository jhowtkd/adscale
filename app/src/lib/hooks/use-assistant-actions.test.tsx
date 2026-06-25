import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useConfirmAssistantAction,
  useCancelAssistantAction,
} from "./use-assistant-actions";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useConfirmAssistantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ action: { id: "action-1" } }),
    } as unknown as Response);
  });

  it("posts to confirm endpoint and invalidates thread query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConfirmAssistantAction(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      actionId: "action-1",
      threadId: "thread-1",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/actions/action-1/confirm",
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["assistant", "thread", "thread-1"],
    });
  });
});

describe("useCancelAssistantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ action: { id: "action-1" } }),
    } as unknown as Response);
  });

  it("posts to cancel endpoint and invalidates thread query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCancelAssistantAction(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      actionId: "action-1",
      threadId: "thread-1",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/actions/action-1/cancel",
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["assistant", "thread", "thread-1"],
    });
  });
});
