import { describe, expect, it, vi, beforeEach } from "vitest";
import { RULE_CATEGORIES } from "@/server/brand-taste/calibration-signal-types";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";
import { GENERATION_DIRECTION_HEADER } from "@/server/ai/olhar/generation-direction";
import {
  artVariationContractFixture,
  campaignFixture,
  derivationConfigFromContract,
} from "@/server/ai/prompt-builder.test-fixtures";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";
import {
  createGenerationLog,
  finalizeGenerationLog,
} from "@/server/ai/generation-log";

vi.mock("@/server/repositories/calibration-rule", () => ({
  listApprovedCalibrationRulesByCategories: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/corpus-quality-cap", () => ({
  enforceCorpusQualityRuleCap: vi.fn(),
}));

vi.mock("@/server/repositories/rubric-calibration-adjustments", () => ({
  listAcceptedAdjustments: vi.fn(),
}));

vi.mock("@/server/ai/voices/voice-config-resolver", () => ({
  resolveVoiceForClientProfile: vi.fn().mockResolvedValue(null),
}));

import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { enforceCorpusQualityRuleCap } from "@/server/human-quality/learning/corpus-quality-cap";
import { listAcceptedAdjustments } from "@/server/repositories/rubric-calibration-adjustments";
import { loadPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";

const mockListRules = vi.mocked(listApprovedCalibrationRulesByCategories);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockEnforceCap = vi.mocked(enforceCorpusQualityRuleCap);
const mockListAccepted = vi.mocked(listAcceptedAdjustments);

const PROFILE_A = "profile-a";
const PROFILE_B = "profile-b";
const WORKSPACE = "ws-1";

const RULE_A_BRAND = rule({
  id: "rule-a-1",
  clientProfileId: PROFILE_A,
  category: "brand_nuance",
  rationale: "Warm nuance overlay for brand A",
});
const RULE_A_CORPUS = rule({
  id: "rule-a-corpus",
  clientProfileId: PROFILE_A,
  category: "corpus_quality",
  rationale: "weak_hierarchy: avoid visual clutter on brand A",
});
const RULE_B_BRAND = rule({
  id: "rule-b-brand",
  clientProfileId: PROFILE_B,
  category: "brand_nuance",
  rationale: "Distinct voice cadence for brand B",
});
const RULE_B_CORPUS = rule({
  id: "rule-b-1",
  clientProfileId: PROFILE_B,
  category: "corpus_quality",
  rationale: "weak_hierarchy: keep hierarchy stable on brand B",
});

const ACCEPTED_GLOBAL_ADJUSTMENT = {
  id: "global-adj-cross-client",
  adjustmentVersion: "1.1.0",
  status: "accepted" as const,
  targetModule: "score_ceiling" as const,
  targetKey: "weak_hierarchy",
  sliceKey: "weak_hierarchy|art_variation|1:1",
  rationale:
    "Cross-client weak_hierarchy: mean over-score 18.0 (n=6); current score_ceiling for weak_hierarchy is 55",
  evidenceRefs: {
    corpusItemIds: ["c1", "c2", "c3", "c4", "c5", "c6"],
    sliceStats: { count: 6, meanSignedDelta: 18, meanAbsError: 18 },
    itemRefs: [],
    fixtureOnly: false,
    supportingClientRuleIds: [RULE_A_CORPUS.id, RULE_B_CORPUS.id],
    primaryFailureReason: "weak_hierarchy",
    promotionSource: "cross_client" as const,
  },
  changeSpec: null,
  proposedAt: new Date("2026-06-24T12:00:00Z"),
  acceptedAt: new Date("2026-06-24T12:05:00Z"),
  acceptedBy: "owner-1",
  supersededAt: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectedReason: null,
  createdAt: new Date("2026-06-24T12:00:00Z"),
  updatedAt: new Date("2026-06-24T12:05:00Z"),
};

function rule(overrides: Partial<CalibrationRule> = {}): CalibrationRule {
  return {
    id: "rule-1",
    workspaceId: WORKSPACE,
    clientProfileId: PROFILE_A,
    category: "voice",
    status: "approved",
    rationale: "Default rationale",
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date("2026-06-20T12:00:00Z"),
    approvedBy: "user-1",
    createdAt: new Date("2026-06-20T12:00:00Z"),
    updatedAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

function calibratedSignals(clientProfileId: string): CalibrationSignal[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `sig-${clientProfileId}-${i}`,
    workspaceId: WORKSPACE,
    clientProfileId,
    campaignId: "camp-1",
    derivationId: `deriv-${clientProfileId}-${i}`,
    outputDecisionEventId: null,
    humanVerdict: "entra" as const,
    systemOlharVerdict: "pronta" as const,
    systemExportStatus: "pronta" as const,
    mismatchBucket: null,
    sourceLabel: "synthetic_fixture" as const,
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: null,
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
  }));
}

