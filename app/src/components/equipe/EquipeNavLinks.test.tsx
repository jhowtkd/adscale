import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useEquipeNavLinks } from "./EquipeNavLinks";
import { apiFetch } from "@/lib/api-client";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `navigation.${key}`,
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(apiFetch);

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function renderLinks() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useEquipeNavLinks(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useEquipeNavLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the three client destinations for pilot workspaces", async () => {
    mockedFetch.mockResolvedValueOnce(json({ accounts: [] }));
    const { result } = renderLinks();
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current!.map((link) => link.href)).toEqual(["/pipeline", "/ideas", "/goals"]);
    expect(result.current![0]!.label).toBe("navigation.pipeline");
  });

  it("hides every link when the workspace is not in the pilot", async () => {
    mockedFetch.mockResolvedValueOnce(json({ error: "x" }, 404));
    const { result } = renderLinks();
    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalled();
    });
    // The 404 settles the query as an error: still null after loading.
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});
