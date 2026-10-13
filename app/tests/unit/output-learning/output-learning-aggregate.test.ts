import { describe, expect, it } from "vitest";
import { aggregateOutputLearningsFromEvents } from "@/server/output-learning/aggregate";
import type { OutputDecisionEvent } from "@/server/db/schema";
import { mapActionToSemantics } from "@/server/output-learning/output-decision-events";

function baseEvent(
  overrides: Partial<OutputDecisionEvent> = {}
): OutputDecisionEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: "ws-1",
    userId: "user-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    authorType: "human", actorId: null, actorRole: null, equipeEventId: null,
    creativeWorkOutputId: null,
    parentDerivationId: null,
    action: "approved",
    direction: "positive",
    strength: "strong",
    source: "derivations.review.PATCH",
    contextSnapshot: {
      generationMode: "art_variation",
      format: "1:1",
      ctaText: "Comprar agora",
    },
    idempotencyKey: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("aggregateOutputLearningsFromEvents", () => {
  it("does not use agent decisions as human taste", () => {
    expect(aggregateOutputLearningsFromEvents([baseEvent({ authorType: "agent" })])).toEqual([]);
  });

  it("includes current Peça evidence and does not count absent campaigns as samples", () => {
    const current = baseEvent({ campaignId: null, derivationId: null, creativeWorkOutputId: "output-1" });
    const currentDraft = aggregateOutputLearningsFromEvents([current]).find((draft) => draft.variableKey === "cta")!;
    expect(currentDraft.sampleCampaignCount).toBe(0);
    expect(currentDraft.supportingEvidence[0]).toMatchObject({
      campaignId: null, derivationId: null, creativeWorkOutputId: "output-1",
    });
    const legacy = baseEvent();
    const mixed = aggregateOutputLearningsFromEvents([legacy, current]).find((draft) => draft.variableKey === "cta")!;
    expect(mixed.sampleCampaignCount).toBe(1);
    expect(mixed.sampleEventCount).toBe(2);
    expect(mixed.supportingEvidence.find((ref) => ref.eventId === legacy.id)).not.toHaveProperty("creativeWorkOutputId");
  });

  it("keeps mixed weak preferences as context without changing explicit confidence or votes", () => {
    const votes = [baseEvent(), baseEvent({ id: "approval-2" })];
    const weakEvents = Array.from({ length: 20 }, (_, i) => baseEvent({
      id: `weak-${i}`,
      ...mapActionToSemantics(i % 2 ? "favorited" : "alternative_not_selected"),
    }));
    const baseline = aggregateOutputLearningsFromEvents(votes);
    const mixed = aggregateOutputLearningsFromEvents([...votes, ...weakEvents]);
    for (const draft of mixed) {
      const original = baseline.find((item) => item.variableKey === draft.variableKey)!;
      expect(draft.status).toBe(original.status);
      expect(draft.confidenceScore).toBe(original.confidenceScore);
      expect(draft.sampleEventCount).toBe(22);
      expect(draft.supportingEvidence.filter((item) => item.strength === "strong")).toHaveLength(2);
      expect(draft.supportingEvidence.filter((item) => item.strength === "weak")).toHaveLength(10);
      expect(draft.contradictingEvidence).toHaveLength(10);
    }
  });

  it("does not turn neutral changes or a layer correction into a Peça vote", () => {
    const votes = [baseEvent(), baseEvent({ id: "approval-2" })];
    const changes = ([
      "favorite_removed", "selection_replaced", "variation_requested", "format_adapted", "layer_regenerated",
    ] as const).map((action) => baseEvent({ id: action, ...mapActionToSemantics(action) }));
    expect(aggregateOutputLearningsFromEvents(changes)).toEqual([]);
    expect(aggregateOutputLearningsFromEvents([...votes, ...changes]))
      .toEqual(aggregateOutputLearningsFromEvents(votes));
  });

  it.each(["favorited", "alternative_not_selected"] as const)(
    "keeps repeated %s as weak context without approving or superseding a learning",
    (action) => {
      const events = Array.from({ length: 20 }, (_, i) => baseEvent({
        id: `weak-${i}`,
        ...mapActionToSemantics(action),
        contextSnapshot: {
          generationMode: "art_variation", format: "1:1", ctaText: "Comprar agora",
          reason: { code: "weak_hierarchy" },
        },
      }));
      const drafts = aggregateOutputLearningsFromEvents(events);
      expect(drafts.length).toBeGreaterThan(0);
      for (const draft of drafts) {
        expect(draft.status).toBe("draft");
        expect(draft.confidence).toBe("low");
        expect(draft.confidenceScore).toBe("0.0000");
        expect(draft.sampleEventCount).toBe(20);
        expect([...draft.supportingEvidence, ...draft.contradictingEvidence])
          .toEqual(expect.arrayContaining([expect.objectContaining({ action, strength: "weak" })]));
      }
    }
  );

  it("aggregates supporting CTA learnings from approvals", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      baseEvent(),
      baseEvent({
        id: crypto.randomUUID(),
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
      baseEvent(),
      baseEvent({
        id: crypto.randomUUID(),
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
      baseEvent({
        action: "rejected",
        direction: "negative",
        contextSnapshot: {
          generationMode: "restyling",
          format: "1:1",
          hardFailures: [{ code: "logo_distorted", message: "Logo distorcido" }],
        },
      }),
      baseEvent({
        id: crypto.randomUUID(),
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
      baseEvent({ clientProfileId: null }),
    ]);
    expect(drafts).toHaveLength(0);
  });
});
