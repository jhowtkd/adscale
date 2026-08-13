import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalJsonStringify } from "./canonical-json";
import {
  buildDeterministicBrandFidelity,
  buildResidualBrandFidelityReview,
} from "./brand-fidelity";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const copy = {
  headline: "Conheça a marca",
  body: "Uma identidade consistente.",
  cta: "Saiba mais",
};

const font = {
  assetKey: "fonts/brand.ttf",
  family: "Brand Sans",
  source: "Contrato",
  weight: 700 as const,
  style: "normal" as const,
  sha256: "f".repeat(64),
  approvedAt: "2026-08-13T10:00:00.000Z",
  approvedByUserId: "reviewer-1",
};

const typographyPlan = {
  version: 1 as const,
  execution: "deterministic" as const,
  format: "1:1" as const,
  requestedLayout: "top" as const,
  fontAssetKey: font.assetKey,
  fontSelection: "operator_selected" as const,
  overflowPolicy: {
    strategy: "autofit_then_fail" as const,
    minimumDpi: { headline: 96, body: 72, cta: 72 },
  },
  collisionPolicy: "relocate_layout_then_fail" as const,
  contrastPolicy: "brand_plate_wcag_aa" as const,
  safeAreaPolicy: "format_default" as const,
};

function conformingInput() {
  const finalArtifact = Buffer.from("final-artifact");
  const exactOutputHash = hash("exact-output");
  return {
    copy,
    format: "1:1" as const,
    dimensions: { width: 1080, height: 1080 },
    typographyPlan,
    approvedFont: font,
    exactAssets: [{
      referenceId: "logo-1",
      assetKey: "assets/logo.png",
      label: "Logo",
      category: "logo" as const,
      usageMode: "exact" as const,
      analysis: null,
      mimeType: "image/png",
      hasAlpha: true,
      placement: { gravity: "southeast" as const, widthRatio: 0.18 },
    }],
    exactComposition: {
      version: 1 as const,
      format: "1:1",
      dimensions: { width: 1080, height: 1080 },
      baseHash: hash("base"),
      outputHash: exactOutputHash,
      composed: [{
        referenceId: "logo-1",
        assetKey: "assets/logo.png",
        label: "Logo",
        category: "logo" as const,
        gravity: "southeast" as const,
        widthRatio: 0.18,
        clearspacePx: 24,
        contrast: 2,
        usedBackdrop: false,
        box: { left: 800, top: 800, width: 200, height: 100 },
        sourceSha256: hash("logo"),
        policy: {
          required: true,
          omissible: false,
          preferredGravity: "southeast" as const,
          minContrast: 1.6,
        },
      }],
      omitted: [],
      blocked: [],
    },
    textComposition: {
      version: 2 as const,
      execution: "deterministic" as const,
      format: "1:1" as const,
      dimensions: { width: 1080, height: 1080 },
      requestedLayout: "top" as const,
      appliedLayout: "top" as const,
      typographyPlan,
      font,
      copy,
      copyHash: hash(canonicalJsonStringify(copy)),
      baseHash: exactOutputHash,
      planHash: hash("plan"),
      outputHash: hash(finalArtifact),
      safeArea: { left: 60, top: 60, width: 960, height: 960, right: 60, bottom: 60, verified: true as const },
      palette: { panel: "#000000", text: "#FFFFFF" as const, contrast: 21, source: "brand" as const },
      adjustments: [],
      layers: (["headline", "body", "cta"] as const).map((role) => ({
        role,
        textHash: hash(copy[role]),
        box: { left: 80, top: 80, width: 500, height: 100 },
        renderedDpi: 100,
        minimumDpi: role === "headline" ? 96 : 72,
      })),
    },
    finalArtifact,
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  };
}

describe("deterministic Brand Fidelity", () => {
  it("proves copy, font, exact assets and the composition chain from execution artifacts", () => {
    const report = buildDeterministicBrandFidelity(conformingInput());

    expect(report.overall).toBe("proven");
    expect(report.artifactSha256).toBe(hash("final-artifact"));
    expect(report.checks.map((check) => [check.id, check.state])).toEqual([
      ["copy", "proven"],
      ["font", "proven"],
      ["exact_assets", "proven"],
      ["composition", "proven"],
    ]);
    expect(report.checks.every((check) => check.evidence.length > 0)).toBe(true);
  });

  it("marks deliberate artifact divergence as nonconforming", () => {
    const input = conformingInput();
    input.textComposition.copy = { ...copy, headline: "Texto divergente" };
    input.textComposition.outputHash = hash("another-artifact");
    input.exactComposition.composed = [];

    const report = buildDeterministicBrandFidelity(input);

    expect(report.overall).toBe("nonconforming");
    expect(report.checks.find((check) => check.id === "copy")?.state).toBe("nonconforming");
    expect(report.checks.find((check) => check.id === "exact_assets")?.state).toBe("nonconforming");
    expect(report.checks.find((check) => check.id === "composition")?.state).toBe("nonconforming");
  });

  it("never calls an unverifiable property proven", () => {
    const report = buildDeterministicBrandFidelity({
      ...conformingInput(),
      typographyPlan: null,
      approvedFont: null,
      exactAssets: [],
      exactComposition: null,
      textComposition: null,
    });

    expect(report.overall).toBe("not_applicable");
    expect(report.checks.every((check) => check.state === "not_applicable")).toBe(true);
  });
});

describe("residual Brand Fidelity review", () => {
  it("downgrades visual findings to reviewable suspicions with confidence", () => {
    const review = buildResidualBrandFidelityReview({
      evaluator: { status: "completed", error: null },
      findings: [{
        code: "wrong_brand",
        status: "confirmed",
        note: "Lettering may differ from the reference.",
        origin: "vision",
        confidence: 0.88,
      }],
    });

    expect(review.status).toBe("suspected");
    expect(review.signals).toEqual([expect.objectContaining({
      classification: "suspected",
      confidence: 0.88,
      code: "wrong_brand",
    })]);
  });

  it("fails open as inconclusive when the visual evaluator fails", () => {
    const review = buildResidualBrandFidelityReview({
      evaluator: { status: "failed", error: "signal timed out" },
      findings: [],
    });

    expect(review.status).toBe("inconclusive");
    expect(review.signals).toEqual([expect.objectContaining({
      classification: "inconclusive",
      confidence: null,
    })]);
  });

  it("does not invent confidence when the evaluator omitted it", () => {
    const review = buildResidualBrandFidelityReview({
      evaluator: { status: "completed", error: null },
      findings: [{
        code: "wrong_brand",
        status: "suspected",
        note: "Possible drift.",
        origin: "vision",
      }],
    });

    expect(review.signals[0]?.confidence).toBeNull();
  });
});
