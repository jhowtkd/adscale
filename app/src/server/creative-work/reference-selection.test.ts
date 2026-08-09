import { describe, expect, it } from "vitest";
import type { BrandTrainingAnalysis } from "../brand-training/contracts";
import { selectReferences, type ReferenceCandidate } from "./reference-selection";

const SYNTHETIC_AT = "2026-01-01T00:00:00.000Z";

function measurement(aspectRatio: number): NonNullable<BrandTrainingAnalysis["measurement"]> {
  const width = 1000;
  return {
    version: 1,
    width,
    height: Math.round(width / aspectRatio),
    aspectRatio,
    orientationApplied: null,
    colorSpace: "srgb",
    hasAlphaChannel: false,
    hasRealTransparency: false,
    transparentAreaPercent: 0,
    colorCoverage: [],
    contentBoundingBox: null,
    margins: null,
    meanLuminance: 0.3,
    regions: [],
    measuredAt: SYNTHETIC_AT,
  };
}

function structure(
  archetypeId: string,
  centralMessages: number | null,
  mediaType: "photo" | "illustration" | "device" | "abstract" | "none" | "other" | null = null,
): NonNullable<BrandTrainingAnalysis["structure"]> {
  return {
    version: 1,
    source: "vision",
    inferredAt: SYNTHETIC_AT,
    zones: null,
    archetype: { id: archetypeId as never, confidence: 0.8 },
    typography: null,
    grid: null,
    media: mediaType == null ? null : { type: mediaType, treatment: null, confidence: 0.8 },
    contentPattern:
      centralMessages == null
        ? null
        : {
            centralMessages,
            listItems: null,
            ctaStyle: null,
            hasLegalDisclaimer: null,
            confidence: 0.8,
          },
    accentPlacement: null,
    authenticityRisk: null,
    overallConfidence: 0.8,
  };
}

function analysis(input: {
  aspectRatio?: number;
  archetype?: string;
  centralMessages?: number | null;
  mediaType?: "photo" | "illustration" | "device" | "abstract" | "none" | "other";
}): BrandTrainingAnalysis {
  return {
    description: "referência sintética",
    visualAttributes: [],
    rules: [],
    constraints: [],
    confidence: 0.9,
    ...(input.aspectRatio != null ? { measurement: measurement(input.aspectRatio) } : {}),
    ...(input.archetype != null
      ? { structure: structure(input.archetype, input.centralMessages ?? 1, input.mediaType ?? null) }
      : {}),
  };
}

function candidate(
  referenceId: string,
  input: {
    aspectRatio?: number;
    archetype?: string;
    centralMessages?: number | null;
    mediaType?: "photo" | "illustration" | "device" | "abstract" | "none" | "other";
    usageMode?: ReferenceCandidate["usageMode"];
    briefOverlap?: number;
  } = {},
): ReferenceCandidate {
  return {
    referenceId,
    usageMode: input.usageMode ?? "reference",
    analysis: analysis(input),
    briefOverlap: input.briefOverlap ?? 0,
  };
}

const SQUARE = 1;
const PORTRAIT_4X5 = 1080 / 1350;
const STORY_9X16 = 1080 / 1920;

describe("selectReferences — format drives the choice", () => {
  const candidates = [
    candidate("ref-square", { aspectRatio: SQUARE }),
    candidate("ref-portrait", { aspectRatio: PORTRAIT_4X5 }),
    candidate("ref-story", { aspectRatio: STORY_9X16 }),
  ];

  it("puts the matching aspect first for each requested format", () => {
    const square = selectReferences({ candidates, format: "1:1", objective: "", limit: 1 });
    const portrait = selectReferences({ candidates, format: "4:5", objective: "", limit: 1 });
    const story = selectReferences({ candidates, format: "9:16", objective: "", limit: 1 });

    expect(square.selected[0]?.referenceId).toBe("ref-square");
    expect(portrait.selected[0]?.referenceId).toBe("ref-portrait");
    expect(story.selected[0]?.referenceId).toBe("ref-story");
  });

  it("changes the ranking when only the format changes", () => {
    const square = selectReferences({ candidates, format: "1:1", objective: "" });
    const story = selectReferences({ candidates, format: "9:16", objective: "" });

    expect(square.selected.map((entry) => entry.referenceId)).not.toEqual(
      story.selected.map((entry) => entry.referenceId),
    );
  });
});

