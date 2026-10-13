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

  it("reads generation identity from the decision snapshot only, with unknown for history", async () => {
    const application = { role: "legacy_derivation", fixedPromptVersion: "unknown", setHash: null, appliedRefs: [] };
    for (const identity of [undefined, { state: "recorded", applications: [{ ...application, prompt: "PRIVATE" }] }]) {
      limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [{ kind: "output_decision", id }], supportingSignalIds: [], caveats: [] }]);
      limit.mockResolvedValueOnce([{ authorType: "human", action: "approved", strength: "strong", createdAt: new Date(), contextSnapshot: { generationIdentity: identity } }]);
      const report = await loadProposalEvidence(scope);
      expect(report?.support[0].generationIdentity).toEqual(identity ? { state: "recorded", applications: [application] } : { state: "unknown", applications: [] });
      expect(JSON.stringify(report)).not.toContain("PRIVATE");
    }
    expect(limit).toHaveBeenCalledTimes(4);
  });

  it("counts a corpus item, its evaluation and duplicate artifacts as one independent decision", async () => {
    const evaluationId = artifact.artifact.evaluationId;
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [
      { kind: "feedback_artifact", id }, { kind: "corpus_evaluation", id: evaluationId },
      { kind: "corpus_item", id: artifact.item.id }, { kind: "feedback_artifact", id },
    ], supportingSignalIds: [], caveats: [] }]);
    limit.mockResolvedValueOnce([artifact]);
    limit.mockResolvedValueOnce([{ item: artifact.item, evaluation: {
      intent: "regenerate", visualScore: 42, factualPass: true, primaryFailureReason: "weak_hierarchy",
    } }]);
    limit.mockResolvedValueOnce([artifact.item]);
    const report = await loadProposalEvidence(scope);
    expect(report?.counts).toEqual({ independentPieces: 1, independentDecisions: 1,
      unavailableReferences: 0, ungroupedReferences: 0 });
    expect(report?.support).toHaveLength(3);
  });

  it("groups repeated human decisions by the same piece without treating weak support as strong", async () => {
    const secondId = artifact.artifact.evaluationId;
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [
      { kind: "output_decision", id }, { kind: "output_decision", id: secondId },
    ], supportingSignalIds: [], caveats: [] }]);
    const decision = { authorType: "human", action: "favorited", strength: "weak",
      creativeWorkOutputId: artifact.item.id, contextSnapshot: {}, createdAt: new Date() };
    limit.mockResolvedValueOnce([decision]).mockResolvedValueOnce([{ key: "private-key" }]);
    limit.mockResolvedValueOnce([decision]).mockResolvedValueOnce([{ key: "private-key" }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.counts).toMatchObject({ independentPieces: 1, independentDecisions: 1 });
    expect(report?.support.map(ref => ref.strength)).toEqual(["weak", "weak"]);
    expect(JSON.stringify(report)).not.toContain("private-key");
  });

  it("shows free correction notes separately and groups alternatives from the same operation", async () => {
    const secondId = artifact.artifact.evaluationId;
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [
      { kind: "output_decision", id }, { kind: "output_decision", id: secondId },
    ], supportingSignalIds: [], caveats: [] }]);
    const snapshot = { operationId: "selection-1", reason: { code: "voice", source: "feedback_category" },
      notes: "Mais direto", otherReasonText: "Sem jargão", userFeedback: "Manter o nome" };
    limit.mockResolvedValueOnce([{ authorType: "human", action: "regenerated", strength: "strong",
      creativeWorkOutputId: artifact.item.id, contextSnapshot: snapshot, createdAt: new Date() }])
      .mockResolvedValueOnce([{ key: "private-key" }]);
    limit.mockResolvedValueOnce([{ authorType: "human", action: "alternative_not_selected", strength: "weak",
      creativeWorkOutputId: secondId, contextSnapshot: { operationId: "selection-1" }, createdAt: new Date() }])
      .mockResolvedValueOnce([{ key: "private-key-2" }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.counts.independentDecisions).toBe(1);
    expect(report?.support[0].summary).toContain("Mais direto");
    expect(report?.support[0].summary).toContain("Sem jargão");
    expect(report?.support[0].summary).toContain("Manter o nome");
    expect(report?.caveats.join(" ")).toContain("Sinais fracos");
  });

  it("does not count removed or unverifiable references as independent decisions", async () => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [
      { kind: "feedback_artifact", id }, { kind: "output_decision", id: artifact.artifact.evaluationId },
    ], supportingSignalIds: [], caveats: [] }]);
    limit.mockResolvedValueOnce([{ ...artifact, item: { ...artifact.item, status: "removed" } }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.counts).toEqual({ independentPieces: 0, independentDecisions: 0,
      unavailableReferences: 2, ungroupedReferences: 0 });
  });

  it("joins a verified Equipe event to its output projection without counting a missing version", async () => {
    const eventId = artifact.artifact.evaluationId;
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [{ kind: "output_decision", id }], supportingSignalIds: [], caveats: [] }]);
    limit.mockResolvedValueOnce([{ authorType: "human", action: "regenerated", strength: "strong",
      creativeWorkOutputId: artifact.item.id, equipeEventId: eventId, contextSnapshot: {}, createdAt: new Date() }]);
    limit.mockResolvedValueOnce([{ key: "private-key" }]);
    limit.mockResolvedValueOnce([{ event: { accountId: scope.workspaceId, objectType: "item", objectId: id,
      actorType: "client_person", eventType: "caption.edited", payload: { versionHash: "captured" }, occurredAt: new Date() } }]);
    limit.mockResolvedValueOnce([{ id: artifact.item.id }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support.map(ref => ref.kind)).toEqual(["output_decision", "equipe_event", "equipe_item_version"]);
    expect(report?.counts).toEqual({ independentPieces: 1, independentDecisions: 1,
      unavailableReferences: 1, ungroupedReferences: 0 });
  });

  it("groups an Item event and a direct decision through their verified shared piece, without counting the version as a vote", async () => {
    const eventId = artifact.artifact.evaluationId;
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [
      { kind: "output_decision", id }, { kind: "equipe_event", id: eventId },
    ], supportingSignalIds: [], caveats: [] }]);
    limit.mockResolvedValueOnce([{ authorType: "human", action: "regenerated", strength: "strong",
      creativeWorkOutputId: artifact.item.id, contextSnapshot: {}, createdAt: new Date() }]);
    limit.mockResolvedValueOnce([{ key: "private-key" }]);
    limit.mockResolvedValueOnce([{ event: { accountId: scope.workspaceId, objectType: "item", objectId: id,
      actorType: "client_person", eventType: "caption.edited", payload: { versionHash: "captured" }, occurredAt: new Date() } }]);
    limit.mockResolvedValueOnce([{ id: artifact.item.id }]);
    limit.mockResolvedValueOnce([{ version: { versionHash: "captured", caption: "Legenda", createdAt: new Date(),
      creativeWorkOutputId: artifact.item.id } }]);
    limit.mockResolvedValueOnce([{ key: "private-key" }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support).toHaveLength(3);
    expect(report?.counts).toEqual({ independentPieces: 1, independentDecisions: 1,
      unavailableReferences: 0, ungroupedReferences: 0 });
  });

  it.each(["calibration_signal", "output_decision"] as const)("does not expose agent %s as human proposal support", async (kind) => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [{ kind, id }], supportingSignalIds: [], caveats: [] }]);
    limit.mockResolvedValueOnce([{
      authorType: "agent", humanVerdict: "entra", sourceLabel: "real_customer", reviewedAt: new Date(),
      action: "approved", contextSnapshot: { reason: { text: "Somente o agente decidiu" } }, createdAt: new Date(),
      outputDecisionEventId: null,
    }]);
    const report = await loadProposalEvidence(scope);
    expect(report?.support).toEqual([{ kind, id,
      label: kind === "calibration_signal" ? "Sinal de calibração" : "Decisão sobre a Peça",
      availability: "unavailable", summary: null, pieceHref: null,
    }]);
    expect(report?.caveats.join(" ")).toContain("não foi possível conferir");
  });

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

  it.each([undefined, "human", "agent"])("keeps an ambiguous historical ID unavailable even with %s authorship", async (authorType) => {
    limit.mockResolvedValueOnce([{ supportingEvidenceRefs: [], supportingSignalIds: [id], caveats: [] }]);
    limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([artifact])
      .mockResolvedValueOnce([{ authorType, humanVerdict: "entra", sourceLabel: "real_customer", reviewedAt: new Date(), outputDecisionEventId: null }]);
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
