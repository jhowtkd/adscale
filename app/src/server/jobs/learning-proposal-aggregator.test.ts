import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  inngest: { createFunction: (opts: unknown, fn: unknown) => ({ opts, fn }) },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: vi.fn() }));
vi.mock("@/server/repositories/calibration-signal", () => ({ listCalibrationSignalsForClientProfile: vi.fn() }));
vi.mock("@/server/human-quality/learning/generate", () => ({ generateAndPersistClientLearningProposals: vi.fn() }));
vi.mock("@/server/human-quality/learning/cross-client", () => ({ detectAndPersistCrossClientGlobalProposals: vi.fn() }));
vi.mock("@/server/human-quality/learning/factual-alerts", () => ({ listFactualIssueAlerts: vi.fn() }));
vi.mock("./local-brand-taste-proposals", () => ({ generateAllLocalBrandTasteProposals: vi.fn() }));

import { getClientProfile } from "@/server/repositories/client-reference";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
import { generateAllLocalBrandTasteProposals } from "./local-brand-taste-proposals";
import { extractLocalBrandTasteProposals, learningProposalAggregatorJob } from "./learning-proposal-aggregator";
import type { CalibrationSignal } from "@/server/db/schema";

const scope = {
  workspaceId: "770e8400-e29b-41d4-a716-446655440001",
  clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
};

describe("learning proposal authorization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("refuses local taste extraction before reading evidence", async () => {
    const authorize = vi.fn().mockResolvedValue({ allowed: false, reason: "local_learning_denied" });

    await expect(extractLocalBrandTasteProposals(scope, authorize))
      .rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(authorize).toHaveBeenCalledWith(scope);
    expect(listCalibrationSignalsForClientProfile).not.toHaveBeenCalled();
  });

  it("uses production authorization before local taste extraction", async () => {
    vi.mocked(getClientProfile).mockResolvedValue(null);

    await expect(extractLocalBrandTasteProposals(scope))
      .rejects.toMatchObject({ reason: "brand_out_of_scope" });
    expect(getClientProfile).toHaveBeenCalledWith(scope.workspaceId, scope.clientProfileId);
    expect(listCalibrationSignalsForClientProfile).not.toHaveBeenCalled();
  });

  it.each(["synthetic_fixture", "operator_imported", "real_customer"])("extracts own-brand candidates without treating %s as authorization", async (sourceLabel) => {
    vi.mocked(getClientProfile).mockResolvedValue({
      id: scope.clientProfileId, workspaceId: scope.workspaceId,
    } as NonNullable<Awaited<ReturnType<typeof getClientProfile>>>);
    const signal: CalibrationSignal = {
      ...scope, id: "signal-1", campaignId: "campaign-1", derivationId: "output-1",
      creativeWorkOutputId: null,
      outputDecisionEventId: null, humanVerdict: "nao_entra",
      systemOlharVerdict: "pronta", systemExportStatus: "pronta",
      mismatchBucket: "system_too_permissive", sourceLabel, reviewerId: "user-1",
      reviewedAt: new Date("2026-06-20T12:00:00Z"), createdAt: new Date("2026-06-20T12:00:00Z"),
      sanitizedNote: null, idempotencyKey: null,
    };
    vi.mocked(listCalibrationSignalsForClientProfile).mockResolvedValue([signal]);

    expect(await extractLocalBrandTasteProposals(scope)).toMatchObject([{
      clientProfileId: scope.clientProfileId, status: "candidate", category: "gestalt",
      supportingDecisionIds: ["signal-1"],
    }]);
    expect(getClientProfile).toHaveBeenCalledWith(scope.workspaceId, scope.clientProfileId);
    expect(listCalibrationSignalsForClientProfile).toHaveBeenCalledWith(scope);
    expect(generateAndPersistClientLearningProposals).not.toHaveBeenCalled();
  });

  it("keeps the legacy corpus cron independent of local learning authorization", async () => {
    vi.mocked(getClientProfile).mockRejectedValue(new Error("Local learning refused"));
    vi.mocked(generateAndPersistClientLearningProposals).mockResolvedValue({ generated: 2, proposals: [] });
    vi.mocked(detectAndPersistCrossClientGlobalProposals).mockResolvedValue([]);
    vi.mocked(listFactualIssueAlerts).mockResolvedValue([]);
    vi.mocked(generateAllLocalBrandTasteProposals).mockResolvedValue({ brands: 0, created: 0, denied: 0 });

    const job = learningProposalAggregatorJob as unknown as {
      fn: (input: { step: { run: (name: string, task: () => unknown) => Promise<unknown> } }) => Promise<unknown>;
    };
    const result = await job.fn({ step: { run: async (_name, task) => task() } });

    expect(result).toEqual({ generated: 2, globalProposals: 0, factualAlerts: 0, localTaste: { brands: 0, created: 0, denied: 0 } });
    expect(generateAndPersistClientLearningProposals).toHaveBeenCalledWith();
    expect(getClientProfile).not.toHaveBeenCalled();
    expect(listCalibrationSignalsForClientProfile).not.toHaveBeenCalled();
  });
});
