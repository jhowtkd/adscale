import { describe, expect, it } from "vitest";
import {
  nullifyLowConfidence,
  parseVisionStructure,
  visionStructureReadSchema,
  visionStructureSchema,
  zoneBand,
} from "./vision-structure";

const validRaw = {
  zones: [
    {
      role: "headline",
      x: 0.08,
      y: 0.1,
      width: 0.84,
      height: 0.12,
      confidence: 0.9,
    },
    {
      role: "logo",
      x: 0.05,
      y: 0.85,
      width: 0.25,
      height: 0.08,
      confidence: 0.8,
    },
  ],
  archetype: { id: "modular_card", confidence: 0.85 },
  typography: {
    titleBodyScaleRatio: 1.8,
    hierarchyNotes: "Bold title band over lighter body",
    confidence: 0.7,
  },
  grid: { columns: 2, alignment: "left", confidence: 0.6 },
  media: { type: "device", treatment: "right panel", confidence: 0.75 },
  contentPattern: {
    centralMessages: 1,
    listItems: 3,
    ctaStyle: "pill",
    hasLegalDisclaimer: true,
    confidence: 0.8,
  },
  accentPlacement: {
    inHighlightPosition: true,
    notes: "yellow chip left of media",
    confidence: 0.7,
  },
  authenticityRisk: { level: "low", confidence: 0.6 },
  overallConfidence: 0.78,
};

describe("visionStructureSchema", () => {
  it("accepts a full valid structure", () => {
    const parsed = parseVisionStructure(validRaw, {
      now: () => new Date("2026-08-05T00:00:00.000Z"),
    });
    expect(parsed?.version).toBe(1);
    expect(parsed?.source).toBe("vision");
    expect(parsed?.archetype?.id).toBe("modular_card");
    expect(parsed?.zones).toHaveLength(2);
  });

  it("rejects unknown layout roles", () => {
    const bad = {
      ...validRaw,
      zones: [{ role: "hero_banner", x: 0, y: 0, width: 1, height: 0.2, confidence: 1 }],
    };
    expect(parseVisionStructure(bad)).toBeNull();
    expect(() =>
      visionStructureSchema.parse({
        version: 1,
        source: "vision",
        inferredAt: "t",
        ...bad,
      }),
    ).toThrow();
  });

  it("rejects coordinates that leave the unit square", () => {
    const bad = {
      ...validRaw,
      zones: [
        { role: "headline", x: 0.8, y: 0.1, width: 0.4, height: 0.1, confidence: 0.9 },
      ],
    };
    expect(parseVisionStructure(bad)).toBeNull();
  });

  it("allows null branches for uncertain fields", () => {
    const sparse = parseVisionStructure({
      zones: null,
      archetype: { id: "text_led_card", confidence: 0.9 },
      typography: null,
      grid: null,
      media: null,
      contentPattern: null,
      accentPlacement: null,
      authenticityRisk: null,
      overallConfidence: 0.5,
    });
    expect(sparse?.archetype?.id).toBe("text_led_card");
    expect(sparse?.zones).toBeNull();
    expect(sparse?.typography).toBeNull();
  });
});

describe("nullifyLowConfidence", () => {
  it("turns low-confidence blocks into null without inventing replacements", () => {
    const full = parseVisionStructure(validRaw)!;
    const gated = nullifyLowConfidence(
      {
        ...full,
        grid: { columns: 3, alignment: "center", confidence: 0.2 },
        media: { type: "photo", treatment: null, confidence: 0.1 },
      },
      0.35,
    );
    expect(gated.grid).toBeNull();
    expect(gated.media).toBeNull();
    expect(gated.archetype?.id).toBe("modular_card");
  });

  it("collapses all-weak zones to null and caps overallConfidence when empty", () => {
    const full = parseVisionStructure({
      zones: [
        { role: "headline", x: 0, y: 0, width: 1, height: 0.1, confidence: 0.1 },
      ],
      archetype: null,
      typography: null,
      grid: null,
      media: null,
      contentPattern: null,
      accentPlacement: null,
      authenticityRisk: null,
      overallConfidence: 0.95,
    })!;
    const gated = nullifyLowConfidence(full, 0.35);
    expect(gated.zones).toBeNull();
    expect(gated.overallConfidence).toBeLessThanOrEqual(0.35);
  });

  it("always stamps inferredAt from the server clock, not the model", () => {
    const parsed = parseVisionStructure(
      { ...validRaw, inferredAt: "ontem" },
      { now: () => new Date("2026-08-05T12:00:00.000Z") },
    );
    expect(parsed?.inferredAt).toBe("2026-08-05T12:00:00.000Z");
  });

  it("read schema accepts legacy free-text timestamps; write schema does not", () => {
    const legacy = {
      version: 1 as const,
      source: "human" as const,
      inferredAt: "ontem",
      zones: null,
      archetype: { id: "text_led_card" as const, confidence: 1 },
      typography: null,
      grid: null,
      media: null,
      contentPattern: null,
      accentPlacement: null,
      authenticityRisk: null,
      overallConfidence: 1,
    };
    expect(visionStructureReadSchema.safeParse(legacy).success).toBe(true);
    expect(visionStructureSchema.safeParse(legacy).success).toBe(false);
  });

  it("zoneBand maps centers to coarse bands", () => {
    expect(zoneBand({ x: 0, y: 0, width: 0.2, height: 0.2 })).toBe("top-left");
    expect(zoneBand({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 })).toBe("mid-center");
    expect(zoneBand({ x: 0.7, y: 0.7, width: 0.25, height: 0.25 })).toBe("bottom-right");
  });
});
