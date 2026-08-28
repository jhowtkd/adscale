import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_STUDY_DISCLAIMER,
  ownedProfileName,
  validateCommercialStudiesManifest,
  assertOriginalFiles,
} from "./commercial-studies";

const validStudy = (slug: "nike" | "mtv" | "absolut", originals: unknown[]) => ({
  slug,
  brand: slug === "nike" ? "Nike" : slug === "mtv" ? "MTV" : "Absolut",
  campaign: slug === "nike" ? "Just Do It 1988" : slug === "mtv" ? "Network IDs 1981-83" : "Absolut Perfection 1980",
  hypothesis: "h",
  dossier: `${slug}.md`,
  sources: [
    {
      id: `${slug}-s1`,
      title: "t",
      publisher: "p",
      author: "a",
      url: "https://example.com/a",
      accessedAt: "2026-08-28",
      purpose: "fonte",
    },
    {
      id: `${slug}-s2`,
      title: "t2",
      publisher: "p",
      author: "a",
      url: "https://example.com/b",
      accessedAt: "2026-08-28",
      purpose: "fonte",
    },
  ],
  originals,
  briefs: {
    recreation: { theme: "Recriacao", objective: "Sistema", audience: "", offer: null },
    fresh: { theme: "Peca nova", objective: "Sistema", audience: "", offer: null },
  },
});

function capture(id: string, brand: "nike" | "mtv" | "absolut", stage: string, width: number, height: number) {
  return {
    id,
    brand,
    stage,
    routeKey: stage === "training" || stage === "context" ? "brandTraining" : stage === "direction" ? "creativeWork" : "library",
    viewport: { width, height },
    waitFor: "main",
    output: `${brand}-${stage}-${width}.png`,
  };
}

function twentyFourCaptures() {
  const stages = ["context", "training", "direction", "results", "decision"] as const;
  const mobile = new Set(["training", "results", "decision"]);
  const out = [];
  for (const brand of ["nike", "mtv", "absolut"] as const) {
    for (const stage of stages) {
      out.push(capture(`${brand}-${stage}-desktop`, brand, stage, 1440, 1000));
      if (mobile.has(stage)) out.push(capture(`${brand}-${stage}-mobile`, brand, stage, 390, 844));
    }
  }
  return out;
}

describe("commercial studies contract", () => {
  it("names isolated lab profiles", () => {
    expect(ownedProfileName("nike")).toBe("Estudo editorial — Nike — Just Do It");
    expect(ownedProfileName("mtv")).toBe("Estudo editorial — MTV — Network IDs");
    expect(ownedProfileName("absolut")).toBe("Estudo editorial — Absolut — Perfection");
  });

  it("rejects training originals that are not approved", () => {
    const manifest = {
      version: 1,
      environment: "development",
      disclaimer: COMMERCIAL_STUDY_DISCLAIMER,
      studies: [
        validStudy("nike", [
          { id: "n1", fileName: "n1.jpg", sha256: "a".repeat(64), role: "campaign_original", usageStatus: "review_required", entersTraining: true },
          { id: "n2", fileName: "n2.jpg", sha256: "b".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("mtv", [
          { id: "m1", fileName: "m1.jpg", sha256: "c".repeat(64), role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "m2", fileName: "m2.jpg", sha256: "d".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("absolut", [
          { id: "a1", fileName: "a1.jpg", sha256: "e".repeat(64), role: "campaign_original", usageStatus: "approved", entersTraining: true },
        ]),
      ],
      captures: twentyFourCaptures(),
    };
    expect(() => validateCommercialStudiesManifest(manifest as never)).toThrow(/entersTraining/);
  });

  it("requires original files to match sha256", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-orig-"));
    writeFileSync(join(dir, "ok.jpg"), "hello");
    const sha = createHash("sha256").update("hello").digest("hex");
    const manifest = {
      version: 1,
      environment: "development",
      disclaimer: COMMERCIAL_STUDY_DISCLAIMER,
      studies: [
        validStudy("nike", [
          { id: "n1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "n2", fileName: "missing.jpg", sha256: "f".repeat(64), role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("mtv", [
          { id: "m1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
          { id: "m2", fileName: "ok.jpg", sha256: sha, role: "campaign_still", usageStatus: "approved", entersTraining: true },
        ]),
        validStudy("absolut", [
          { id: "a1", fileName: "ok.jpg", sha256: sha, role: "campaign_original", usageStatus: "approved", entersTraining: true },
        ]),
      ],
      captures: twentyFourCaptures(),
    };
    validateCommercialStudiesManifest(manifest as never);
    expect(() => assertOriginalFiles(manifest as never, dir)).toThrow(/missing.jpg/);
  });
});
