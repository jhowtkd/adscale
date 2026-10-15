import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { RULE_CATEGORIES } from "@/server/brand-taste/calibration-signal-types";
import { hashGuidanceContent, hashGuidanceSet, LEARNED_GUIDANCE_WRAPPERS } from "@/server/brand-taste/learned-guidance";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";

const mockBrandLookup = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: mockBrandLookup }));

vi.mock("@/server/repositories/visual-guidance-proof", () => ({
  loadVisualGuidanceProof: vi.fn(async () => null),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  listApprovedCalibrationRulesByCategories: vi.fn(),
  insertCalibrationRule: vi.fn(),
  updateCalibrationRuleStatus: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

// The local loader reads the brand's numeric selection. Each test still declares rules; the
// selection follows their current approved revision (revision = version) and resolves exact refs.
vi.mock("@/server/repositories/guidance-selection", async () => {
  const { listApprovedCalibrationRulesByCategories } = await import("@/server/repositories/calibration-rule");
  const { RULE_CATEGORIES } = await import("@/server/brand-taste/calibration-signal-types");
  const { hashGuidanceContent } = await import("@/server/brand-taste/learned-guidance");
  const ownRules = async (scope: { workspaceId: string; clientProfileId: string }) =>
    (await listApprovedCalibrationRulesByCategories({ ...scope, categories: [...RULE_CATEGORIES] }))
      .filter(rule => rule.workspaceId === scope.workspaceId && rule.clientProfileId === scope.clientProfileId);
  return {
    getGuidanceSelection: async (scope: { workspaceId: string; clientProfileId: string }) => ({ version: 1, pinnedBy: null, pinnedAt: null, previousSelection: null,
      refs: (await ownRules(scope)).filter(rule => rule.status === "approved")
        .map(rule => ({ ruleId: rule.id, revision: rule.version, contentHash: hashGuidanceContent(rule.rationale) })) }),
    resolveGuidanceSelection: async (scope: { workspaceId: string; clientProfileId: string }, refs: Array<{ ruleId: string; revision: number; contentHash: string }>) => {
      const rules = await ownRules(scope);
      return refs.map(ref => {
        const rule = rules.find(row => row.id === ref.ruleId);
        return { ref, currentStatus: rule?.status ?? null, retired: false, revision: rule ? { ruleId: rule.id, revisionNumber: ref.revision,
          status: rule.status, text: rule.rationale, category: rule.category, confirmedMetadata: rule.confirmedMetadata,
          metadataConfirmedBy: rule.metadataConfirmedBy, metadataConfirmedAt: rule.metadataConfirmedAt?.toISOString() ?? null } : null };
      });
    },
  };
});

import {
  insertCalibrationRule,
  listApprovedCalibrationRulesByCategories,
  updateCalibrationRuleStatus,
} from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import {
  loadLocalLearningPromptCalibrationContext,
  loadPromptCalibrationContext,
} from "@/server/brand-taste/prompt-calibration-loader";

const mockListRules = vi.mocked(listApprovedCalibrationRulesByCategories);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockInsertRule = vi.mocked(insertCalibrationRule);
const mockUpdateRule = vi.mocked(updateCalibrationRuleStatus);
const delivery = { role: "copy", generationMode: "single", format: "4:5", language: "en", fixedPromptVersion: "copy/v1" } as const;
const confirmedMetadata = { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["4:5"], contentHash: createHash("sha256").update("Warm tone", "utf8").digest("hex") } as const;

function rule(overrides: Partial<CalibrationRule> = {}): CalibrationRule {
  return {
    id: "rule-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    category: "voice",
    status: "approved",
    rationale: "Warm invitation tone",
    primaryFailureReason: null,
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    confirmedMetadata: null,
    metadataConfirmedBy: null,
    metadataConfirmedAt: null,
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
    creativeWorkOutputId: null,
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
      appliedRefs: [],
    });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
  });

  it("refuses new local delivery before loading evidence or a learned fragment", async () => {
    const authorize = vi.fn().mockResolvedValue({ allowed: false, reason: "local_learning_denied" });

    await expect(loadLocalLearningPromptCalibrationContext({
      workspaceId: "ws-1", clientProfileId: "client-1", role: "copy",
      generationMode: "single", format: "4:5", language: "en", fixedPromptVersion: "copy/v1",
    }, authorize)).resolves.toMatchObject({
      lines: [], appliedRefs: [], setHash: null, omissionReason: "local_learning_denied",
    });
    expect(authorize).toHaveBeenCalledWith({ workspaceId: "ws-1", clientProfileId: "client-1" });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
    expect(mockInsertRule).not.toHaveBeenCalled();
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });

  it("uses production authorization and delivers only confirmed text for the own brand without visual proof", async () => {
    const scope = {
      workspaceId: "770e8400-e29b-41d4-a716-446655440001",
      clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
    };
    mockBrandLookup.mockResolvedValue({ id: scope.clientProfileId, workspaceId: scope.workspaceId });
    mockListSignals.mockResolvedValue(Array.from({ length: 5 }, (_, i) => signal({
      ...scope, id: `sig-${i}`, derivationId: `deriv-${i}`,
    })));
    mockListRules.mockResolvedValue([rule({ ...scope, id: "brand-1", rationale: "Warm tone", confirmedMetadata,
        metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z") }), rule({ ...scope, id: "unconfirmed" })]);

    const result = await loadLocalLearningPromptCalibrationContext({ ...scope, ...delivery });

    expect(mockBrandLookup).toHaveBeenCalledWith(scope.workspaceId, scope.clientProfileId);
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(result.lines).toContain("Warm tone");
    expect(result.appliedRefs).toEqual([{ ruleId: "brand-1", revision: 1, contentHash: createHash("sha256").update("Warm tone", "utf8").digest("hex") }]);
    expect(result.omissions).toContainEqual({ ruleId: "unconfirmed", reason: "metadata_unconfirmed" });
  });

  it("uses the production refusal before new local delivery", async () => {
    mockBrandLookup.mockResolvedValue(null);
    await expect(loadLocalLearningPromptCalibrationContext({
      workspaceId: "770e8400-e29b-41d4-a716-446655440001",
      clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
      ...delivery,
    })).resolves.toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "brand_out_of_scope" });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(mockListRules).not.toHaveBeenCalled();
    expect(mockInsertRule).not.toHaveBeenCalled();
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });

  it("delivers visual guidance only with proof of the exact set and requested context", async () => {
    const input = { workspaceId: "ws-1", clientProfileId: "client-1", ...delivery };
    const visual = rule({ id: "visual", rationale: "Warm tone", confirmedMetadata: {
      ...confirmedMetadata, category: "brand_nuance", nature: "visual",
    }, metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z") });
    mockListRules.mockResolvedValue([visual]);
    const authorize = vi.fn().mockResolvedValue({ allowed: true });
    const appliedRefs = [{ ruleId: "visual", revision: 1, contentHash: confirmedMetadata.contentHash }];
    const proof = { ...input, status: "validated" as const, setHash: hashGuidanceSet(appliedRefs)! };
    const loadProof = vi.fn().mockResolvedValue(proof);
    const result = await loadLocalLearningPromptCalibrationContext(input, authorize, loadProof);
    expect(result.appliedRefs).toEqual(appliedRefs);
    expect(result.lines).toContain("Warm tone");
    expect(loadProof).toHaveBeenCalledWith({ ...input, setHash: proof.setHash, appliedRefs });
    for (const changed of [
      { workspaceId: "other" }, { clientProfileId: "other" }, { role: "image_prompt" },
      { generationMode: "carousel" }, { format: "1:1" }, { language: "pt-BR" },
      { fixedPromptVersion: "copy/v2" }, { setHash: "0".repeat(64) }, { status: "pending" },
    ]) {
      loadProof.mockResolvedValueOnce({ ...proof, ...changed });
      expect(await loadLocalLearningPromptCalibrationContext(input, authorize, loadProof)).toMatchObject({
        lines: [], appliedRefs: [], setHash: null, omissions: [{ ruleId: "visual", reason: "visual_proof_mismatch" }],
      });
    }
    const missing = await loadLocalLearningPromptCalibrationContext(input, authorize);
    expect(missing).toMatchObject({ lines: [], appliedRefs: [], setHash: null,
      omissions: [{ ruleId: "visual", reason: "visual_proof_missing" }] });
  });

  it("omits the entire confirmed set if either wrapper language exceeds D5 without truncating or writing", async () => {
    const overhead = LEARNED_GUIDANCE_WRAPPERS.en.reduce((sum, text) => sum + [...text].length, 0) + 6;
    const bodyLength = 1500 - overhead;
    const texts = [280, 280, 280, 280, bodyLength - 1120].map(length => "a".repeat(length));
    mockListRules.mockResolvedValue(texts.map((text, index) => rule({ id: `budget-${index}`, rationale: text,
      confirmedMetadata: { ...confirmedMetadata, contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z"),
    })));
    const input = { workspaceId: "ws-1", clientProfileId: "client-1", ...delivery };
    const authorize = vi.fn().mockResolvedValue({ allowed: true });
    const result = await loadLocalLearningPromptCalibrationContext(input, authorize);
    expect(result).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "budget_exceeded" });
    expect(mockInsertRule).not.toHaveBeenCalled();
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });

  it("keeps eligible text when unproved visual guidance is over budget", async () => {
    const long = "v".repeat(281);
    mockListRules.mockResolvedValue([
      rule({ id: "text", rationale: "Warm tone", confirmedMetadata,
        metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z") }),
      rule({ id: "visual", rationale: long, confirmedMetadata: { ...confirmedMetadata,
        category: "brand_nuance", nature: "visual", contentHash: hashGuidanceContent(long) },
        metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z") }),
    ]);
    const result = await loadLocalLearningPromptCalibrationContext({ workspaceId: "ws-1", clientProfileId: "client-1", ...delivery }, async () => ({ allowed: true }));
    expect(result.appliedRefs.map(ref => ref.ruleId)).toEqual(["text"]);
    expect(result.omissions).toContainEqual({ ruleId: "visual", reason: "visual_proof_missing" });
  });

  it.each([
    ["stale text", { rationale: "Texto alterado depois da confirmação" }, "metadata_stale"],
    ["missing author", { metadataConfirmedBy: null }, "metadata_unconfirmed"],
    ["missing date", { metadataConfirmedAt: null }, "metadata_unconfirmed"],
    ["unknown role", { confirmedMetadata: { ...confirmedMetadata, roles: ["researcher"] } }, "metadata_invalid"],
    ["incompatible category", { confirmedMetadata: { ...confirmedMetadata, category: "figure" } }, "category_mismatch"],
  ])("omits %s rather than inferring confirmed metadata", async (_name, changed, reason) => {
    mockListRules.mockResolvedValue([rule({ id: "rule", rationale: "Warm tone", confirmedMetadata,
      metadataConfirmedBy: "reviewer", metadataConfirmedAt: new Date("2026-10-01T00:00:00Z"), ...changed })]);
    expect(await loadLocalLearningPromptCalibrationContext({ workspaceId: "ws-1", clientProfileId: "client-1", ...delivery }, async () => ({ allowed: true })))
      .toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissions: [{ ruleId: "rule", reason }] });
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
      return [
        rule({ id: "brand-rule-1", category: "voice", rationale: "Warm tone" }),
        rule({ id: "export-rule-1", category: "export_conflict", rationale: "Literal export preference" }),
      ];
    });

    const result = await loadPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    });

    expect(result.appliedBrandRuleIds).toEqual(["brand-rule-1", "export-rule-1"]);
    expect(result.appliedBrandRuleIds).not.toContain("inline-0");
    expect(result.brandTasteSection.join("\n")).toContain("BRAND TASTE CONSTRAINTS");
    expect(result.brandTasteSection.join("\n")).toContain("[brand-taste:brand-rule-1]");
    expect(result.brandTasteSection).toContain("[brand-taste:export-rule-1] export_conflict: Literal export preference");
    expect(result.corpusQualitySection.join("\n")).toContain("CORPUS QUALITY CONSTRAINTS");
    expect(result.corpusQualitySection.join("\n")).toContain("[corpus-quality:corpus-rule-1]");
    expect(result.appliedCorpusRuleIds).toEqual(["corpus-rule-1"]);
    expect(result).toHaveProperty("appliedRefs", [
      { ruleId: "brand-rule-1", revision: "legacy", contentHash: createHash("sha256").update("Warm tone", "utf8").digest("hex") },
      { ruleId: "export-rule-1", revision: "legacy", contentHash: createHash("sha256").update("Literal export preference", "utf8").digest("hex") },
      { ruleId: "corpus-rule-1", revision: "legacy", contentHash: createHash("sha256").update("Keep CTA visible", "utf8").digest("hex") },
    ]);
    expect(mockBrandLookup).not.toHaveBeenCalled();
  });

  it("loads only the 10 newest approved corpus rules repeatedly without writes", async () => {
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
    const expectedRules = corpusRules.slice(-10);

    mockListSignals.mockResolvedValue(calibratedSignals);
    mockListRules.mockImplementation(async (input) => {
      if (input.categories.includes("corpus_quality") && input.categories.length === 1) {
        return repositoryRules;
      }
      if (input.categories.includes("corpus_quality")) return repositoryRules;
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
    const authorize = vi.fn().mockResolvedValue({ allowed: true });
    const local = await loadLocalLearningPromptCalibrationContext({
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      ...delivery,
    }, authorize);

    const writes = mockInsertRule.mock.calls.length + mockUpdateRule.mock.calls.length;
    expect(writes).toBe(0);
    expect(result.appliedCorpusRuleIds).toEqual(expectedRules.map((rule) => rule.id));
    expect(result.corpusQualitySection).toEqual([
      "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
      ...expectedRules.map((rule) => `[corpus-quality:${rule.id}] corpus_quality: ${rule.rationale}`),
      "Do not weaken factual text, CTA spelling, or export compliance.",
    ]);
    expect(repeated).toEqual(result);
    expect(authorize).toHaveBeenCalledWith({ workspaceId: "ws-1", clientProfileId: "client-1" });
    expect(local).toMatchObject({ lines: [], appliedRefs: [], setHash: null });
    expect(local.omissions).toHaveLength(12);
    expect(local.omissions.every(omission => omission.reason === "metadata_unconfirmed")).toBe(true);
    expect(repositoryRules).toEqual([...corpusRules].reverse());
    expect(corpusRules.every((rule) => rule.status === "approved")).toBe(true);
  });
});
