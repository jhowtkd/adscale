import { describe, it, expect } from "vitest";
import {
  buildOutputDecisionSnapshot,
  mapActionToSemantics,
  sanitizeOutputDecisionSnapshot,
  OUTPUT_DECISION_ACTIONS,
} from "@/server/output-learning/output-decision-events";

describe("output-decision-events", () => {
  describe("mapActionToSemantics", () => {
    it.each([
      ["approved", "positive", "strong"],
      ["rejected", "negative", "strong"],
      ["regenerated", "corrective", "strong"],
      ["saved_reference", "positive", "strong"],
      ["selected_for_delivery", "positive", "medium"],
    ] as const)(
      "maps %s to direction=%s strength=%s",
      (action, direction, strength) => {
        expect(mapActionToSemantics(action)).toEqual({
          action,
          direction,
          strength,
        });
      }
    );

    it("covers every canonical action", () => {
      for (const action of OUTPUT_DECISION_ACTIONS) {
        expect(mapActionToSemantics(action).action).toBe(action);
      }
    });
  });

  describe("buildOutputDecisionSnapshot", () => {
    it("builds bounded snapshot from derivation fields", () => {
      const snapshot = buildOutputDecisionSnapshot({
        generationMode: "art_variation",
        format: "1:1",
        variantIndex: 2,
        ctaText: "Shop now",
        status: "completed",
        qualityScore: 72,
        qualityVerdict: "improvable",
        scoreStatus: "analyzed",
        hardFailures: [{ code: "cta_drift", message: "CTA changed" }],
        scoreIssues: ["hook weak"],
        polishSuggestions: ["simplify background"],
      });

      expect(snapshot).toMatchObject({
        generationMode: "art_variation",
        format: "1:1",
        variantIndex: 2,
        qualityScore: 72,
        hardFailures: [{ code: "cta_drift", message: "CTA changed" }],
        scoreIssues: ["hook weak"],
      });
    });

    it("excludes prompt and output fields even when passed on input", () => {
      const snapshot = buildOutputDecisionSnapshot({
        prompt: "secret prompt",
        inputPrompt: "secret input",
        outputKey: "r2://bucket/key",
        generationMode: "restyling",
      });

      expect(snapshot).not.toHaveProperty("prompt");
      expect(snapshot).not.toHaveProperty("inputPrompt");
      expect(snapshot).not.toHaveProperty("outputKey");
    });

    it("truncates long reason text", () => {
      const longText = "x".repeat(2000);
      const snapshot = sanitizeOutputDecisionSnapshot({
        reason: { code: "cta_drift", text: longText, source: "hard_failures" },
      });

      expect(snapshot.reason?.text?.length).toBeLessThanOrEqual(1000);
    });

    it("preserves override audit context and verdict refs", () => {
      const snapshot = buildOutputDecisionSnapshot(
        {
          generationMode: "art_variation",
          status: "approved",
          prompt: "secret prompt",
          outputKey: "r2://bucket/key",
        },
        {
          overrideApproved: true,
          olharVerdict: { value: "confusa" },
          exportStatus: { value: "bloqueado" },
          reason: {
            code: "override_approval",
            text: "Client accepted weak composition for this placement.",
            source: "review_override",
          },
        }
      );

      expect(snapshot).toMatchObject({
        overrideApproved: true,
        olharVerdict: { value: "confusa" },
        exportStatus: { value: "bloqueado" },
        reason: {
          code: "override_approval",
          source: "review_override",
        },
      });
      expect(snapshot).not.toHaveProperty("prompt");
      expect(snapshot).not.toHaveProperty("outputKey");
    });

    it("preserves direction reason without sensitive derivation fields", () => {
      const snapshot = buildOutputDecisionSnapshot(
        {
          generationMode: "art_variation",
          inputPrompt: "secret input",
        },
        {
          reason: {
            code: "nao_entra",
            text: "Direction does not match campaign voice.",
            source: "direction_reason",
          },
        }
      );

      expect(snapshot.reason).toEqual({
        code: "nao_entra",
        text: "Direction does not match campaign voice.",
        source: "direction_reason",
      });
      expect(snapshot).not.toHaveProperty("inputPrompt");
    });
  });
});
