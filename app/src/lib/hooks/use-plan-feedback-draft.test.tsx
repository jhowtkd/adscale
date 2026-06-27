import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePlanFeedbackDraft } from "./use-plan-feedback-draft";

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

describe("usePlanFeedbackDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation(async (url, init) => {
      if (typeof url === "string" && url.endsWith("/plan-revisions") && !init) {
        return {
          ok: true,
          json: () => Promise.resolve({ draftText: "saved draft" }),
        } as Response;
      }
      if (
        typeof url === "string" &&
        url.endsWith("/plan-revisions") &&
        init?.method === "PUT"
      ) {
        const body = JSON.parse(String(init.body)) as { draftText: string };
        return {
          ok: true,
          json: () => Promise.resolve({ draftText: body.draftText }),
        } as Response;
      }
      return { ok: false, json: () => Promise.resolve({}) } as Response;
    });
  });

  it("loads server draft on mount for enabled campaign threads", async () => {
    const { result } = renderHook(
      () => usePlanFeedbackDraft("thread-1", { enabled: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.draftText).toBe("saved draft");
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads/thread-1/plan-revisions"
    );
  });

  it("debounces PUT when draft text changes", async () => {
    const { result } = renderHook(
      () => usePlanFeedbackDraft("thread-1", { enabled: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.draftText).toBe("saved draft");
    });

    act(() => {
      result.current.onDraftTextChange("new feedback");
    });

    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/api/assistant/threads/thread-1/plan-revisions",
      expect.objectContaining({ method: "PUT" })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/assistant/threads/thread-1/plan-revisions",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ draftText: "new feedback" }),
        })
      );
    });
  });

  it("clears draft with empty PUT", async () => {
    const { result } = renderHook(
      () => usePlanFeedbackDraft("thread-1", { enabled: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.draftText).toBe("saved draft");
    });

    await act(async () => {
      await result.current.clearDraft();
    });

    expect(result.current.draftText).toBe("");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/assistant/threads/thread-1/plan-revisions",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ draftText: "" }),
      })
    );
  });

  it("does not fetch when disabled", () => {
    renderHook(() => usePlanFeedbackDraft("thread-1", { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
