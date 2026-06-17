import { describe, expect, it } from "vitest";
import type { ClientOutputLearning } from "../../db/schema";
import {
  buildAppliedLearningTrace,
  filterApprovedPostgresLearnings,
  guardOutputLearningPrefill,
} from "./guards";

const baseLearning: ClientOutputLearning = {
  id: "learning-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  variableKey: "style_policy",
  variableValue: "extreme",
  scopeGenerationMode: "",
  scopeFormat: "",
  preferenceDirection: "prefer",
  statement: "prefer extreme style",
  confidence: "high",
  confidenceScore: "0.9",
  sampleEventCount: 3,
  sampleCampaignCount: 1,
  supportingEvidence: [{ eventId: "evt-1", polarity: "supporting", strength: "strong" }],
  contradictingEvidence: [],
  algorithmVersion: "1.0.0",
  status: "approved",
  mem0MemoryId: null,
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEvidenceAt: new Date(),
};

describe("filterApprovedPostgresLearnings", () => {
  it("keeps only approved learnings (SAFE-02)", () => {
    const filtered = filterApprovedPostgresLearnings([
      baseLearning,
      { ...baseLearning, id: "draft", status: "draft" },
      { ...baseLearning, id: "superseded", status: "superseded" },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("learning-1");
  });
});

describe("guardOutputLearningPrefill", () => {
  it("blocks format_adaptation prefill on restyling campaigns (SAFE-01)", () => {
    const result = guardOutputLearningPrefill(
      {
        recipeId: "safe_iteration",
        generationMode: "format_adaptation",
        creativeLevel: "balanced",
        ctaVariants: ["Shop Now"],
        targetFormats: ["9:16"],
      },
      { campaignGenerationMode: "restyling" }
    );

    expect(result.prefill.generationMode).toBe("art_variation");
    expect(result.blockedFields).toHaveLength(1);
    expect(result.blockedFields[0]?.guardCode).toBe("factual_mode_conflict");
  });

  it("caps creative level when readiness is blocked (SAFE-01)", () => {
    const result = guardOutputLearningPrefill(
      {
        recipeId: "visual_differentiation",
        generationMode: "art_variation",
        creativeLevel: "extreme",
        ctaVariants: ["Buy"],
      },
      { readinessStatus: "blocked" }
    );

    expect(result.prefill.creativeLevel).toBe("conservative");
    expect(result.prefill.recipeId).toBe("safe_iteration");
    expect(result.blockedFields.length).toBeGreaterThanOrEqual(2);
  });

  it("caps aggressive creative on format_adaptation for identity lock (SAFE-01)", () => {
    const result = guardOutputLearningPrefill(
      {
        recipeId: "visual_differentiation",
        generationMode: "format_adaptation",
        creativeLevel: "bold",
        ctaVariants: ["CTA"],
        targetFormats: ["4:5"],
      },
      {}
    );

    expect(result.prefill.creativeLevel).toBe("balanced");
    expect(result.blockedFields[0]?.guardCode).toBe("format_identity_creative_cap");
  });
});

describe("buildAppliedLearningTrace", () => {
  it("marks avoid patterns as non-applied hints (SAFE-04)", () => {
    const avoidLearning = {
      ...baseLearning,
      id: "avoid-1",
      variableKey: "avoid_pattern",
      variableValue: "logo_distorted",
      preferenceDirection: "avoid",
      statement: "avoid logo_distorted",
    };

    const trace = buildAppliedLearningTrace({
      campaignId: "campaign-1",
      algorithmVersion: "1.0.0",
      primaryLearning: baseLearning,
      supportingLearnings: [baseLearning],
      avoidPatternLearnings: [avoidLearning],
      blockedFields: [],
      prefillApplied: true,
    });

    const avoidEntry = trace.entries.find((entry) => entry.learningId === "avoid-1");
    expect(avoidEntry?.applied).toBe(false);
    expect(avoidEntry?.guardCode).toBe("avoid_pattern_hint_only");
    expect(trace.avoidPatternHints).toHaveLength(1);
    expect(trace.entries[0]?.evidenceEventIds).toEqual(["evt-1"]);
    expect(trace.learningsSource).toBe("postgres");
  });
});
