import { describe, expect, it } from "vitest";
import { mapCanonicalWorkToV6Row } from "./map-canonical-work-to-v6-row";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

const base: CanonicalWorkSummary = {
  id: "creative_work:w1",
  originKind: "creative_work",
  originId: "w1",
  origin: "quick_tool",
  workspaceId: "ws",
  name: "Post social",
  state: "generating",
  updatedAt: "2026-07-13T12:00:00.000Z",
  resumable: true,
  resumeHref: "/quick-tools/create-post?workId=w1",
};

describe("mapCanonicalWorkToV6Row", () => {
  it("maps create-post resumeHref and origin without campaign bulk payload", () => {
    const row = mapCanonicalWorkToV6Row({
      work: base,
      originLabel: "Post",
      formatUpdated: () => "1h",
      tState: (s) => s,
    });
    expect(row.href).toBe("/quick-tools/create-post?workId=w1");
    expect(row.originKind).toBe("creative_work");
    expect(row.campaign).toBeUndefined();
    expect(row.originLabel).toBe("Post");
  });

  it("keeps campaign originId as row id for bulk actions", () => {
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
        status: "draft",
        variations: 2,
        totalDerivations: 2,
        completedDerivations: 0,
        lastModified: new Date("2026-07-13T12:00:00.000Z"),
      } as never,
      originLabel: "Campanha",
      formatUpdated: () => "1h",
      tState: (s) => s,
    });
    expect(row.id).toBe("c1");
    expect(row.href).toBe("/campaigns/c1");
    expect(row.campaign?.id).toBe("c1");
  });
});
