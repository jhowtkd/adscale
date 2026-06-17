import { describe, it, expect } from "vitest";
import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
  buildQualitySnapshot,
  classifyCohort,
  isHumanQualityCorpusCohort,
  isHumanQualityFailureReason,
  isHumanQualityIntent,
  sanitizeArtifactRef,
  sanitizeQualitySnapshot,
  validateFactualPass,
  validateVisualScore,
} from "@/server/human-quality/corpus";

describe("human-quality corpus contract", () => {
  describe("visual score validation", () => {
    it("accepts valid integer scores 0-100", () => {
      expect(validateVisualScore(0)).toEqual({ ok: true, value: 0 });
      expect(validateVisualScore(72)).toEqual({ ok: true, value: 72 });
      expect(validateVisualScore(100)).toEqual({ ok: true, value: 100 });
    });

    it("rejects non-integer scores", () => {
      expect(validateVisualScore(72.5).ok).toBe(false);
      expect(validateVisualScore(NaN).ok).toBe(false);
    });

    it("rejects out-of-range scores", () => {
      expect(validateVisualScore(-1).ok).toBe(false);
      expect(validateVisualScore(101).ok).toBe(false);
    });
  });

  describe("factual pass validation", () => {
    it("accepts boolean values", () => {
      expect(validateFactualPass(true)).toEqual({ ok: true, value: true });
      expect(validateFactualPass(false)).toEqual({ ok: true, value: false });
    });

    it("rejects non-boolean values", () => {
      expect(validateFactualPass("true").ok).toBe(false);
      expect(validateFactualPass(1).ok).toBe(false);
      expect(validateFactualPass(null).ok).toBe(false);
    });
  });

  describe("enum guards", () => {
    it("validates cohort values", () => {
      for (const cohort of HUMAN_QUALITY_CORPUS_COHORTS) {
        expect(isHumanQualityCorpusCohort(cohort)).toBe(true);
      }
      expect(isHumanQualityCorpusCohort("unknown")).toBe(false);
    });

    it("validates intent values", () => {
      for (const intent of HUMAN_QUALITY_INTENTS) {
        expect(isHumanQualityIntent(intent)).toBe(true);
      }
      expect(isHumanQualityIntent("delete")).toBe(false);
    });

    it("validates failure reason values", () => {
      for (const reason of HUMAN_QUALITY_FAILURE_REASONS) {
        expect(isHumanQualityFailureReason(reason)).toBe(true);
      }
      expect(isHumanQualityFailureReason("bad_colors")).toBe(false);
    });
  });

  describe("cohort classification", () => {
    it("defaults unknown values to baseline", () => {
      expect(classifyCohort(undefined)).toBe("baseline");
      expect(classifyCohort("")).toBe("baseline");
      expect(classifyCohort("invalid")).toBe("baseline");
    });

    it("preserves valid cohort values", () => {
      expect(classifyCohort("pre_learning")).toBe("pre_learning");
      expect(classifyCohort("post_learning")).toBe("post_learning");
    });
  });

  describe("quality snapshot builder", () => {
    it("builds bounded snapshot from derivation fields", () => {
      const snapshot = buildQualitySnapshot({
        generationMode: "art_variation",
        format: "1:1",
        variantIndex: 1,
        qualityScore: 68,
        qualityVerdict: "improvable",
        scoreStatus: "analyzed",
        hardFailures: [{ code: "cta_drift", message: "CTA changed" }],
        scoreIssues: ["weak hierarchy"],
      });

      expect(snapshot).toMatchObject({
        generationMode: "art_variation",
        format: "1:1",
        qualityScore: 68,
        hardFailures: [{ code: "cta_drift", message: "CTA changed" }],
      });
    });
  });

  describe("snapshot sanitization", () => {
    it("strips forbidden raw payload fields from quality snapshot", () => {
      const snapshot = sanitizeQualitySnapshot({
        generationMode: "restyling",
        prompt: "secret prompt",
        signedUrl: "https://signed.example/key",
        modelResponse: { text: "raw" },
      } as Record<string, unknown>);

      expect(snapshot).not.toHaveProperty("prompt");
      expect(snapshot).not.toHaveProperty("signedUrl");
      expect(snapshot).not.toHaveProperty("modelResponse");
      expect(snapshot.generationMode).toBe("restyling");
    });

    it("strips forbidden fields from artifact references", () => {
      const ref = sanitizeArtifactRef({
        derivationId: "deriv-1",
        assetId: "asset-1",
        outputKey: "r2://bucket/key",
        imageBytes: "base64data",
      });

      expect(ref).toEqual({
        derivationId: "deriv-1",
        assetId: "asset-1",
      });
    });
  });
});
