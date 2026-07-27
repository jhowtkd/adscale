import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  hasPendingDerivationWork,
  useRestyleCampaign,
  type Derivation,
} from "./use-derivations";

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

describe("useRestyleCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          derivations: [
            {
              id: "derivation-1",
              campaignId: "camp-1",
              status: "queued",
              generationMode: "restyling",
            },
          ],
        }),
    } as unknown as Response);
  });

  it("posts styleAssetIds and styleIntensity to restyle endpoint", async () => {
    const { result } = renderHook(() => useRestyleCampaign("camp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      styleAssetIds: ["asset-1", "asset-2"],
      styleIntensity: "strong",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/campaigns/camp-1/restyle",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": expect.any(String),
        },
        body: JSON.stringify({
          styleAssetIds: ["asset-1", "asset-2"],
          styleIntensity: "strong",
        }),
      }
    );
  });

  it("returns derivations from successful response", async () => {
    const { result } = renderHook(() => useRestyleCampaign("camp-1"), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync({
      styleAssetIds: ["asset-1"],
    });

    expect(data).toHaveLength(1);
    expect(data[0].generationMode).toBe("restyling");
  });

  it("throws when the endpoint returns an error", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "missingBaseAsset" }),
    } as unknown as Response);

    const { result } = renderHook(() => useRestyleCampaign("camp-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ styleAssetIds: [] })
    ).rejects.toThrow("missingBaseAsset");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("Derivation dual-verdict types", () => {
  it("accepts olharVerdict and exportStatus on derivation payloads", () => {
    const derivation: Partial<Derivation> = {
      olharVerdict: {
        value: "quase",
        axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
        whatWorks: ["Clear focal figure"],
        whatBlocks: ["CTA competes with headline"],
        directionNote: "Simplify lower third.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T00:00:00.000Z",
      },
      exportStatus: {
        value: "ok",
        issues: [],
        setupIssues: [],
        evaluatedAt: "2026-06-19T00:00:00.000Z",
      },
    };

    expect(derivation.olharVerdict?.value).toBe("quase");
    expect(derivation.exportStatus?.value).toBe("ok");
  });
});

describe("hasPendingDerivationWork", () => {
  it("keeps polling completed previews until quality gating finishes", () => {
    const preview = {
      id: "preview-1",
      status: "completed",
      isPreview: true,
      scoreStatus: "computed",
      qualityGatedAt: null,
    } as unknown as Derivation;

    expect(hasPendingDerivationWork([preview])).toBe(true);
    expect(
      hasPendingDerivationWork([
        { ...preview, qualityGatedAt: new Date("2026-07-14T00:00:00Z") },
      ])
    ).toBe(false);
  });
});
