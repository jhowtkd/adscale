import { describe, expect, it, vi, beforeEach } from "vitest";
import { RULE_CATEGORIES } from "@/server/brand-taste/calibration-signal-types";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";

vi.mock("@/server/repositories/calibration-rule", () => ({
  listApprovedCalibrationRulesByCategories: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/corpus-quality-cap", () => ({
  enforceCorpusQualityRuleCap: vi.fn(),
}));

import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { enforceCorpusQualityRuleCap } from "@/server/human-quality/learning/corpus-quality-cap";
import { loadPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";

const mockListRules = vi.mocked(listApprovedCalibrationRulesByCategories);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockEnforceCap = vi.mocked(enforceCorpusQualityRuleCap);

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
  rationale: "layout: avoid visual clutter on brand A",
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
  rationale: "cta_drift: keep CTA placement stable on brand B",
});

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
}

describe("loader isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTwoProfileMocks();
  });

  it("returns profile-scoped rule IDs for profile A with no profile B contamination", async () => {
    const result = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_A,
    });

    expect(result.appliedBrandRuleIds).toEqual(["rule-a-1"]);
    expect(result.appliedCorpusRuleIds).toEqual(["rule-a-corpus"]);
    expect(result.appliedBrandRuleIds).not.toContain("rule-b-brand");
    expect(result.appliedCorpusRuleIds).not.toContain("rule-b-1");
    expect(result.brandTasteSection.join("\n")).toContain("[brand-taste:rule-a-1]");
    expect(result.corpusQualitySection.join("\n")).toContain(
      "[corpus-quality:rule-a-corpus]"
    );
  });

  it("returns profile-scoped rule IDs for profile B with no profile A contamination", async () => {
    const result = await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_B,
    });

    expect(result.appliedBrandRuleIds).toEqual(["rule-b-brand"]);
    expect(result.appliedCorpusRuleIds).toEqual(["rule-b-1"]);
    expect(result.appliedBrandRuleIds).not.toContain("rule-a-1");
    expect(result.appliedCorpusRuleIds).not.toContain("rule-a-corpus");
    expect(result.brandTasteSection.join("\n")).toContain("[brand-taste:rule-b-brand]");
    expect(result.corpusQualitySection.join("\n")).toContain("[corpus-quality:rule-b-1]");
  });

  it("passes clientProfileId to repository on every rule and signal fetch", async () => {
    await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_A,
    });
    await loadPromptCalibrationContext({
      workspaceId: WORKSPACE,
      clientProfileId: PROFILE_B,
    });

    const brandCategories = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");

    for (const profileId of [PROFILE_A, PROFILE_B]) {
      expect(mockListSignals).toHaveBeenCalledWith({
        workspaceId: WORKSPACE,
        clientProfileId: profileId,
      });
      expect(mockListRules).toHaveBeenCalledWith({
        workspaceId: WORKSPACE,
        clientProfileId: profileId,
        categories: [...brandCategories],
      });
      expect(mockListRules).toHaveBeenCalledWith({
        workspaceId: WORKSPACE,
        clientProfileId: profileId,
        categories: ["corpus_quality"],
      });
    }
  });
});