describe("selectReferences — content pattern drives the choice", () => {
  const candidates = [
    candidate("ref-evidence", { aspectRatio: SQUARE, archetype: "evidence_pyramid" }),
    candidate("ref-device", { aspectRatio: SQUARE, archetype: "device_showcase" }),
    candidate("ref-institutional", { aspectRatio: SQUARE, archetype: "institutional_photo" }),
  ];

  it("prefers the archetype that carries the objective", () => {
    const evidence = selectReferences({
      candidates,
      format: "1:1",
      objective: "mostrar dados de resultado do estudo",
      limit: 1,
    });
    const demo = selectReferences({
      candidates,
      format: "1:1",
      objective: "demonstracao da plataforma na tela",
      limit: 1,
    });

    expect(evidence.selected[0]?.referenceId).toBe("ref-evidence");
    expect(demo.selected[0]?.referenceId).toBe("ref-device");
  });

  it("still ranks everything when the objective matches no archetype", () => {
    const result = selectReferences({
      candidates,
      format: "1:1",
      objective: "algo totalmente fora do vocabulario",
      limit: 3,
    });

    expect(result.selected).toHaveLength(3);
  });
});

describe("selectReferences — requested media drives the choice", () => {
  it("changes the ranking when the requested media type changes", () => {
    const candidates = [
      candidate("ref-device", { aspectRatio: SQUARE, archetype: "modular_card", mediaType: "device" }),
      candidate("ref-photo", { aspectRatio: SQUARE, archetype: "modular_card", mediaType: "photo" }),
    ];

    const device = selectReferences({
      candidates,
      format: "1:1",
      objective: "",
      preferredMediaTypes: ["device"],
      limit: 1,
    });
    const photo = selectReferences({
      candidates,
      format: "1:1",
      objective: "",
      preferredMediaTypes: ["photo"],
      limit: 1,
    });

    expect(device.selected[0]?.referenceId).toBe("ref-device");
    expect(photo.selected[0]?.referenceId).toBe("ref-photo");
  });
});

describe("selectReferences — requested density drives the choice", () => {
  it("changes the ranking when the requested message count changes", () => {
    const candidates = [
      candidate("ref-single", { aspectRatio: SQUARE, archetype: "modular_card", centralMessages: 1 }),
      candidate("ref-dense", { aspectRatio: SQUARE, archetype: "modular_card", centralMessages: 4 }),
    ];

    const single = selectReferences({
      candidates,
      format: "1:1",
      objective: "",
      desiredCentralMessages: 1,
      limit: 1,
    });
    const dense = selectReferences({
      candidates,
      format: "1:1",
      objective: "",
      desiredCentralMessages: 4,
      limit: 1,
    });

    expect(single.selected[0]?.referenceId).toBe("ref-single");
    expect(dense.selected[0]?.referenceId).toBe("ref-dense");
  });
});