function setupTwoProfileMocks() {
  const brandCategories = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");

  mockListSignals.mockImplementation(async (input) =>
    calibratedSignals(input.clientProfileId)
  );

  mockListRules.mockImplementation(async (input) => {
    const isCorpus =
      input.categories.includes("corpus_quality") && input.categories.length === 1;
    const isBrand =
      input.categories.length === brandCategories.length &&
      input.categories.every((c) =>
        brandCategories.includes(c as (typeof RULE_CATEGORIES)[number])
      );

    if (input.clientProfileId === PROFILE_A) {
      if (isCorpus) return [RULE_A_CORPUS];
      if (isBrand) return [RULE_A_BRAND];
    }
    if (input.clientProfileId === PROFILE_B) {
      if (isCorpus) return [RULE_B_CORPUS];
      if (isBrand) return [RULE_B_BRAND];
    }
    return [];
  });

  mockEnforceCap.mockImplementation(async (input) => ({
    active: input.rules,
    deprecatedIds: [],
  }));

  mockListAccepted.mockResolvedValue([ACCEPTED_GLOBAL_ADJUSTMENT]);
}

describe("global promotion isolation (GLOBAL-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTwoProfileMocks();
  });

  it("profile A prompt contains only profile A corpus_quality rules after global adjustment accepted", async () => {
    const result = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_A,
    });

    expect(result.appliedCorpusRuleIds).toEqual([RULE_A_CORPUS.id]);
    expect(result.appliedCorpusRuleIds).not.toContain(RULE_B_CORPUS.id);
    expect(result.appliedCorpusRuleIds).not.toContain(ACCEPTED_GLOBAL_ADJUSTMENT.id);
  });

  it("profile B appliedCorpusRuleIds never includes profile A rule IDs", async () => {
    const result = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_B,
    });

    expect(result.appliedCorpusRuleIds).toEqual([RULE_B_CORPUS.id]);
    expect(result.appliedCorpusRuleIds).not.toContain(RULE_A_CORPUS.id);
    expect(result.appliedCorpusRuleIds).not.toContain(RULE_A_BRAND.id);
  });

  it("global score_ceiling rubric adjustment does not appear in prompt as corpus_quality constraint", async () => {
    const calibrationA = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_A,
    });
    const calibrationB = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_B,
    });

    const promptA = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), {
        campaign: campaignFixture({
          workspaceId: WORKSPACE,
          clientProfileId: PROFILE_A,
        }),
        brandTasteSection: calibrationA.brandTasteSection,
        corpusQualitySection: calibrationA.corpusQualitySection,
      })
    );
    const promptB = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), {
        campaign: campaignFixture({
          workspaceId: WORKSPACE,
          clientProfileId: PROFILE_B,
        }),
        brandTasteSection: calibrationB.brandTasteSection,
        corpusQualitySection: calibrationB.corpusQualitySection,
      })
    );

    for (const prompt of [promptA, promptB]) {
      expect(prompt).toContain("CORPUS QUALITY CONSTRAINTS");
      expect(prompt).toContain(GENERATION_DIRECTION_HEADER);
      expect(prompt).not.toContain("[corpus-quality:global-adj-cross-client]");
      expect(prompt).not.toContain(ACCEPTED_GLOBAL_ADJUSTMENT.rationale);
      expect(prompt).not.toContain("score_ceiling");
    }

    expect(promptA).toContain("[corpus-quality:rule-a-corpus]");
    expect(promptA).not.toContain("[corpus-quality:rule-b-1]");
    expect(promptB).toContain("[corpus-quality:rule-b-1]");
    expect(promptB).not.toContain("[corpus-quality:rule-a-corpus]");
  });

  it("generation log provenance excludes foreign profile and global adjustment IDs", async () => {
    const calibrationA = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_A,
    });
    const calibrationB = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_B,
    });

    const logA = finalizeGenerationLog(createGenerationLog("camp-a", "deriv-a"), {
      model: "gpt-image-1",
      appliedBrandRuleIds: calibrationA.appliedBrandRuleIds,
      appliedCorpusRuleIds: calibrationA.appliedCorpusRuleIds,
    });
    const logB = finalizeGenerationLog(createGenerationLog("camp-b", "deriv-b"), {
      model: "gpt-image-1",
      appliedBrandRuleIds: calibrationB.appliedBrandRuleIds,
      appliedCorpusRuleIds: calibrationB.appliedCorpusRuleIds,
    });

    expect(logA.appliedCorpusRuleIds).not.toContain(RULE_B_CORPUS.id);
    expect(logB.appliedCorpusRuleIds).not.toContain(RULE_A_CORPUS.id);
    expect(logA.appliedCorpusRuleIds).not.toContain(ACCEPTED_GLOBAL_ADJUSTMENT.id);
    expect(logB.appliedCorpusRuleIds).not.toContain(ACCEPTED_GLOBAL_ADJUSTMENT.id);
  });
});
