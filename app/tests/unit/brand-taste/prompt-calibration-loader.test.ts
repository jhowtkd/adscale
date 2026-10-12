import { describe, expect, it, vi, beforeEach } from "vitest";
import { RULE_CATEGORIES } from "@/server/brand-taste/calibration-signal-types";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";

vi.mock("@/server/repositories/calibration-rule", () => ({
  listApprovedCalibrationRulesByCategories: vi.fn(),
  insertCalibrationRule: vi.fn(),
  updateCalibrationRuleStatus: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

import {
  insertCalibrationRule,
  listApprovedCalibrationRulesByCategories,
  updateCalibrationRuleStatus,
} from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { loadPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";

const mockListRules = vi.mocked(listApprovedCalibrationRulesByCategories);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockInsertRule = vi.mocked(insertCalibrationRule);
const mockUpdateRule = vi.mocked(updateCalibrationRuleStatus);

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
    mockUpdateRule.mockResolvedValue(null);
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
  });

  it("loads approved corpus rules repeatedly without writes, even above the approval cap", async () => {
    const calibratedSignals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );
    const corpusRules = Array.from({ length: 12 }, (_, i) =>
      rule({
        id: `corpus-${i}`,
        category: "corpus_quality",
        rationale: `Rule ${i}`,
        approvedAt: new Date(`2026-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`),
      })
    );
    const repositoryRules = [...corpusRules].reverse();

    mockListSignals.mockResolvedValue(calibratedSignals);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return repositoryRules;
      }
      return [];
    });
    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });
    const repeated = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    const writes = mockInsertRule.mock.calls.length + mockUpdateRule.mock.calls.length;
    expect(writes).toBe(0);
    expect(result.appliedCorpusRuleIds).toEqual(corpusRules.map((rule) => rule.id));
    expect(result.corpusQualitySection).toEqual([
      "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
      ...corpusRules.map((rule) => `[corpus-quality:${rule.id}] corpus_quality: ${rule.rationale}`),
      "Do not weaken factual text, CTA spelling, or export compliance.",
    ]);
    expect(repeated).toEqual(result);
    expect(repositoryRules).toEqual([...corpusRules].reverse());
    expect(corpusRules.every((rule) => rule.status === "approved")).toBe(true);
  });
});
