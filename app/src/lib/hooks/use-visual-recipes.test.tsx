import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";
import { useVisualRecipes } from "./use-visual-recipes";

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useVisualRecipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only the requested brand recipes", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ recipes: [{ id: "recipe-1", document: { fields: { headline: "Turma" } } }] }),
    } as Response);

    const { result } = renderHook(() => useVisualRecipes("brand 1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([
      { id: "recipe-1", document: { fields: { headline: "Turma" } } },
    ]));
    expect(apiFetch).toHaveBeenCalledWith("/api/creative-work?view=recipes&clientProfileId=brand%201&limit=24");
  });

  it("stays disabled without an active brand", () => {
    renderHook(() => useVisualRecipes(null), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
