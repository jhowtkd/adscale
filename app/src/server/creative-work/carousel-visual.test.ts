import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type {
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import type { BrandFontAsset } from "../brand-training/font-assets";
import type { CarouselVisualContractV1 } from "./carousel-contracts";
import type {
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
} from "./contracts";

const createCompletionMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create: createCompletionMock } } }),
}));
vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "test-model" },
}));

import {
  buildCarouselAnchorBoard,
  buildCarouselContactSheet,
  buildCarouselSlideVisualOrientation,
  buildCarouselVisualContract,
  resolveCarouselSlideDirection,
  reviewCarouselSet,
} from "./carousel-visual";

function identitySnapshot(
  overrides: Partial<CreativeWorkIdentitySnapshot> = {}
): CreativeWorkIdentitySnapshot {
  return {
    clientProfileId: "profile-1",
    confirmedAt: "2026-08-30T12:00:00.000Z",
    assets: [],
    brandKit: {
      colors: ["#112233", "#AABBCC"],
      fonts: [],
      fontAssets: [],
      toneOfVoice: null,
      prohibitedElements: "Sem clipart; Sem promessas de cura",
      requiredElements: null,
    },
    ...overrides,
  };
}

function fontAsset(assetKey: string, family: string): BrandFontAsset {
  return {
    assetKey,
    family,
    source: "Brand book",
    weight: 400,
    style: "normal",
    sha256: assetKey,
    approvedAt: "2026-08-01T00:00:00.000Z",
    approvedByUserId: "user-1",
  };
}

function identityAsset(
  overrides: Partial<CreativeWorkIdentityAssetSnapshot> & {
    category?: BrandTrainingCategory;
    usageMode?: BrandTrainingUsageMode;
  }
): CreativeWorkIdentityAssetSnapshot {
  return {
    referenceId: "ref-logo",
    assetKey: "workspaces/ws/assets/logo.png",
    label: "Logo",
    category: "logo",
    usageMode: "exact",
    analysis: null,
    mimeType: "image/png",
    hasAlpha: true,
    placement: { gravity: "southeast", widthRatio: 0.18 },
    ...overrides,
  };
}

function build4x5(
  overrides: {
    identity?: CreativeWorkIdentitySnapshot;
    temporaryReferenceId?: string | null;
    selectedFontAssetKey?: string;
    motifs?: readonly string[];
  } = {}
): CarouselVisualContractV1 {
  return buildCarouselVisualContract({
    format: "4:5",
    identity: overrides.identity ?? identitySnapshot(),
    temporaryReferenceId: overrides.temporaryReferenceId ?? null,
    ...(overrides.selectedFontAssetKey
      ? { selectedFontAssetKey: overrides.selectedFontAssetKey }
      : {}),
    ...(overrides.motifs ? { motifs: overrides.motifs } : {}),
  });
}

async function solidPng(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return { r: data[index]!, g: data[index + 1]!, b: data[index + 2]! };
}

const RED = { r: 255, g: 0, b: 0 } as const;
const GREEN = { r: 0, g: 255, b: 0 } as const;
const BLUE = { r: 0, g: 0, b: 255 } as const;

