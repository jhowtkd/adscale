import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProposalEvidence } from "./proposal-evidence";

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("../db", () => ({ db: {
  select: () => {
    const query = { from: () => query, innerJoin: () => query, where: () => query, limit };
    return query;
  },
} }));

const scope = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  clientProfileId: "22222222-2222-4222-8222-222222222222",
  proposalKind: "rule" as const,
  proposalId: "33333333-3333-4333-8333-333333333333",
};
const id = "44444444-4444-4444-8444-444444444444";
const artifact = { artifact: { id, evaluationId: "55555555-5555-4555-8555-555555555555",
  sourceLabel: "synthetic_fixture", payload: { evaluation: { intent: "regenerate", primaryFailureReason: "weak_hierarchy" } } },
  item: { id: "66666666-6666-4666-8666-666666666666", status: "evaluated", derivationId: null } };

describe("proposal evidence resolution without a database", () => {
  beforeEach(() => { limit.mockReset(); limit.mockResolvedValue([]); });

  it("resolves historical artifact IDs as artifacts rather than claiming they are calibration signals", async () => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [], supportingSignalIds: [id], caveats: [] }]);
    // Historical candidates in order: item, evaluation, artifact, signal, decision, event, version.
    limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([artifact]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support[0]).toMatchObject({ kind: "feedback_artifact", id, availability: "available",
      summary: "Regenerar · Hierarquia fraca", sourceLabel: "synthetic_fixture", pieceHref: null });
    expect(report?.support.some(ref => ref.kind === "calibration_signal")).toBe(false);
    expect(report?.support.slice(1).map(ref => ref.kind)).toEqual(["corpus_item", "corpus_evaluation"]);
    expect(report?.caveats.join(" ")).toContain("não foi possível conferir");
  });

  it("keeps a historical ID unavailable when two actual types match", async () => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [], supportingSignalIds: [id], caveats: [] }]);
    limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([artifact])
      .mockResolvedValueOnce([{ humanVerdict: "entra", sourceLabel: "real_customer", reviewedAt: new Date(), outputDecisionEventId: null }]);
    expect((await loadProposalEvidence(scope))?.support).toEqual([
      { kind: "legacy", id, label: "Referência histórica", availability: "unavailable", summary: null, pieceHref: null },
    ]);
  });

  it("never reinterprets a missing typed reference as a different kind", async () => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [{ kind: "calibration_signal", id }], supportingSignalIds: [], caveats: [] }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support[0]).toMatchObject({ kind: "calibration_signal", availability: "unavailable", summary: null, pieceHref: null });
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it("withholds removed evidence content and its linked references", async () => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [{ kind: "feedback_artifact", id }], supportingSignalIds: [], caveats: ["Ressalva original"] }]);
    limit.mockResolvedValueOnce([{ ...artifact, item: { ...artifact.item, status: "removed" } }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support).toHaveLength(1);
    expect(report?.support[0]).toMatchObject({ availability: "removed", summary: null, pieceHref: null });
    expect(report?.support[0]).not.toHaveProperty("sourceLabel");
    expect(report?.caveats).toContain("Ressalva original");
  });
});
