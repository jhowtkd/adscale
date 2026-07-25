import { describe, expect, it } from "vitest";
import type { ContentBrief } from "@/server/ai/image-analysis";
import { detectCreativeWorkBrandConflict } from "./brand-conflict";

function contentBrief(overrides: Partial<ContentBrief> = {}): ContentBrief {
  return {
    product: "Produto",
    offer: "",
    cta: { text: "Saiba mais", style: "botão" },
    brandElements: [],
    keyVisual: "pessoa",
    textContent: { headline: "Headline", bullets: [] },
    format: "4:5",
    ...overrides,
  };
}

/** Canonical XTB art: a broker ad whose explicit brand differs from the active one. */
const xtbArt = contentBrief({
  product: "Corretora XTB",
  brandElements: ["logo da XTB", "paleta azul e branco", "#0f62fe"],
  textContent: { headline: "Invista com a XTB", bullets: [] },
});

function source(
  sourceId: string,
  usage: "content" | "style" | "both",
  content: ContentBrief | null,
) {
  return { sourceId, usage, content };
}

describe("detectCreativeWorkBrandConflict", () => {
  it("detects the XTB conflict with exactly the two short choices", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", xtbArt)],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toEqual({
      detectedBrand: "XTB",
      activeBrand: "Cenbrap",
      sourceId: "source-content",
      choices: ["source", "active"],
    });
  });

  it("ignores style sources even when they name another brand", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-style", "style", xtbArt)],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("does not fire when the art's brand is the active brand", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "Consultoria Cenbrap",
        brandElements: ["logo Cenbrap"],
        textContent: { headline: "Cenbrap para você", bullets: [] },
      }))],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("treats containment either way as the same brand family", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "XTB Corretora de valores",
        brandElements: ["XTB Corretora"],
        textContent: { headline: "XTB Corretora para investir", bullets: [] },
      }))],
      activeBrandName: "XTB",
    });
    expect(conflict).toBeNull();
  });

  it("does not fire without an active brand to compare against", () => {
    expect(detectCreativeWorkBrandConflict({ sources: [source("s", "content", xtbArt)], activeBrandName: null })).toBeNull();
    expect(detectCreativeWorkBrandConflict({ sources: [source("s", "content", xtbArt)], activeBrandName: "  " })).toBeNull();
  });

  it("requires corroboration outside brandElements — a bare tagline never asks", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "Consultoria de investimentos",
        brandElements: ["Invista no futuro"],
        textContent: { headline: "Comece hoje", bullets: [] },
      }))],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("never corroborates a candidate as a substring of another word (XP is not inside 'experiência')", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "Curso de oratória",
        brandElements: ["logo XP"],
        textContent: { headline: "Aprenda com experiência", bullets: [] },
      }))],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("does not absorb a real conflict when the active brand merely contains the candidate (Nu vs Nutrifood)", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "Banco Nu",
        brandElements: ["logo Nu"],
        textContent: { headline: "Nu para todos", bullets: [] },
      }))],
      activeBrandName: "Nutrifood",
    });
    expect(conflict).toMatchObject({
      detectedBrand: "Nu",
      activeBrand: "Nutrifood",
      sourceId: "source-content",
    });
  });

  it("ignores artifact and color descriptions that are not names", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", contentBrief({
        product: "Curso de trading",
        brandElements: ["paleta azul e dourado", "tipografia bold", "#ffaa00", "selo oficial"],
        textContent: { headline: "Aprenda trading", bullets: [] },
      }))],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("treats several distinct explicit brands as ambiguity and proceeds with the active brand", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [
        source("source-a", "content", xtbArt),
        source("source-b", "both", contentBrief({
          product: "Banco Nu",
          brandElements: ["Nu logo"],
          textContent: { headline: "Nu para todos", bullets: [] },
        })),
      ],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });

  it("keeps a single conflict when two arts carry the same explicit brand", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [
        source("source-a", "content", xtbArt),
        source("source-b", "both", contentBrief({
          product: "XTB investimentos",
          brandElements: ["XTB"],
          textContent: { headline: "XTB", bullets: [] },
        })),
      ],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toMatchObject({ detectedBrand: "XTB", sourceId: "source-a" });
  });

  it("does not fire when the content analysis is absent", () => {
    const conflict = detectCreativeWorkBrandConflict({
      sources: [source("source-content", "content", null)],
      activeBrandName: "Cenbrap",
    });
    expect(conflict).toBeNull();
  });
});
