import { describe, expect, it } from "vitest";
import { resolveWorkspaceProduceSurface } from "./resolve-workspace-produce-surface";

describe("resolveWorkspaceProduceSurface", () => {
  it("computes credit estimate from campaign recipe fields", () => {
    const surface = resolveWorkspaceProduceSurface({
      campaign: {
        generationMode: "art_variation",
        creativeLevel: "balanced",
        ctaVariants: ["Compre agora", "Saiba mais"],
        targetFormats: null,
      },
      derivations: [],
    });

    expect(surface.batchCreditEstimate).toBeGreaterThan(0);
    expect(surface.batchCreditBreakdown?.unitCost).toBe(5);
    expect(surface.showPreviewGate).toBe(false);
    expect(surface.shouldAutoContinuePreview).toBe(false);
  });

  it("flags auto-continue for acceptable ready preview", () => {
    const surface = resolveWorkspaceProduceSurface({
      campaign: { generationMode: "art_variation" },
      derivations: [
        {
          id: "p1",
          isPreview: true,
          status: "completed",
          outputKey: "k.png",
          qualityVerdict: "acceptable",
          hardFailures: null,
        } as never,
      ],
    });

    expect(surface.shouldAutoContinuePreview).toBe(true);
    expect(surface.showPreviewGate).toBe(false);
  });
});
