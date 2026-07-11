import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateOutputLearningsFromEvents } from "@/server/output-learning/aggregate";
import type { OutputDecisionEvent } from "@/server/db/schema";
import { getOutputLearningRecommendation } from "@/server/output-learning/recommendation/service";
import {
  buildAppliedLearningTrace,
  filterApprovedPostgresLearnings,
  guardOutputLearningPrefill,
} from "@/server/output-learning/safety/guards";
import {
  buildApprovedCtaClientOutputLearning,
  CLIENT_OUTPUT_LEARNING_IDS,
} from "@/server/repositories/client-output-learning.fixture";
import { evalMatrixKeys } from "../../../scripts/output-learning-eval-matrix";

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/client-output-learning", () => ({
  listOutputLearningsByClientProfile: vi.fn(),
}));

import { getCampaignById } from "@/server/repositories/campaign";
import { listOutputLearningsByClientProfile } from "@/server/repositories/client-output-learning";

function baseEvent(overrides: Partial<OutputDecisionEvent> = {}): OutputDecisionEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: "ws-1",
    userId: "user-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
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

const approvedCtaLearning = buildApprovedCtaClientOutputLearning();

describe("output learning pipeline eval (EVAL-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pipeline:cta-approval-aggregate", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      baseEvent(),
      baseEvent({
        id: crypto.randomUUID(),
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
      }),
    ]);

    const cta = drafts.find((d) => d.variableKey === "cta");
    expect(cta?.variableValue).toBe("Comprar agora");
    expect(cta?.supportingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(cta?.scopeGenerationMode).toBe("art_variation");
  });

  it("pipeline:rejection-avoid-pattern", () => {
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
    ]);

    const avoid = drafts.find((d) => d.variableKey === "avoid_pattern");
    expect(avoid?.variableValue).toBe("logo_distorted");
    expect(avoid?.preferenceDirection).toBe("avoid");
  });

  it("pipeline:regeneration-corrective", () => {
    const drafts = aggregateOutputLearningsFromEvents([
      baseEvent({
        action: "regenerated",
        direction: "corrective",
        contextSnapshot: {
          generationMode: "art_variation",
          format: "1:1",
          hardFailures: [{ code: "text_illegible", message: "Texto ilegível" }],
        },
      }),
    ]);

    const avoid = drafts.find((d) => d.variableKey === "avoid_pattern");
    expect(avoid?.variableValue).toBe("text_illegible");
    expect(avoid?.supportingEvidence.some((e) => e.polarity === "supporting")).toBe(true);
  });

  it("pipeline:contradicting-superseded", () => {
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

    const cta = drafts.find((d) => d.variableKey === "cta");
    expect(cta?.status).toBe("superseded");
    expect(cta?.contradictingEvidence.length).toBeGreaterThan(0);
  });

  it("pipeline:recommend-prefill-cta", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: "camp-1",
      clientProfileId: "profile-1",
      generationMode: "art_variation",
      ctaVariants: [],
    } as never);
    vi.mocked(listOutputLearningsByClientProfile).mockResolvedValue([approvedCtaLearning]);

    const result = await getOutputLearningRecommendation({
      workspaceId: "ws-1",
      campaignId: "camp-1",
    });

    expect(result.status).toBe("ready");
    expect(result.recommendation?.prefill.ctaVariants).toContain("Comprar agora");
    expect(result.recommendation?.appliedLearningTrace.learningsSource).toBe("postgres");
    expect(result.recommendation?.appliedLearningTrace.entries[0]?.applied).toBe(true);
  });

  it("safety:restyling-format-block", () => {
    const result = guardOutputLearningPrefill(
      {
        recipeId: "safe_iteration",
        generationMode: "format_adaptation",
        creativeLevel: "balanced",
        ctaVariants: ["Shop"],
        targetFormats: ["9:16"],
      },
      { campaignGenerationMode: "restyling" }
    );

    expect(result.prefill.generationMode).toBe("art_variation");
    expect(result.blockedFields[0]?.guardCode).toBe("factual_mode_conflict");
  });

  it("safety:postgres-approved-only", () => {
    const filtered = filterApprovedPostgresLearnings([
      approvedCtaLearning,
      { ...approvedCtaLearning, id: "draft", status: "draft" },
      { ...approvedCtaLearning, id: "old", status: "superseded" },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.status).toBe("approved");
  });

  it("safety:avoid-pattern-hint-only", () => {
    const avoidLearning = buildApprovedCtaClientOutputLearning({
      id: CLIENT_OUTPUT_LEARNING_IDS.avoidPattern,
      variableKey: "avoid_pattern",
      variableValue: "logo_distorted",
      preferenceDirection: "avoid",
      statement: "avoid logo_distorted",
    });

    const trace = buildAppliedLearningTrace({
      campaignId: "camp-1",
      algorithmVersion: "1.0.0",
      primaryLearning: approvedCtaLearning,
      supportingLearnings: [approvedCtaLearning],
      avoidPatternLearnings: [avoidLearning],
      blockedFields: [],
      prefillApplied: true,
    });

    const avoidEntry = trace.entries.find(
      (e) => e.learningId === CLIENT_OUTPUT_LEARNING_IDS.avoidPattern
    );
    expect(avoidEntry?.applied).toBe(false);
    expect(avoidEntry?.guardCode).toBe("avoid_pattern_hint_only");
    expect(trace.avoidPatternHints).toHaveLength(1);
  });

  it("covers every eval matrix scenario key", () => {
    const scenarioKeys = evalMatrixKeys().filter((key) => key.startsWith("pipeline:") || key.startsWith("safety:"));
    const testedKeys = [
      "pipeline:cta-approval-aggregate",
      "pipeline:rejection-avoid-pattern",
      "pipeline:regeneration-corrective",
      "pipeline:contradicting-superseded",
      "pipeline:recommend-prefill-cta",
      "safety:restyling-format-block",
      "safety:postgres-approved-only",
      "safety:avoid-pattern-hint-only",
    ];
    expect(testedKeys.sort()).toEqual(scenarioKeys.sort());
  });
});
