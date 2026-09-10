import { describe, expect, it } from "vitest";
import { resolveCreativeWorkProtocol } from "./protocol";

describe("resolveCreativeWorkProtocol", () => {
  it.each(["refine", "variation", "format"] as const)("resolves a reviewed %s without changing the work protocol", (revisionAction) => {
    expect(resolveCreativeWorkProtocol({
      toolKind: "single", format: "9:16", targetFormats: [], revision: true, revisionAction,
    })).toEqual({
      mode: revisionAction === "format" ? "format_adaptation" : "creative_revision",
      execution: "direct",
      plans: [{ creativeLevel: "balanced", targetFormat: "9:16", versionNumber: 1 }],
    });
  });

  it("resolves Peça única (single) as one direct high-quality social_post output", () => {
    expect(
      resolveCreativeWorkProtocol({
        toolKind: "single",
        format: "4:5",
        targetFormats: [],
      }),
    ).toEqual({
      mode: "social_post",
      execution: "direct",
      plans: [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }],
    });
  });

  it("resolves Variações as exactly three direct art_variation outputs with distinct levels", () => {
    const resolution = resolveCreativeWorkProtocol({
      toolKind: "variations",
      format: "1:1",
      targetFormats: [],
    });
    expect(resolution.mode).toBe("art_variation");
    expect(resolution.execution).toBe("direct");
    expect(resolution.plans).toEqual([
      { creativeLevel: "conservative", targetFormat: "1:1", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "1:1", versionNumber: 1 },
      { creativeLevel: "bold", targetFormat: "1:1", versionNumber: 1 },
    ]);
  });

  it("resolves Adaptar formatos as one direct format_adaptation output per target format", () => {
    expect(
      resolveCreativeWorkProtocol({
        toolKind: "format_adaptation",
        format: "4:5",
        targetFormats: ["1:1", "9:16"],
      }),
    ).toEqual({
      mode: "format_adaptation",
      execution: "direct",
      plans: [
        { creativeLevel: "balanced", targetFormat: "1:1", versionNumber: 1 },
        { creativeLevel: "balanced", targetFormat: "9:16", versionNumber: 1 },
      ],
    });
  });

  it("resolves Mudar estilo (restyle) as one direct restyling output", () => {
    expect(
      resolveCreativeWorkProtocol({
        toolKind: "restyle",
        format: "9:16",
        targetFormats: [],
      }),
    ).toEqual({
      mode: "restyling",
      execution: "direct",
      plans: [{ creativeLevel: "balanced", targetFormat: "9:16", versionNumber: 1 }],
    });
  });

  it("resolves a revision as one direct creative_revision linked to the parent", () => {
    const resolution = resolveCreativeWorkProtocol({
      toolKind: "variations",
      format: "4:5",
      targetFormats: [],
      revision: true,
    });
    expect(resolution.mode).toBe("creative_revision");
    expect(resolution.execution).toBe("direct");
    expect(resolution.plans).toHaveLength(1);
  });

  it("keeps the explicit legacy social_post toolKind on the legacy tournament adapter", () => {
    // Legacy Criar Post is NOT Peça única: it keeps its current behavior
    // (three level plans + route planner/judge) until its own migration.
    const resolution = resolveCreativeWorkProtocol({
      toolKind: "social_post",
      format: "4:5",
      targetFormats: [],
    });
    expect(resolution.mode).toBe("social_post");
    expect(resolution.execution).toBe("legacy_tournament");
    expect(resolution.plans).toEqual([
      { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
    ]);
  });

  it("resolves a revision of the legacy social_post toolKind as direct creative_revision", () => {
    const resolution = resolveCreativeWorkProtocol({
      toolKind: "social_post",
      format: "4:5",
      targetFormats: [],
      revision: true,
    });
    expect(resolution.mode).toBe("creative_revision");
    expect(resolution.execution).toBe("direct");
    expect(resolution.plans).toHaveLength(1);
  });

  it("refuses to resolve a carousel toolKind because the deck quotes itself", () => {
    expect(() => resolveCreativeWorkProtocol({ toolKind: "carousel", format: "4:5", targetFormats: [] }))
      .toThrow("carousel_requires_deck_quote");
  });
});
