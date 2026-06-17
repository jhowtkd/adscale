import { describe, expect, it } from "vitest";
import {
  buildOutputLearningStatement,
  extractVariablesFromEvent,
  normalizeOutputVariableKey,
  normalizeScopeValue,
} from "@/server/output-learning/variable-value";
import type { OutputDecisionEvent } from "@/server/db/schema";

describe("output-learning variable-value", () => {
  it("normalizes legacy variable keys", () => {
    expect(normalizeOutputVariableKey("cta_text")).toBe("cta");
    expect(normalizeOutputVariableKey("recipe")).toBe("generation_mode");
    expect(normalizeOutputVariableKey("style")).toBe("style_policy");
  });

  it("rejects unsupported variable keys", () => {
    expect(normalizeOutputVariableKey("prompt_tone")).toBeNull();
  });

  it("extracts bounded variables from event snapshot", () => {
    const event = {
      contextSnapshot: {
        ctaText: " Saiba mais ",
        format: "4:5",
        generationMode: "format_adaptation",
        hardFailures: [{ code: "low_contrast" }],
      },
    } as OutputDecisionEvent;

    const variables = extractVariablesFromEvent(event);
    expect(variables.map((v) => v.variableKey)).toEqual([
      "cta",
      "format",
      "generation_mode",
      "avoid_pattern",
    ]);
  });

  it("builds scoped Portuguese statements", () => {
    const statement = buildOutputLearningStatement({
      variableKey: "cta",
      variableValue: "Comprar",
      preferenceDirection: "prefer",
      confidence: "medium",
      supportingCount: 2,
      contradictingCount: 0,
      scopeGenerationMode: "art_variation",
      scopeFormat: "1:1",
    });
    expect(statement).toContain("preferir");
    expect(statement).toContain("CTA");
    expect(statement).toContain("modo art_variation");
  });

  it("normalizes scope values to lowercase", () => {
    expect(normalizeScopeValue(" 1:1 ")).toBe("1:1");
    expect(normalizeScopeValue(null)).toBe("");
  });
});
