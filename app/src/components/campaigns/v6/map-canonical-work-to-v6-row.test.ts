import { describe, expect, it } from "vitest";
import { mapCanonicalWorkToV6Row } from "./map-canonical-work-to-v6-row";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

const base: CanonicalWorkSummary = {
  id: "creative_work:w1",
  originKind: "creative_work",
  originId: "w1",
  origin: "quick_tool",
  workspaceId: "ws",
  clientProfileId: "client-1",
  name: "Post social",
  state: "generating",
  updatedAt: "2026-07-13T12:00:00.000Z",
  resumable: true,
  resumeHref: "/creative-work/w1",
  brandName: "Marca Aurora",
  protocol: "variations",
  nextAction: "review",
  resultCount: 2,
  previewHref: "/api/creative-work/w1/outputs/o1/download",
  previewAlt: "Peça da Marca Aurora",
};

describe("mapCanonicalWorkToV6Row", () => {
  it("maps create-post resumeHref and origin without campaign bulk payload", () => {
    const row = mapCanonicalWorkToV6Row({
      work: base,
      originLabel: "Post",
      formatUpdated: () => "1h",
      tState: (s) => s,
    });
    expect(row.href).toBe("/creative-work/w1");
    expect(row.originKind).toBe("creative_work");
    expect(row.campaign).toBeUndefined();
    expect(row.originLabel).toBe("Post");
    expect(row).toMatchObject({
      brandName: "Marca Aurora",
      protocol: "variations",
      nextAction: "review",
      resultCount: 2,
      previewHref: "/api/creative-work/w1/outputs/o1/download",
      previewAlt: "Peça da Marca Aurora",
    });
  });

  it("keeps canonical result counts when campaign metadata is missing", () => {
    const row = mapCanonicalWorkToV6Row({
      work: {
        ...base,
        id: "campaign:c1",
        originKind: "campaign",
        originId: "c1",
        origin: "campaign",
        resumeHref: "/campaigns/c1",
        name: "BF",
        state: "briefing",
        resultCount: 4,
      },
      originLabel: "Campanha",
      formatUpdated: () => "1h",
      tState: (s) => s,
    });
    expect(row.id).toBe("c1");
    expect(row.href).toBe("/campaigns/c1");
    expect(row.campaign?.id).toBe("c1");
    expect(row.campaign?.name).toBe("BF");
    expect(row.variations).toBe(4);
    expect(row.resultCount).toBe(4);
  });

  it("prefers enriched campaign metadata when provided", () => {
    const row = mapCanonicalWorkToV6Row({
      work: {
        ...base,
        id: "campaign:c1",
        originKind: "campaign",
        originId: "c1",
        origin: "campaign",
        resumeHref: "/campaigns/c1",
        name: "BF",
        state: "briefing",
      },
      campaign: {
        id: "c1",
        name: "BF",
        workspaceId: "ws",
        platforms: [],
        generationMode: "art_variation",
        status: "draft",
        variations: 2,
        creditsUsed: 0,
        totalDerivations: 2,
        activeDerivations: 0,
        failedDerivations: 0,
        completedDerivations: 1,
        lastModified: new Date("2026-07-13T12:00:00.000Z"),
        createdAt: new Date("2026-07-13T12:00:00.000Z"),
      },
      originLabel: "Campanha",
      formatUpdated: () => "1h",
      tState: (s) => s,
    });
    expect(row.variations).toBe(2);
    expect(row.approved).toBe(1);
  });

  it("keeps failed work dangerous while generating work stays warning", () => {
    const mapState = (state: CanonicalWorkSummary["state"]) =>
      mapCanonicalWorkToV6Row({
        work: { ...base, state },
        originLabel: "Post",
        formatUpdated: () => "1h",
        tState: (value) => value,
      }).statusVariant;

    expect(mapState("failed")).toBe("danger");
    expect(mapState("generating")).toBe("warning");
  });
});
