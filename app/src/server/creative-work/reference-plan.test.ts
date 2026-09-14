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
    it("uses the completed parent as the mandatory original without requiring a source upload", () => {
      const plan = planCreativeWorkReferences({
        mode: "format_adaptation", sources: [], identityReferenceAssets: [identity("mood")],
        revisionReferences: [
          { assetKey: "creative-work/parent.png", mimeType: "image/png", label: "Versão 1" },
          { assetKey: "extra.png", mimeType: "image/png", label: "Referência extra" },
        ],
        limit: LIMIT,
      });
      expect(plan.map(({ role, required, assetKey }) => ({ role, required, assetKey }))).toEqual([
        { role: "original", required: true, assetKey: "creative-work/parent.png" },
        { role: "revision", required: false, assetKey: "extra.png" },
        { role: "brand_identity", required: false, assetKey: "brand-training/mood.png" },
      ]);
    });

    it("preserves the parent instead of promoting an older source to original authority", () => {
      const plan = planCreativeWorkReferences({
        mode: "format_adaptation", sources: [source("older", "both")], identityReferenceAssets: [],
        revisionReferences: [
          { assetKey: "parent.png", mimeType: "image/png", label: "Versão 2" },
          { assetKey: "extra.png", mimeType: "image/png", label: "Extra" },
        ],
        limit: 1,
      });
      expect(plan).toEqual([{ role: "original", required: true, assetKey: "parent.png", mimeType: "image/png", label: "Versão 2" }]);
    });

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
    it("puts required temporary references before visual references and brand assets", () => {
      const plan = planCreativeWorkReferences({
        mode: "social_post",
        sources: [
          { ...source("product", "both"), pieceReference: { version: 1, category: "product_or_packaging", treatment: "recognizable_preservation", userInstruction: null, hasTransparency: false } },
          { ...source("style", "both"), pieceReference: { version: 1, category: "style_reference", treatment: "style_direction", userInstruction: "cores", hasTransparency: false } },
          { ...source("seal", "both"), pieceReference: { version: 1, category: "additional_logo_or_seal", treatment: "exact_application", userInstruction: null, hasTransparency: true } },
        ],
        identityReferenceAssets: [identity("brand")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.role)).toEqual(["piece_required", "piece_visual", "brand_identity"]);
    });

    it.each([
      ["social_post", "variations"],
      ["restyling", "restyle"],
      ["format_adaptation", "format_adaptation"],
    ] as const)("ignores stale Piece metadata for persisted %s work", (mode) => {
      const stalePiece = {
        ...source("stale-seal", mode === "restyling" ? "style" : mode === "social_post" ? "both" : "content"),
        pieceReference: {
          version: 1 as const,
          category: "additional_logo_or_seal" as const,
          treatment: "exact_application" as const,
          userInstruction: "no rodapé",
          hasTransparency: true,
        },
      };
      const sources = mode === "restyling"
        ? [source("content", "content"), stalePiece]
        : [stalePiece];
      const plan = planCreativeWorkReferences({
        mode,
        sources,
        identityReferenceAssets: [],
        limit: LIMIT,
        allowPieceReferences: false,
      });

      expect(plan.map((slot) => slot.role)).not.toContain("piece_required");
      expect(plan.map((slot) => slot.role)).not.toContain("piece_visual");
      expect(plan.map((slot) => slot.assetKey)).toContain("stale-seal.png");
    });

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

  describe("named people", () => {
    const personSlot = (label: string, assetKey: string) => ({
      role: "piece_required" as const,
      required: true,
      assetKey,
      mimeType: "image/jpeg",
      label,
      pieceReference: {
        category: "person_or_character" as const,
        treatment: "identity_preservation" as const,
        userInstruction: `Pessoa ${label}. Preservar identidade e anatomia.`,
      },
    });

    it("reserves person slots first and never evicts them for style", () => {
      const plan = planCreativeWorkReferences({
        mode: "art_variation",
        sources: [source("style", "style")],
        identityReferenceAssets: [identity("logo"), identity("mood"), identity("extra")],
        personSlots: [personSlot("Ana", "people/ana.png")],
        limit: LIMIT,
      });
      expect(plan.map((slot) => slot.role)).toEqual([
        "piece_required",
        "style",
        "brand_identity",
        "brand_identity",
      ]);
      expect(plan[0]).toMatchObject({ required: true, label: "Ana" });
    });

    it("fails before the provider when mandatory people exceed the cap", () => {
      expect(() =>
        planCreativeWorkReferences({
          mode: "format_adaptation",
          sources: [source("a", "content"), source("b", "content")],
          identityReferenceAssets: [],
          personSlots: [
            personSlot("Ana", "people/ana.png"),
            personSlot("Bia", "people/bia.png"),
            personSlot("Cid", "people/cid.png"),
          ],
          limit: LIMIT,
        }),
      ).toThrow(CreativeWorkReferenceError);
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

// ---------------------------------------------------------------------------
// Carousel slide reference plan (Task 6): anchor_board role, anchors vs
// non-anchors, provider cap of four, exact assets never sent to the provider.
// ---------------------------------------------------------------------------

import { planCarouselSlideReferences } from "./reference-plan";

describe("planCarouselSlideReferences", () => {
  const identity = [
    { assetKey: "brand-training/logo.png", mimeType: "image/png", label: "Logo" },
    { assetKey: "brand-training/mood.png", mimeType: "image/png", label: "Mood" },
  ];
  const temporary = { assetKey: "sources/temp-ref.png", mimeType: "image/png", label: "temp-ref.png" };

  it("gives anchor slides brand/style references only — never an anchor board", () => {
    const plan = planCarouselSlideReferences({
      isAnchor: true,
      anchorBoardKey: "creative-work/w1/carousel/board.png",
      identityReferenceAssets: identity,
      temporaryReference: temporary,
    });

    expect(plan.map((slot) => slot.role)).toEqual(["brand_identity", "brand_identity", "style"]);
    expect(plan.some((slot) => slot.role === "anchor_board")).toBe(false);
    expect(plan.every((slot) => !slot.required)).toBe(true);
  });

  it("puts the anchor board first for non-anchor slides, then brand/style", () => {
    const plan = planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "creative-work/w1/carousel/board.png",
      identityReferenceAssets: identity,
      temporaryReference: temporary,
    });

    expect(plan[0]).toMatchObject({
      role: "anchor_board",
      required: true,
      assetKey: "creative-work/w1/carousel/board.png",
      label: "Anchor board",
    });
    expect(plan.slice(1).map((slot) => slot.role)).toEqual(["brand_identity", "brand_identity", "style"]);
  });

  it("keeps the approved anchor board first for non-anchor slides", () => {
    const slots = planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "creative-work/work-1/anchor-board.png",
      identityReferenceAssets: [],
      temporaryReference: null,
      limit: 4,
    });
    expect(slots[0]).toMatchObject({ role: "anchor_board", required: true, assetKey: "creative-work/work-1/anchor-board.png" });
    expect(slots).toHaveLength(1);
  });

  it("fails as reference_failure when a non-anchor slide has no anchor board key", () => {
    expect(() => planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: null,
      identityReferenceAssets: [],
      temporaryReference: null,
    })).toThrow(CreativeWorkReferenceError);
    try {
      planCarouselSlideReferences({
        isAnchor: false,
        anchorBoardKey: null,
        identityReferenceAssets: [],
        temporaryReference: null,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as CreativeWorkReferenceError).code).toBe("reference_failure");
    }
  });

  it("keeps the total provider references within four", () => {
    const manyIdentity = Array.from({ length: 6 }, (_, i) => ({
      assetKey: `brand-training/asset-${i}.png`,
      mimeType: "image/png",
      label: `asset-${i}`,
    }));
    const plan = planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "board.png",
      identityReferenceAssets: manyIdentity,
      temporaryReference: temporary,
    });
    expect(plan).toHaveLength(4);
    expect(plan[0]?.role).toBe("anchor_board");
  });

  it("never sends exact brand assets as provider references", () => {
    const plan = planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "board.png",
      identityReferenceAssets: identity,
      temporaryReference: null,
    });
    // Exact-asset keys (logo used for post-composition) are not among the slots.
    expect(plan.every((slot) => slot.role !== "piece_required")).toBe(true);
    expect(plan.filter((slot) => slot.role === "anchor_board")).toHaveLength(1);
  });

  it("keeps the person photo next to the anchor board on non-anchor slides", () => {
    const plan = planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "board.png",
      identityReferenceAssets: identity,
      temporaryReference: temporary,
      personSlots: [{
        role: "piece_required",
        required: true,
        assetKey: "people/ana.png",
        mimeType: "image/jpeg",
        label: "Ana",
      }],
    });
    expect(plan.map((slot) => slot.role)).toEqual([
      "anchor_board",
      "piece_required",
      "brand_identity",
      "brand_identity",
    ]);
    expect(plan[1]).toMatchObject({ required: true, label: "Ana" });
  });

  it("fails when slide people exceed the cap instead of dropping identity", () => {
    const personSlots = ["ana", "bia", "cid", "dan"].map((name) => ({
      role: "piece_required" as const,
      required: true,
      assetKey: `people/${name}.png`,
      mimeType: "image/jpeg",
      label: name,
    }));
    expect(() => planCarouselSlideReferences({
      isAnchor: false,
      anchorBoardKey: "board.png",
      identityReferenceAssets: [],
      temporaryReference: null,
      personSlots,
    })).toThrow(CreativeWorkReferenceError);
  });
});
