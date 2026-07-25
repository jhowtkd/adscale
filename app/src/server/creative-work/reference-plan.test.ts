import { describe, expect, it } from "vitest";
import {
  CreativeWorkReferenceError,
  planCreativeWorkReferences,
  type CreativeWorkReferencePlanSource,
} from "./reference-plan";

function source(
  sourceId: string,
  usage: "content" | "style" | "both",
  assetKey: string | null = `${sourceId}.png`,
): CreativeWorkReferencePlanSource {
  return { sourceId, usage, assetKey, mimeType: assetKey ? "image/png" : null };
}

function identity(label: string) {
  return { assetKey: `brand-training/${label}.png`, mimeType: "image/png", label };
}

const LIMIT = 4;

describe("planCreativeWorkReferences", () => {
  describe("format_adaptation", () => {
    it("puts the original art first and fills the rest with brand identity", () => {
      const plan = planCreativeWorkReferences({
        mode: "format_adaptation",
        sources: [source("original", "content")],
        identityReferenceAssets: [identity("logo"), identity("mood"), identity("extra"), identity("overflow")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => [slot.role, slot.label])).toEqual([
        ["original", "Original art"],
        ["brand_identity", "logo"],
        ["brand_identity", "mood"],
        ["brand_identity", "extra"],
      ]);
      expect(plan[0]).toMatchObject({ required: true, assetKey: "original.png" });
      // The provider cap evicted only the optional identity overflow.
      expect(plan.some((slot) => slot.label === "overflow")).toBe(false);
    });

    it("keeps every mandatory original inside the limit and drops optional identity first", () => {
      const plan = planCreativeWorkReferences({
        mode: "format_adaptation",
        sources: [source("a", "content"), source("b", "both"), source("c", "content")],
        identityReferenceAssets: [identity("logo"), identity("mood")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.role)).toEqual(["original", "original", "original", "brand_identity"]);
    });

    it("fails as reference_failure without a ready original — never falls back to plain generate", () => {
      expect(() => planCreativeWorkReferences({
        mode: "format_adaptation",
        sources: [],
        identityReferenceAssets: [identity("logo")],
        limit: LIMIT,
      })).toThrow(CreativeWorkReferenceError);
      expect(() => planCreativeWorkReferences({
        mode: "format_adaptation",
        // Source frozen without an asset key (cross-workspace / deleted asset).
        sources: [source("original", "content", null)],
        identityReferenceAssets: [identity("logo")],
        limit: LIMIT,
      })).toThrow(CreativeWorkReferenceError);
      try {
        planCreativeWorkReferences({
          mode: "format_adaptation",
          sources: [],
          identityReferenceAssets: [],
          limit: LIMIT,
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CreativeWorkReferenceError);
        expect((error as CreativeWorkReferenceError).code).toBe("reference_failure");
      }
    });
  });

  describe("restyling", () => {
    it("sends content first, style second, then brand identity up to the limit", () => {
      const plan = planCreativeWorkReferences({
        mode: "restyling",
        sources: [source("style-a", "style"), source("content-a", "content")],
        identityReferenceAssets: [identity("logo"), identity("mood"), identity("overflow")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => [slot.role, slot.label])).toEqual([
        ["content", "Content source"],
        ["style", "Style source"],
        ["brand_identity", "logo"],
        ["brand_identity", "mood"],
      ]);
      expect(plan.filter((slot) => slot.required)).toHaveLength(2);
    });

    it("never evicts a mandatory source to make room for optional identity", () => {
      const plan = planCreativeWorkReferences({
        mode: "restyling",
        sources: [source("content-a", "content"), source("content-b", "both"), source("style-a", "style")],
        identityReferenceAssets: [identity("logo"), identity("mood"), identity("extra")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.role)).toEqual(["content", "content", "style", "brand_identity"]);
      expect(plan.filter((slot) => slot.role === "brand_identity")).toHaveLength(1);
    });

    it("fails as reference_failure when the restyle combination is visually incomplete", () => {
      // Style role without a ready visual asset (cross-workspace / template only).
      expect(() => planCreativeWorkReferences({
        mode: "restyling",
        sources: [source("content-a", "content"), source("style-a", "style", null)],
        identityReferenceAssets: [],
        limit: LIMIT,
      })).toThrow(CreativeWorkReferenceError);
      // No content role at all.
      expect(() => planCreativeWorkReferences({
        mode: "restyling",
        sources: [source("style-a", "style")],
        identityReferenceAssets: [],
        limit: LIMIT,
      })).toThrow(CreativeWorkReferenceError);
    });

    it("fails when mandatory references exceed the provider limit", () => {
      expect(() => planCreativeWorkReferences({
        mode: "restyling",
        sources: [
          source("c1", "content"), source("c2", "content"), source("c3", "content"),
          source("s1", "style"), source("s2", "style"),
        ],
        identityReferenceAssets: [],
        limit: LIMIT,
      })).toThrow(CreativeWorkReferenceError);
    });
  });

  describe("social_post / art_variation", () => {
    it("keeps content-only sources textual and orders optional sources before identity", () => {
      const plan = planCreativeWorkReferences({
        mode: "social_post",
        sources: [source("content-a", "content"), source("style-a", "style"), source("both-a", "both")],
        identityReferenceAssets: [identity("logo"), identity("mood")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.label)).toEqual([
        "Style source", "Style source", "logo", "mood",
      ]);
      expect(plan.every((slot) => !slot.required)).toBe(true);
    });
  });

  describe("creative_revision", () => {
    it("keeps the completed parent as the first reference", () => {
      const plan = planCreativeWorkReferences({
        mode: "creative_revision",
        sources: [source("style-a", "style")],
        identityReferenceAssets: [identity("logo"), identity("mood")],
        revisionReferences: [{ assetKey: "creative-work/output-v1/original.png", mimeType: "image/png", label: "Versão 1" }],
        limit: LIMIT,
      });
      expect(plan[0]).toMatchObject({ role: "revision", required: true, label: "Versão 1" });
      expect(plan.map((slot) => slot.role)).toEqual(["revision", "style", "brand_identity", "brand_identity"]);
    });
  });

  describe("source labels", () => {
    it("uses the frozen display name when the snapshot carries one", () => {
      const plan = planCreativeWorkReferences({
        mode: "restyling",
        sources: [
          { ...source("content-a", "content"), label: "arte-black-friday.png" },
          { ...source("style-a", "style"), label: "editorial-museu.png" },
        ],
        identityReferenceAssets: [],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.label)).toEqual(["arte-black-friday.png", "editorial-museu.png"]);
    });

    it("falls back to a role label — never the raw internal source id", () => {
      const plan = planCreativeWorkReferences({
        mode: "format_adaptation",
        sources: [source("9f3c1d2e-internal-uuid", "content")],
        identityReferenceAssets: [],
        limit: LIMIT,
      });
      expect(plan[0]?.label).toBe("Original art");
      expect(plan[0]?.label).not.toContain("9f3c1d2e");
    });
  });

  describe("CreativeWorkReferenceError", () => {
    it("chains the underlying storage cause for diagnosis", () => {
      const cause = new Error("R2 NoSuchKey");
      const error = new CreativeWorkReferenceError('original reference "Original art" could not be loaded', { cause });
      expect(error).toBeInstanceOf(CreativeWorkReferenceError);
      expect(error.code).toBe("reference_failure");
      expect(error.cause).toBe(cause);
    });
  });
});
