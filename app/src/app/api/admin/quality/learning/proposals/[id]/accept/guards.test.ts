import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientLearningProposal } from "@/server/db/schema";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { POST } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn().mockResolvedValue({ user: { id: "owner-1" } }) }));
vi.mock("@/server/repositories/client-learning-proposal", () => ({ getClientLearningProposalById: vi.fn(), markProposalAccepted: vi.fn() }));
vi.mock("@/server/repositories/calibration-rule", () => ({ insertCalibrationRule: vi.fn(), listApprovedCalibrationRulesByCategories: vi.fn().mockResolvedValue([]) }));
vi.mock("@/server/repositories/human-quality-corpus", () => ({ listEvaluatedCorpusWithEvaluations: vi.fn() }));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: vi.fn() }));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));

import { getClientLearningProposalById, markProposalAccepted } from "@/server/repositories/client-learning-proposal";
import { insertCalibrationRule } from "@/server/repositories/calibration-rule";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { getClientProfile } from "@/server/repositories/client-reference";

const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const clientProfileId = "550e8400-e29b-41d4-a716-446655440002";
const id = "550e8400-e29b-41d4-a716-446655440003";
let proposal: ClientLearningProposal;
let rows: EvaluatedCorpusRow[];

function accept(body: unknown = { acknowledgeFixtureOnly: true }) {
  return POST(new Request(`http://localhost/api/admin/quality/learning/proposals/${id}/accept`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

describe("Synthetic acknowledgment through HTTP and the real proposal service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = ["a", "b", "c"].map(itemId => ({
      item: { id: itemId, workspaceId, clientProfileId, generationMode: "art_variation", format: "1:1",
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } },
      evaluation: { id: `evaluation-${itemId}`, workspaceId, corpusItemId: itemId, visualScore: 62,
        factualPass: true, intent: "reject", primaryFailureReason: "visual_overload", createdAt: new Date("2026-10-01") },
      sourceLabel: "synthetic_fixture",
    } as EvaluatedCorpusRow));
    proposal = { id, workspaceId, clientProfileId, status: "proposed",
      sliceKey: `${workspaceId}:${clientProfileId}:visual_overload|art_variation|1:1`,
      primaryFailureReason: "visual_overload", rationale: "Use um foco dominante.",
      evidenceRefs: { corpusItemIds: ["a", "b", "c"], fixtureOnly: true,
        stats: { count: 3, meanSignedDelta: 18, meanAbsError: 18, overScoreCount: 3, underScoreCount: 0 } },
    } as ClientLearningProposal;
    vi.mocked(getClientLearningProposalById).mockImplementation(async () => proposal);
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockImplementation(async () => rows);
    vi.mocked(getCorpusConsent).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(getClientProfile).mockResolvedValue({ id: clientProfileId, workspaceId } as never);
    vi.mocked(insertCalibrationRule).mockResolvedValue({ id: "rule-1" } as never);
    vi.mocked(markProposalAccepted).mockImplementation(async (_id, _actor, ruleInput) => ({ proposal: { ...proposal, status: "accepted" }, rule: await insertCalibrationRule(ruleInput) }));
  });

  it.each([
    ["rejected", 404, "not_proposed"], ["scope", 403, "brand_out_of_scope"],
    ["consent", 403, "client_consent_required"], ["objective", 422, "insufficient_evidence"],
    ["export", 422, "insufficient_evidence"], ["evidence-scope", 422, "insufficient_evidence"],
  ] as const)("confirmation does not bypass %s", async (invalid, status, code) => {
    if (invalid === "rejected") proposal.status = "rejected";
    if (invalid === "scope") vi.mocked(getClientProfile).mockResolvedValue(null);
    if (invalid === "consent") vi.mocked(getCorpusConsent).mockResolvedValue(null);
    if (invalid === "objective") rows[0].evaluation.factualPass = false;
    if (invalid === "export") rows[0].item.qualitySnapshot.exportStatus = { value: "bloqueado" };
    if (invalid === "evidence-scope") rows[0].item.clientProfileId = "another-brand";
    const response = await accept();
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(insertCalibrationRule).not.toHaveBeenCalled();
    expect(markProposalAccepted).not.toHaveBeenCalled();
  });

  it("requires a boolean explicit confirmation and records the synthetic caveat on valid acceptance", async () => {
    expect((await accept({})).status).toBe(422);
    expect((await accept({ acknowledgeFixtureOnly: "true" })).status).toBe(400);
    expect(insertCalibrationRule).not.toHaveBeenCalled();
    expect((await accept()).status).toBe(200);
    expect(insertCalibrationRule).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: "owner-1", caveats: ["fixture_only_corpus"] }));
  });
});
