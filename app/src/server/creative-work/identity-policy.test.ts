import { describe, expect, it } from "vitest";
import {
  protocolIdentityContract,
  PUBLISHED_BRAND_KNOWLEDGE_PROTOCOLS,
  shouldBuildTypographyPlan,
  shouldIncludePublishedBrandKnowledge,
} from "./identity-policy";

describe("identity policy across protocols", () => {
  it("includes published brand knowledge only for single (flagged) and carousel", () => {
    expect(shouldIncludePublishedBrandKnowledge("carousel")).toBe(true);
    expect(shouldIncludePublishedBrandKnowledge("single", { brandCortexSinglePieceEnabled: "true" })).toBe(true);
    expect(shouldIncludePublishedBrandKnowledge("single", { brandCortexSinglePieceEnabled: "false" })).toBe(false);
    expect(shouldIncludePublishedBrandKnowledge("restyle", { brandCortexSinglePieceEnabled: "true" })).toBe(false);
    expect(shouldIncludePublishedBrandKnowledge("variations", { brandCortexSinglePieceEnabled: "true" })).toBe(false);
    expect(shouldIncludePublishedBrandKnowledge("format_adaptation", { brandCortexSinglePieceEnabled: "true" })).toBe(false);
  });

  it("builds a typography plan only for Peça única", () => {
    expect(shouldBuildTypographyPlan("single")).toBe(true);
    expect(shouldBuildTypographyPlan("carousel")).toBe(false);
    expect(shouldBuildTypographyPlan("restyle")).toBe(false);
  });

  it("keeps the restyle original as content and never grants other protocols published brand knowledge", () => {
    expect(protocolIdentityContract("restyle").restyleOriginalUsage).toBe("content");
    expect(protocolIdentityContract("variations").publishedBrandKnowledge).toBe("never");
    expect(protocolIdentityContract("format_adaptation").publishedBrandKnowledge).toBe("never");
    expect(protocolIdentityContract("carousel").publishedBrandKnowledge).toBe("always");
    expect(protocolIdentityContract("single").typographyPlan).toBe(true);
    expect(PUBLISHED_BRAND_KNOWLEDGE_PROTOCOLS).toEqual(["single", "carousel"]);
  });

  it("keeps the same brand restrictions when the same brand moves across formats and modes", () => {
    const single = protocolIdentityContract("single");
    const restyle = protocolIdentityContract("restyle");
    expect(single.typographyPlan).toBe(true);
    expect(restyle.typographyPlan).toBe(false);
    expect(restyle.publishedBrandKnowledge).toBe("never");
    expect(protocolIdentityContract("format_adaptation").publishedBrandKnowledge).toBe("never");
    expect(shouldIncludePublishedBrandKnowledge("carousel")).toBe(true);
    expect(shouldIncludePublishedBrandKnowledge("restyle", { brandCortexSinglePieceEnabled: "true" })).toBe(false);
  });
});
