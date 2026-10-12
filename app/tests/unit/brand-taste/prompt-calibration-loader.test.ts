import { describe, expect, it, vi, beforeEach } from "vitest";
import { RULE_CATEGORIES } from "@/server/brand-taste/calibration-signal-types";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";

const mockBrandLookup = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: mockBrandLookup }));

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
import {
  loadLocalLearningPromptCalibrationContext,
  loadPromptCalibrationContext,
} from "@/server/brand-taste/prompt-calibration-loader";

const mockListRules = vi.mocked(listApprovedCalibrationRulesByCategories);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockEnforceCap = vi.mocked(enforceCorpusQualityRuleCap);

function rule(overrides: Partial<CalibrationRule> = {}): CalibrationRule {
  return {
    id: "rule-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    category: "voice",
    status: "approved",
    rationale: "Warm invitation tone",
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

function signal(overrides: Partial<CalibrationSignal> = {}): CalibrationSignal {
  return {
    id: "sig-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    outputDecisionEventId: null,
    humanVerdict: "entra",
    systemOlharVerdict: "pronta",
    systemExportStatus: "pronta",
    mismatchBucket: null,
    sourceLabel: "synthetic_fixture",
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: null,
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("loadPromptCalibrationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceCap.mockImplementation(async (input) => ({
      active: input.rules.slice(0, 10),
      deprecatedIds: [],
    }));
  });

  it("returns empty sections and ID arrays when clientProfileId is null", async () => {
    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: null,
    });

    expect(result).toEqual({
      brandTasteSection: [],
      corpusQualitySection: [],
      appliedBrandRuleIds: [],
      appliedCorpusRuleIds: [],
    });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
  });

  it("refuses new local delivery before loading evidence or a learned fragment", async () => {
    const authorize = vi.fn().mockResolvedValue({ allowed: false, reason: "local_learning_denied" });

    await expect(loadLocalLearningPromptCalibrationContext({
      workspaceId: "ws-1", clientProfileId: "client-1",
    }, authorize)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(authorize).toHaveBeenCalledWith({ workspaceId: "ws-1", clientProfileId: "client-1" });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
    expect(mockEnforceCap).not.toHaveBeenCalled();
  });

  it("uses production authorization and delivers the existing fragment for the own brand", async () => {
    const scope = {
      workspaceId: "770e8400-e29b-41d4-a716-446655440001",
      clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
    };
    mockBrandLookup.mockResolvedValue({ id: scope.clientProfileId, workspaceId: scope.workspaceId });
    mockListSignals.mockResolvedValue(Array.from({ length: 5 }, (_, i) => signal({
      ...scope, id: `sig-${i}`, derivationId: `deriv-${i}`,
    })));
    mockListRules.mockImplementation(async (input) => input.categories.includes("corpus_quality")
      ? [] : [rule({ ...scope, id: "brand-1", rationale: "Warm tone" })]);

    const result = await loadLocalLearningPromptCalibrationContext(scope);

    expect(mockBrandLookup).toHaveBeenCalledWith(scope.workspaceId, scope.clientProfileId);
    expect(mockListSignals).toHaveBeenCalledWith(scope);
    expect(result.brandTasteSection.join("\n")).toContain("[brand-taste:brand-1] voice: Warm tone");
    expect(result.appliedBrandRuleIds).toEqual(["brand-1"]);
  });

  it("uses the production refusal before new local delivery", async () => {
    mockBrandLookup.mockResolvedValue(null);
    await expect(loadLocalLearningPromptCalibrationContext({
      workspaceId: "770e8400-e29b-41d4-a716-446655440001",
      clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
    })).rejects.toMatchObject({ reason: "brand_out_of_scope" });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
    expect(mockEnforceCap).not.toHaveBeenCalled();
  });

  it("queries brand-taste categories excluding corpus_quality", async () => {
    const brandCategories = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");
    const calibratedSignals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    mockListSignals.mockResolvedValue(calibratedSignals);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return [rule({ id: "corpus-1", category: "corpus_quality", rationale: "Avoid clutter" })];
      }
      if (
        input.categories.length === brandCategories.length &&
        input.categories.every((c) => brandCategories.includes(c as (typeof RULE_CATEGORIES)[number]))
      ) {
        return [rule({ id: "brand-1", category: "voice" })];
      }
      return [];
    });

    await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(mockListRules).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      categories: [...brandCategories],
    });
    expect(mockListRules).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      categories: ["corpus_quality"],
    });
  });

  it("skips brand-taste section for uncalibrated profiles with approved rules", async () => {
    mockListSignals.mockResolvedValue([]);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return [];
      }
      return [rule({ id: "brand-uncalibrated", category: "voice" })];
    });

    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(result.brandTasteSection).toEqual([]);
    expect(result.appliedBrandRuleIds).toEqual([]);
  });

  it("returns real brand rule IDs and corpus section for calibrated profile", async () => {
    mockBrandLookup.mockRejectedValue(new Error("Local learning refused"));
    const calibratedSignals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    mockListSignals.mockResolvedValue(calibratedSignals);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return [
          rule({
            id: "corpus-rule-1",
            category: "corpus_quality",
            rationale: "Keep CTA visible",
          }),
        ];
      }
      return [rule({ id: "brand-rule-1", category: "voice", rationale: "Warm tone" })];
    });

    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(result.appliedBrandRuleIds).toEqual(["brand-rule-1"]);
    expect(result.appliedBrandRuleIds).not.toContain("inline-0");
    expect(result.brandTasteSection.join("\n")).toContain("BRAND TASTE CONSTRAINTS");
    expect(result.brandTasteSection.join("\n")).toContain("[brand-taste:brand-rule-1]");
    expect(result.corpusQualitySection.join("\n")).toContain("CORPUS QUALITY CONSTRAINTS");
    expect(result.corpusQualitySection.join("\n")).toContain("[corpus-quality:corpus-rule-1]");
    expect(result.appliedCorpusRuleIds).toEqual(["corpus-rule-1"]);
    expect(mockBrandLookup).not.toHaveBeenCalled();
  });

  it("enforces corpus quality cap via enforceCorpusQualityRuleCap", async () => {
    const calibratedSignals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );
    const corpusRules = Array.from({ length: 12 }, (_, i) =>
      rule({
        id: `corpus-${i}`,
        category: "corpus_quality",
        rationale: `Rule ${i}`,
      })
    );
    const cappedRules = corpusRules.slice(0, 10);

    mockListSignals.mockResolvedValue(calibratedSignals);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return corpusRules;
      }
      return [];
    });
    mockEnforceCap.mockResolvedValue({
      active: cappedRules,
      deprecatedIds: ["corpus-10", "corpus-11"],
    });

    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(mockEnforceCap).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      rules: corpusRules,
    });
    expect(result.appliedCorpusRuleIds).toHaveLength(10);
    expect(result.appliedCorpusRuleIds[0]).toBe("corpus-0");
    expect(result.appliedCorpusRuleIds[9]).toBe("corpus-9");
  });
});
