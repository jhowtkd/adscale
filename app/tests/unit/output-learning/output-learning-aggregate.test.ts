import { describe, expect, it } from "vitest";
import { aggregateOutputLearningsFromEvents } from "@/server/output-learning/aggregate";
import {
  OUTPUT_DECISION_EVENT_IDS,
  buildOutputDecisionEvent,
} from "@/server/repositories/output-decision-event.fixture";

describe("aggregateOutputLearningsFromEvents", () => {
  it("aggregates supporting CTA learnings from approvals", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      buildOutputDecisionEvent(),
      buildOutputDecisionEvent({
        id: OUTPUT_DECISION_EVENT_IDS.secondary,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
      }),
    ]);

    const ctaLearning = drafts.find((draft) => draft.variableKey === "cta");
    expect(ctaLearning).toBeDefined();
    expect(ctaLearning?.variableValue).toBe("Comprar agora");
    expect(ctaLearning?.supportingEvidence).toHaveLength(2);
    expect(ctaLearning?.preferenceDirection).toBe("prefer");
    expect(ctaLearning?.scopeGenerationMode).toBe("art_variation");
    expect(ctaLearning?.scopeFormat).toBe("1:1");
  });

  it("marks learning superseded when contradicting evidence dominates", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      buildOutputDecisionEvent(),
      buildOutputDecisionEvent({
        id: OUTPUT_DECISION_EVENT_IDS.secondary,
        action: "rejected",
        direction: "negative",
        contextSnapshot: {
          generationMode: "art_variation",
          format: "1:1",
          ctaText: "Comprar agora",
          reason: { code: "text_illegible", source: "hard_failures" },
        },
      }),
    ]);

    const ctaLearning = drafts.find((draft) => draft.variableKey === "cta");
    expect(ctaLearning?.status).toBe("superseded");
    expect(ctaLearning?.contradictingEvidence.length).toBeGreaterThan(0);
  });

  it("creates avoid_pattern learning from rejection reason codes", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      buildOutputDecisionEvent({
        action: "rejected",
        direction: "negative",
        contextSnapshot: {
          generationMode: "restyling",
          format: "1:1",
          hardFailures: [{ code: "logo_distorted", message: "Logo distorcido" }],
        },
      }),
      buildOutputDecisionEvent({
        id: OUTPUT_DECISION_EVENT_IDS.secondary,
        action: "regenerated",
        direction: "corrective",
        contextSnapshot: {
          generationMode: "restyling",
          format: "1:1",
          hardFailures: [{ code: "logo_distorted", message: "Logo distorcido" }],
        },
      }),
    ]);

    const avoidLearning = drafts.find((draft) => draft.variableKey === "avoid_pattern");
    expect(avoidLearning).toBeDefined();
    expect(avoidLearning?.variableValue).toBe("logo_distorted");
    expect(avoidLearning?.preferenceDirection).toBe("avoid");
    expect(avoidLearning?.supportingEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it("skips events without client profile", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      buildOutputDecisionEvent({ clientProfileId: null }),
    ]);
    expect(drafts).toHaveLength(0);
  });
});