describe("selectReferences — insertion order never controls the output", () => {
  const base = [
    candidate("ref-a", { aspectRatio: SQUARE, archetype: "modular_card" }),
    candidate("ref-b", { aspectRatio: PORTRAIT_4X5, archetype: "evidence_pyramid" }),
    candidate("ref-c", { aspectRatio: STORY_9X16, archetype: "device_showcase" }),
    candidate("ref-d", { aspectRatio: SQUARE, archetype: "institutional_photo" }),
  ];

  it("returns the same list for every permutation of the corpus", () => {
    const expected = selectReferences({
      candidates: base,
      format: "4:5",
      objective: "oferta",
    }).selected.map((entry) => entry.referenceId);

    const permutations = [
      [...base].reverse(),
      [base[1]!, base[3]!, base[0]!, base[2]!],
      [base[2]!, base[0]!, base[3]!, base[1]!],
    ];

    for (const permuted of permutations) {
      const actual = selectReferences({
        candidates: permuted,
        format: "4:5",
        objective: "oferta",
      }).selected.map((entry) => entry.referenceId);
      expect(actual).toEqual(expected);
    }
  });

  it("breaks exact score ties by id, not by position", () => {
    const tied = [
      candidate("ref-z", { aspectRatio: SQUARE }),
      candidate("ref-a", { aspectRatio: SQUARE }),
    ];
    const forward = selectReferences({ candidates: tied, format: "1:1", objective: "", limit: 1 });
    const reversed = selectReferences({
      candidates: [...tied].reverse(),
      format: "1:1",
      objective: "",
      limit: 1,
    });

    expect(forward.selected[0]?.referenceId).toBe("ref-a");
    expect(reversed.selected[0]?.referenceId).toBe("ref-a");
  });
});

describe("selectReferences — exact assets never take a style slot", () => {
  it("excludes exact-mode assets and records how many were skipped", () => {
    const candidates = [
      candidate("logo", { aspectRatio: SQUARE, usageMode: "exact" }),
      candidate("ref-one", { aspectRatio: SQUARE }),
      candidate("ref-two", { aspectRatio: SQUARE }),
    ];

    const result = selectReferences({ candidates, format: "1:1", objective: "" });

    expect(result.selected.map((entry) => entry.referenceId)).not.toContain("logo");
    expect(result.provenance.excludedExactCount).toBe(1);
    expect(result.provenance.consideredCount).toBe(2);
  });

  it("leaves rule-mode assets out of the style slots too", () => {
    const candidates = [
      candidate("rule-asset", { aspectRatio: SQUARE, usageMode: "rule" }),
      candidate("ref-one", { aspectRatio: SQUARE }),
    ];

    const result = selectReferences({ candidates, format: "1:1", objective: "" });

    expect(result.selected.map((entry) => entry.referenceId)).toEqual(["ref-one"]);
  });
});

describe("selectReferences — diversity of archetype families", () => {
  it("prefers one reference per family before repeating a family", () => {
    const candidates = [
      candidate("card-1", { aspectRatio: SQUARE, archetype: "modular_card" }),
      candidate("card-2", { aspectRatio: SQUARE, archetype: "modular_card" }),
      candidate("card-3", { aspectRatio: SQUARE, archetype: "modular_card" }),
      candidate("evidence", { aspectRatio: SQUARE, archetype: "evidence_pyramid" }),
      candidate("device", { aspectRatio: SQUARE, archetype: "device_showcase" }),
    ];

    const selected = selectReferences({ candidates, format: "1:1", objective: "" }).selected;
    const families = selected.map((entry) => entry.archetype);

    expect(new Set(families).size).toBe(families.length);
  });

  it("backfills from a repeated family when distinct ones run out", () => {
    const candidates = [
      candidate("card-1", { aspectRatio: SQUARE, archetype: "modular_card" }),
      candidate("card-2", { aspectRatio: SQUARE, archetype: "modular_card" }),
      candidate("card-3", { aspectRatio: SQUARE, archetype: "modular_card" }),
    ];

    const selected = selectReferences({ candidates, format: "1:1", objective: "" }).selected;

    expect(selected).toHaveLength(3);
  });
});

describe("selectReferences — assets without analysis", () => {
  it("ranks unmeasured references neutrally instead of dropping them", () => {
    const candidates: ReferenceCandidate[] = [
      { referenceId: "no-analysis", usageMode: "reference", analysis: null, briefOverlap: 0 },
      candidate("measured-off-format", { aspectRatio: STORY_9X16 }),
    ];

    const result = selectReferences({ candidates, format: "1:1", objective: "" });

    // Neutral (0.5) beats a measured mismatch, and neither is dropped.
    expect(result.selected).toHaveLength(2);
    expect(result.selected[0]?.referenceId).toBe("no-analysis");
  });
});
