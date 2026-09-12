import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard, useSharePieceReview } from "./use-piece-review-share";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);
const SHARE_URL = "https://app.example.com/share/tok";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when the clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyTextToClipboard(SHARE_URL)).resolves.toBe(false);
  });

  it("returns false when writeText rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await expect(copyTextToClipboard(SHARE_URL)).resolves.toBe(false);
  });

  it("returns true when writeText succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard(SHARE_URL)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
  });
});

describe("useSharePieceReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ shareUrl: SHARE_URL }),
    } as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still returns the share URL when clipboard write fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { result } = renderHook(() => useSharePieceReview(), { wrapper: createWrapper() });

    let payload: { shareUrl: string; copied: boolean } | undefined;
    await act(async () => {
      payload = await result.current.mutateAsync({ workId: "work-1", outputId: "output-1" });
    });

    expect(payload).toEqual({ shareUrl: SHARE_URL, copied: false });
    expect(result.current.isError).toBe(false);
  });

  it("marks copied when the clipboard write succeeds", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const { result } = renderHook(() => useSharePieceReview(), { wrapper: createWrapper() });

    let payload: { shareUrl: string; copied: boolean } | undefined;
    await act(async () => {
      payload = await result.current.mutateAsync({ workId: "work-1", outputId: "output-1" });
    });

    expect(payload).toEqual({ shareUrl: SHARE_URL, copied: true });
  });

  it("throws when the share API does not return a URL", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "nope" }),
    } as Response);
    const { result } = renderHook(() => useSharePieceReview(), { wrapper: createWrapper() });

    await expect(act(async () => {
      await result.current.mutateAsync({ workId: "work-1", outputId: "output-1" });
    })).rejects.toThrow("nope");
  });
});
