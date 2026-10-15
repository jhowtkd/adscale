import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: vi.fn() }));
vi.mock("@/server/repositories/calibration-signal", () => ({ listCalibrationSignalsForClientProfile: vi.fn() }));
vi.mock("@/server/repositories/output-decision-event", () => ({ listOutputDecisionEventsForClient: vi.fn() }));
vi.mock("@/server/equipe/module/adjustment-evidence", () => ({ listAdjustmentEvidenceForBrand: vi.fn() }));
vi.mock("@/server/repositories/calibration-rule", () => ({
  listCalibrationRulesForClientProfile: vi.fn(),
  insertCalibrationRule: vi.fn(),
}));

import { listOutputDecisionEventsForClient } from "@/server/repositories/output-decision-event";
import { listAdjustmentEvidenceForBrand } from "@/server/equipe/module/adjustment-evidence";
import { buildOutputDecisionEvent } from "@/server/repositories/output-decision-event.fixture";
import { getClientProfile } from "@/server/repositories/client-reference";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { listCalibrationRulesForClientProfile, insertCalibrationRule } from "@/server/repositories/calibration-rule";
import { generateLocalBrandTasteProposals } from "./local-brand-taste-proposals";
import type { CalibrationSignal } from "@/server/db/schema";

const scope = {
  workspaceId: "770e8400-e29b-41d4-a716-446655440001",
  clientProfileId: "770e8400-e29b-41d4-a716-446655440002",
};

const signal: CalibrationSignal = {
  ...scope, id: "signal-1", campaignId: "campaign-1", derivationId: "output-1",
  creativeWorkOutputId: null, outputDecisionEventId: null, humanVerdict: "nao_entra",
  systemOlharVerdict: "pronta", systemExportStatus: "pronta",
  mismatchBucket: "system_too_permissive", sourceLabel: "real_customer", reviewerId: "user-1",
  reviewedAt: new Date("2026-06-20T12:00:00Z"), createdAt: new Date("2026-06-20T12:00:00Z"),
  sanitizedNote: null, idempotencyKey: null,
} as CalibrationSignal;

describe("generateLocalBrandTasteProposals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClientProfile).mockResolvedValue({
      id: scope.clientProfileId, workspaceId: scope.workspaceId,
    } as NonNullable<Awaited<ReturnType<typeof getClientProfile>>>);
    vi.mocked(listCalibrationSignalsForClientProfile).mockResolvedValue([signal]);
    vi.mocked(listOutputDecisionEventsForClient).mockResolvedValue([]);
    vi.mocked(listAdjustmentEvidenceForBrand).mockResolvedValue([]);
    vi.mocked(listCalibrationRulesForClientProfile).mockResolvedValue([]);
    vi.mocked(insertCalibrationRule).mockImplementation(async (input) => ({ id: "rule-1", ...input } as never));
  });

  it("persists candidates as candidate rules for the authorized brand", async () => {
    const result = await generateLocalBrandTasteProposals(scope);
    expect(result).toMatchObject({ status: "generated", skipped: 0 });
    if (result.status !== "generated") throw new Error("expected generated");
    expect(result.created).toHaveLength(1);
    expect(listCalibrationSignalsForClientProfile).toHaveBeenCalledWith({ ...scope, prospective: true });
    expect(insertCalibrationRule).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: scope.workspaceId, clientProfileId: scope.clientProfileId,
      status: "candidate", category: "gestalt", supportingSignalIds: ["signal-1"],
    }));
  });

  it("presents categorized corrections without inventing a verdict and deduplicates typed evidence", async () => {
    vi.mocked(listCalibrationSignalsForClientProfile).mockResolvedValue([]);
    const decision = buildOutputDecisionEvent({ ...scope, id: "correction-1", action: "layer_regenerated",
      direction: "corrective", strength: "strong", contextSnapshot: { reason: { code: "voice", source: "feedback_category" }, notes: "Mais direto", layerId: "layer-1" } });
    vi.mocked(listOutputDecisionEventsForClient).mockResolvedValue([decision]);
    const first = await generateLocalBrandTasteProposals(scope);
    expect(first).toMatchObject({ status: "generated", created: [{ status: "candidate", category: "voice",
      confidence: "low", mismatchBucket: null, supportingSignalIds: [],
      supportingEvidenceRefs: [{ kind: "output_decision", id: "correction-1" }] }] });
    if (first.status !== "generated") throw new Error("expected generated");
    expect(first.created[0].caveats.join(" ")).toContain("Não é divergência medida do Olhar");
    expect(JSON.stringify(first)).not.toMatch(/scoreDelta|humanVerdict/);
    vi.mocked(listCalibrationRulesForClientProfile).mockResolvedValue(first.created);
    expect(await generateLocalBrandTasteProposals(scope)).toEqual({ status: "generated", created: [], skipped: 1 });
    expect(insertCalibrationRule).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a correction candidate when a later favorite joins the same Peça", async () => {
    vi.mocked(listCalibrationSignalsForClientProfile).mockResolvedValue([]);
    const decision = buildOutputDecisionEvent({ ...scope, id: "correction-1", action: "layer_regenerated", derivationId: "piece-1",
      direction: "corrective", strength: "strong", contextSnapshot: { reason: { code: "voice", source: "feedback_category" }, layerId: "layer-1" } });
    vi.mocked(listOutputDecisionEventsForClient).mockResolvedValue([decision]);
    const first = await generateLocalBrandTasteProposals(scope);
    if (first.status !== "generated") throw new Error("expected generated");
    vi.mocked(listCalibrationRulesForClientProfile).mockResolvedValue(first.created);
    const favorite = buildOutputDecisionEvent({ ...scope, id: "favorite-1", action: "favorited", derivationId: "piece-1", strength: "weak" });
    vi.mocked(listOutputDecisionEventsForClient).mockResolvedValue([decision, favorite]);
    expect(await generateLocalBrandTasteProposals(scope)).toEqual({ status: "generated", created: [], skipped: 1 });
    expect(insertCalibrationRule).toHaveBeenCalledTimes(1);
  });

  it("reads only current selection approvals for proposals", async () => {
    await generateLocalBrandTasteProposals(scope);
    expect(listCalibrationSignalsForClientProfile).toHaveBeenCalledWith(expect.objectContaining({ prospective: true }));
  });

  it("does not duplicate a candidate with the same scope and evidence set", async () => {
    vi.mocked(listCalibrationRulesForClientProfile).mockResolvedValue([{
      workspaceId: scope.workspaceId, clientProfileId: scope.clientProfileId,
      category: "gestalt", mismatchBucket: "system_too_permissive",
      supportingSignalIds: ["signal-1"], status: "candidate",
    } as never]);
    const result = await generateLocalBrandTasteProposals(scope);
    expect(result).toEqual({ status: "generated", created: [], skipped: 1 });
    expect(insertCalibrationRule).not.toHaveBeenCalled();
  });

  it("records the denial reason and creates nothing when the port refuses", async () => {
    const deny = vi.fn(async () => ({ allowed: false as const, reason: "local_learning_denied" as const }));
    await expect(generateLocalBrandTasteProposals(scope, deny)).resolves.toEqual({
      status: "denied", reason: "local_learning_denied",
    });
    expect(listCalibrationSignalsForClientProfile).not.toHaveBeenCalled();
    expect(insertCalibrationRule).not.toHaveBeenCalled();
  });
});