describe("buildCarouselVisualContract", () => {
  it("freezes the exact 4:5 rhythm regions for the three fixed families", () => {
    const contract = build4x5();

    expect(contract.layoutFamilies.impact).toEqual(
      expect.objectContaining({
        id: "impact-v1",
        density: "high",
        primaryRegion: {
          x: 80, y: 96, width: 864, height: 420,
          minFontPx: 42, maxFontPx: 82, align: "left",
        },
        secondaryRegion: {
          x: 80, y: 920, width: 720, height: 180,
          minFontPx: 24, maxFontPx: 38, align: "left",
        },
        backgroundInstruction:
          "Text-free hero composition with one dominant focal area and the lower-right brand-asset reserve left clear.",
      })
    );
    expect(contract.layoutFamilies.development).toEqual(
      expect.objectContaining({
        id: "development-v1",
        density: "medium",
        primaryRegion: {
          x: 72, y: 112, width: 640, height: 300,
          minFontPx: 34, maxFontPx: 60, align: "left",
        },
        secondaryRegion: {
          x: 72, y: 790, width: 880, height: 270,
          minFontPx: 24, maxFontPx: 38, align: "left",
        },
        backgroundInstruction:
          "Text-free asymmetric composition with a clear reading path and all declared text and exact-asset regions unobstructed.",
      })
    );
    expect(contract.layoutFamilies.respite).toEqual(
      expect.objectContaining({
        id: "respite-v1",
        density: "low",
        primaryRegion: {
          x: 132, y: 330, width: 760, height: 320,
          minFontPx: 38, maxFontPx: 68, align: "center",
        },
        secondaryRegion: {
          x: 172, y: 720, width: 680, height: 170,
          minFontPx: 24, maxFontPx: 34, align: "center",
        },
        backgroundInstruction:
          "Text-free low-density composition with generous negative space around the centered reading area and exact assets.",
      })
    );
  });

  it("scales every 1:1 y and height by 0.8 with rounding and leaves x/width/fonts untouched", () => {
    const contract = buildCarouselVisualContract({
      format: "1:1",
      identity: identitySnapshot(),
      temporaryReferenceId: null,
    });

    expect(contract.layoutFamilies.impact.primaryRegion).toEqual({
      x: 80, y: 77, width: 864, height: 336,
      minFontPx: 42, maxFontPx: 82, align: "left",
    });
    expect(contract.layoutFamilies.impact.secondaryRegion).toEqual({
      x: 80, y: 736, width: 720, height: 144,
      minFontPx: 24, maxFontPx: 38, align: "left",
    });
    expect(contract.layoutFamilies.development.primaryRegion).toEqual({
      x: 72, y: 90, width: 640, height: 240,
      minFontPx: 34, maxFontPx: 60, align: "left",
    });
    expect(contract.layoutFamilies.development.secondaryRegion).toEqual({
      x: 72, y: 632, width: 880, height: 216,
      minFontPx: 24, maxFontPx: 38, align: "left",
    });
    expect(contract.layoutFamilies.respite.primaryRegion).toEqual({
      x: 132, y: 264, width: 760, height: 256,
      minFontPx: 38, maxFontPx: 68, align: "center",
    });
    expect(contract.layoutFamilies.respite.secondaryRegion).toEqual({
      x: 172, y: 576, width: 680, height: 136,
      minFontPx: 24, maxFontPx: 34, align: "center",
    });
  });

  it("keeps every 1:1 region inside the 1024x1024 canvas", () => {
    const contract = buildCarouselVisualContract({
      format: "1:1",
      identity: identitySnapshot({
        assets: [identityAsset(), identityAsset({
          referenceId: "ref-graphic",
          assetKey: "workspaces/ws/assets/graphic.png",
          category: "graphic",
          placement: { gravity: "northwest", widthRatio: 0.35 },
        })],
      }),
      temporaryReferenceId: null,
    });

    for (const family of Object.values(contract.layoutFamilies)) {
      for (const region of [family.primaryRegion, family.secondaryRegion]) {
        if (!region) continue;
        expect(region.x).toBeGreaterThanOrEqual(0);
        expect(region.y).toBeGreaterThanOrEqual(0);
        expect(region.x + region.width).toBeLessThanOrEqual(1024);
        expect(region.y + region.height).toBeLessThanOrEqual(1024);
      }
      for (const slot of family.exactAssetSlots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.width).toBeLessThanOrEqual(1024);
        expect(slot.y + slot.height).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("gives the three families distinct density and geometry", () => {
    const contract = build4x5();
    const { impact, development, respite } = contract.layoutFamilies;

    expect(new Set([impact.density, development.density, respite.density]).size).toBe(3);
    expect(impact.primaryRegion).not.toEqual(development.primaryRegion);
    expect(development.primaryRegion).not.toEqual(respite.primaryRegion);
    expect(impact.primaryRegion).not.toEqual(respite.primaryRegion);
  });

  it("produces the same hash for the same frozen inputs, ignoring identity confirmation time", () => {
    const first = build4x5();
    const second = build4x5();
    const reconfirmed = build4x5({
      identity: identitySnapshot({ confirmedAt: "2026-08-31T09:00:00.000Z" }),
    });

    expect(second.contractHash).toBe(first.contractHash);
    expect(reconfirmed.contractHash).toBe(first.contractHash);
    expect(first.contractHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the hash when the palette, the approved font or the reference changes", () => {
    const base = build4x5();
    const otherPalette = build4x5({
      identity: identitySnapshot({ brandKit: {
        colors: ["#445566", "#AABBCC"], fonts: [], fontAssets: [],
        toneOfVoice: null, prohibitedElements: null, requiredElements: null,
      } }),
    });
    const otherFont = build4x5({
      identity: identitySnapshot({ brandKit: {
        colors: ["#112233", "#AABBCC"], fonts: [], fontAssets: [fontAsset("workspaces/ws/brand-fonts/a.ttf", "A")],
        toneOfVoice: null, prohibitedElements: null, requiredElements: null,
      } }),
      selectedFontAssetKey: "workspaces/ws/brand-fonts/a.ttf",
    });
    const otherReference = build4x5({ temporaryReferenceId: "source-ref-1" });

    expect(otherPalette.contractHash).not.toBe(base.contractHash);
    expect(otherFont.contractHash).not.toBe(base.contractHash);
    expect(otherReference.contractHash).not.toBe(base.contractHash);
  });

  it("wins with the approved font selected by the operator", () => {
    const contract = build4x5({
      identity: identitySnapshot({ brandKit: {
        colors: ["#112233"], fonts: ["A", "B"],
        fontAssets: [fontAsset("workspaces/ws/brand-fonts/a.ttf", "A"), fontAsset("workspaces/ws/brand-fonts/b.ttf", "B")],
        toneOfVoice: null, prohibitedElements: null, requiredElements: null,
      } }),
      selectedFontAssetKey: "workspaces/ws/brand-fonts/b.ttf",
    });

    expect(contract.typography).toEqual({
      fontAssetKey: "workspaces/ws/brand-fonts/b.ttf",
      fallbackFamily: null,
      authority: "approved",
    });
  });

  it("never lets an unapproved font key win", () => {
    const contract = build4x5({
      identity: identitySnapshot({ brandKit: {
        colors: ["#112233"], fonts: ["A"],
        fontAssets: [fontAsset("workspaces/ws/brand-fonts/a.ttf", "A")],
        toneOfVoice: null, prohibitedElements: null, requiredElements: null,
      } }),
      selectedFontAssetKey: "workspaces/ws/brand-fonts/pending.ttf",
    });

    expect(contract.typography).toEqual({
      fontAssetKey: "workspaces/ws/brand-fonts/a.ttf",
      fallbackFamily: null,
      authority: "approved",
    });
  });

  it("records the sans fallback when no approved font asset exists", () => {
    const contract = build4x5();

    expect(contract.typography).toEqual({
      fontAssetKey: null,
      fallbackFamily: "sans",
      authority: "fallback",
    });
  });

  it("carries only exact identity assets into exactAssetKeys and slots", () => {
    const contract = build4x5({
      identity: identitySnapshot({
        assets: [
          identityAsset(),
          identityAsset({
            referenceId: "ref-vr",
            assetKey: "workspaces/ws/assets/reference.png",
            category: "visual_reference",
            usageMode: "reference",
            hasAlpha: false,
            placement: null,
          }),
          identityAsset({
            referenceId: "ref-rule",
            assetKey: "workspaces/ws/assets/rule.png",
            category: "graphic",
            usageMode: "rule",
            hasAlpha: false,
            placement: null,
          }),
          identityAsset({
            referenceId: "ref-exact-no-placement",
            assetKey: "workspaces/ws/assets/orphan.png",
            category: "graphic",
            usageMode: "exact",
            placement: null,
          }),
        ],
      }),
    });

    expect(contract.exactAssetKeys).toEqual(["workspaces/ws/assets/logo.png"]);
    expect(contract.layoutFamilies.impact.exactAssetSlots).toHaveLength(1);
    expect(contract.layoutFamilies.impact.exactAssetSlots[0]).toEqual(
      expect.objectContaining({ assetKey: "workspaces/ws/assets/logo.png" })
    );
  });

  it("derives slot boxes from the frozen gravity, the canvas height and the safe area", () => {
    const assets = [
      identityAsset({ placement: { gravity: "southeast", widthRatio: 0.18 } }),
      identityAsset({
        referenceId: "ref-graphic",
        assetKey: "workspaces/ws/assets/graphic.png",
        category: "graphic",
        placement: { gravity: "northwest", widthRatio: 0.35 },
      }),
      identityAsset({
        referenceId: "ref-character",
        assetKey: "workspaces/ws/assets/character.png",
        category: "character",
        placement: { gravity: "center", widthRatio: 0.42 },
      }),
    ];
    // width = round(1024 * ratio): 184, 358, 430.
    const wide4x5 = buildCarouselVisualContract({
      format: "4:5",
      identity: identitySnapshot({ assets }),
      temporaryReferenceId: null,
    });
    const square = buildCarouselVisualContract({
      format: "1:1",
      identity: identitySnapshot({ assets }),
      temporaryReferenceId: null,
    });

    const byKey4x5 = new Map(
      wide4x5.layoutFamilies.impact.exactAssetSlots.map((slot) => [slot.assetKey, slot])
    );
    expect(byKey4x5.get("workspaces/ws/assets/logo.png")).toEqual({
      assetKey: "workspaces/ws/assets/logo.png", x: 1024 - 64 - 184, y: 1280 - 64 - 184, width: 184, height: 184,
    });
    expect(byKey4x5.get("workspaces/ws/assets/graphic.png")).toEqual({
      assetKey: "workspaces/ws/assets/graphic.png", x: 64, y: 64, width: 358, height: 358,
    });
    expect(byKey4x5.get("workspaces/ws/assets/character.png")).toEqual({
      assetKey: "workspaces/ws/assets/character.png",
      x: Math.round((1024 - 430) / 2), y: Math.round((1280 - 430) / 2), width: 430, height: 430,
    });

    const byKey1x1 = new Map(
      square.layoutFamilies.impact.exactAssetSlots.map((slot) => [slot.assetKey, slot])
    );
    expect(byKey1x1.get("workspaces/ws/assets/logo.png")).toEqual({
      assetKey: "workspaces/ws/assets/logo.png", x: 776, y: 1024 - 64 - 184, width: 184, height: 184,
    });
    expect(wide4x5.safeAreaPx).toBe(64);
    expect(square.safeAreaPx).toBe(64);
  });

  it("keeps the temporary reference out of fact/layout data and nulls the first direction", () => {
    const contract = build4x5({ temporaryReferenceId: "source-ref-1" });

    expect(contract.temporaryReferenceId).toBe("source-ref-1");
    expect(contract.directionInstruction).toBeNull();
    const { temporaryReferenceId, ...referenceFree } = contract;
    expect(temporaryReferenceId).toBe("source-ref-1");
    expect(JSON.stringify(referenceFree)).not.toContain("source-ref-1");
  });

  it("projects the brand palette and prohibited elements into the contract", () => {
    const contract = build4x5();

    expect(contract.palette).toEqual(["#112233", "#AABBCC"]);
    expect(contract.prohibitedElements).toEqual(["Sem clipart", "Sem promessas de cura"]);
    expect(contract.recurringMotifs).toEqual([]);
  });

  it("carries trained motif rules as shared recurring motifs", () => {
    const motifs = ["Faixa diagonal recorrente", "Repetir o selo circular"];
    const contract = build4x5({ motifs });

    expect(contract.recurringMotifs).toEqual(motifs);
    expect(contract.contractHash).not.toBe(build4x5().contractHash);
    expect(contract.contractHash).toBe(build4x5({ motifs }).contractHash);
  });
});

describe("buildCarouselAnchorBoard", () => {
  it("builds one horizontal PNG with three equally sized cells in position order", async () => {
    const board = await buildCarouselAnchorBoard({
      anchors: [
        { position: 2, buffer: await solidPng(GREEN.r, GREEN.g, GREEN.b) },
        { position: 1, buffer: await solidPng(RED.r, RED.g, RED.b) },
        { position: 3, buffer: await solidPng(BLUE.r, BLUE.g, BLUE.b) },
      ],
    });

    const meta = await sharp(board).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(512);
    expect(await pixelAt(board, 256, 256)).toEqual(RED);
    expect(await pixelAt(board, 768, 256)).toEqual(GREEN);
    expect(await pixelAt(board, 1280, 256)).toEqual(BLUE);
  });
});

describe("buildCarouselContactSheet", () => {
  it("builds a two-column PNG with all slides in position order", async () => {
    const sheet = await buildCarouselContactSheet({
      slides: [
        { position: 5, buffer: await solidPng(BLUE.r, BLUE.g, BLUE.b) },
        { position: 1, buffer: await solidPng(RED.r, RED.g, RED.b) },
        { position: 3, buffer: await solidPng(BLUE.r, BLUE.g, BLUE.b) },
        { position: 2, buffer: await solidPng(GREEN.r, GREEN.g, GREEN.b) },
        { position: 4, buffer: await solidPng(GREEN.r, GREEN.g, GREEN.b) },
      ],
    });

    const meta = await sharp(sheet).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(768);
    expect(await pixelAt(sheet, 128, 128)).toEqual(RED);
    expect(await pixelAt(sheet, 384, 128)).toEqual(GREEN);
    expect(await pixelAt(sheet, 128, 384)).toEqual(BLUE);
  });
});

describe("carousel slide visual orientation", () => {
  const coverDirection = {
    slideId: "slide-1",
    learning: "A capa ancora a tese",
    representation: "Retrato com paleta aprovada",
    hierarchy: "Título e marca",
    transition: "Abre a comparação",
    claimIds: ["C1"],
  };
  const interiorDirection = {
    slideId: "slide-2",
    learning: "O leitor compara duas rotinas",
    representation: "Comparar duas rotinas com o mesmo critério",
    hierarchy: "Dois blocos iguais",
    transition: "Fecha no critério",
    claimIds: [],
  };

  it("resolves the storyboard direction by slide id", () => {
    expect(resolveCarouselSlideDirection([coverDirection, interiorDirection], "slide-2")).toEqual(interiorDirection);
    expect(resolveCarouselSlideDirection([coverDirection], "slide-9")).toBeNull();
  });

  it("orients the cover by identity and interiors by storyboard scene/density", () => {
    const cover = buildCarouselSlideVisualOrientation({
      position: 1,
      generationScope: "cover",
      direction: coverDirection,
    });
    const interior = buildCarouselSlideVisualOrientation({
      position: 2,
      generationScope: "interiors",
      direction: interiorDirection,
    });

    expect(cover).toContain("COVER IDENTITY ORIENTATION");
    expect(cover).toContain("Retrato com paleta aprovada");
    expect(interior).toContain("Comparar duas rotinas com o mesmo critério");
    expect(interior).toContain("Do not copy the cover silhouette");
    expect(interior).not.toContain("COVER IDENTITY ORIENTATION");
  });
});

describe("reviewCarouselSet", () => {
  const deck = {
    version: 1 as const,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Objetivo",
    audience: null,
    tone: null,
    promise: "Promessa",
    format: "4:5" as const,
    slides: [],
  };
  const contract = build4x5();
  const input = { contactSheet: Buffer.alloc(0), deck, contract };

  afterEach(() => {
    delete process.env.E2E_CONTROLLED_PROVIDER;
    delete process.env.APP_URL;
    vi.clearAllMocks();
  });

  it("returns no warnings under the controlled provider without any model call", async () => {
    process.env.E2E_CONTROLLED_PROVIDER = "true";
    process.env.APP_URL = "http://localhost:3000";

    await expect(reviewCarouselSet(input)).resolves.toEqual([]);
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("returns at most five short normalized warnings from the model", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            warnings: [
              `  ${"w".repeat(300)}  `,
              "paleta inconsistente",
              "hierarquia irregular",
              "motivo recorrente ausente",
              "ativo obstruído",
              "sexto aviso",
              "sétimo aviso",
            ],
          }),
        },
      }],
    });

    const warnings = await reviewCarouselSet(input);

    expect(warnings).toHaveLength(5);
    expect(warnings).toContain("paleta inconsistente");
    for (const warning of warnings) {
      expect(warning.length).toBeLessThanOrEqual(200);
    }
  });

  it("returns one set_review_unavailable warning on a model failure and never throws", async () => {
    createCompletionMock.mockRejectedValue(new Error("provider down"));

    await expect(reviewCarouselSet(input)).resolves.toEqual(["set_review_unavailable"]);
  });

  it("returns one set_review_unavailable warning when the model answer is not valid JSON", async () => {
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });

    await expect(reviewCarouselSet(input)).resolves.toEqual(["set_review_unavailable"]);
  });
});
