import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), allowed: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: mocks.allowed }));
vi.mock("@/server/brand-taste/local-learning-authorization", () => ({ requireLocalLearningAuthorization: vi.fn() }));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: vi.fn() }));
vi.mock("@/server/repositories/human-quality-corpus", () => ({ listEvaluatedCorpusWithEvaluations: vi.fn() }));
vi.mock("@/server/repositories/human-quality-feedback-artifact", () => ({ listFeedbackArtifactIdsByCorpusItemIds: vi.fn() }));
import { requireLocalLearningAuthorization } from "@/server/brand-taste/local-learning-authorization";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { calibrationRules } from "@/server/db/schema";
import { editLearningProposal, approveLearningProposal } from "./proposal-approval";
import { CORRECTION_CANDIDATE_RATIONALE_PREFIX, correctionCandidateRationale, learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
const metadata = { category: "voice" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"] };
function row(text = "Original", kind = "corpus_quality") {
  return { id: "p", workspaceId: "ws", clientProfileId: "brand", sliceKey: "ws:brand:visual_overload|art_variation|1:1", rationale: "Original", status: kind === "rule" ? "candidate" : "proposed",
    confidence: "high", supportingSignalIds: ["s1", "s2"], supportingEvidenceRefs: [], caveats: [], category: "voice", version: 1, createdAt: new Date(), updatedAt: new Date(),
    evidenceRefs: { corpusItemIds: ["a", "b", "c"], fixtureOnly: true }, primaryFailureReason: "visual_overload",
    proposalDraft: { originalText: "Original", editedText: text, revision: 1, editedBy: "owner", editedByName: "Dono", editedAt: new Date().toISOString(), metadata: { ...metadata, contentHash: hashGuidanceContent(text) } },
  };
}
function fake(rows: unknown[][], proposal: ReturnType<typeof row>, rule?: object) {
  if (proposal.status === "proposed" && rows.length >= 4) rows.splice(3, 0, [{ status: "granted" }]);
  const writes: { type: string; value: Record<string, unknown> }[] = [];
  const tx = {
    select: () => { const values = rows.shift() ?? []; const query = { from: () => query, where: () => query, for: () => query, limit: async () => values, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(values).then(resolve) }; return query; },
    update: (table: unknown) => { let patch: Record<string, unknown>; const query = { set: (value: Record<string, unknown>) => { patch = value; writes.push({ type: "update", value }); return query; }, where: () => query, returning: async () => [{ ...proposal, ...(table === calibrationRules ? rule : {}), ...patch }], then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve) }; return query; },
    insert: () => ({ values: (value: Record<string, unknown>) => { writes.push({ type: "insert", value }); return { returning: async () => [{ ...proposal, ...value, id: "new-rule", approvedAt: new Date() }] }; } }),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return writes;
}
const actor = [{ id: "owner", name: "Dono", email: "owner@example.com" }];
function evidenceRows(): EvaluatedCorpusRow[] {
  return ["a", "b", "c"].map(id => ({
    item: { id, derivationId: `deriv-${id}`, workspaceId: "ws", clientProfileId: "brand", generationMode: "art_variation", format: "1:1", qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } },
    evaluation: { id: `eval-${id}`, workspaceId: "ws", corpusItemId: id, visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: "visual_overload", createdAt: new Date() },
    sourceLabel: "synthetic_fixture",
  } as EvaluatedCorpusRow));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.allowed.mockReturnValue(true);
  vi.mocked(requireLocalLearningAuthorization).mockResolvedValue(undefined);
  vi.mocked(getCorpusConsent).mockResolvedValue({ status: "granted" } as never);
  vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(evidenceRows());
  vi.mocked(listFeedbackArtifactIdsByCorpusItemIds).mockResolvedValue(new Map());
});
describe("atomic proposal review commands", () => {
  it.each(["workspace_owner", "workspace_admin", "operator", "agent"])("denies %s without any proposal read or write", async reviewerUserId => {
    mocks.allowed.mockReturnValue(false);
    const proposal = row(); const writes = fake([[{ id: reviewerUserId, email: `${reviewerUserId}@example.com` }]], proposal);
    await expect(editLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId, expectedRevision: "a", text: "x", metadata })).rejects.toMatchObject({ code: "forbidden" });
    fake([[{ id: reviewerUserId, email: `${reviewerUserId}@example.com` }]], proposal);
    await expect(approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId, expectedRevision: "a" })).rejects.toMatchObject({ code: "forbidden" });
    expect(writes).toEqual([]);
  });
  it.each(["corpus_quality", "rule"] as const)("stale %s save and approve return authoritative current state and write nothing", async kind => {
    const proposal = row("Newer", kind);
    const input = { kind, proposalId: "p", reviewerUserId: "owner", expectedRevision: "old" };
    const writes = fake([actor, [proposal]], proposal);
    await expect(editLearningProposal({ ...input, text: "Stale", metadata })).rejects.toMatchObject({ code: "revision_conflict", current: { proposalDraft: { editedText: "Newer" }, expectedRevision: learningProposalRevision(kind, proposal) } });
    fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal(input)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(writes).toEqual([]);
  });
  it("preserves original and exact edited bytes with the database editor identity", async () => {
    const proposal = row(); const writes = fake([actor, [proposal]], proposal);
    const text = "  Convite 😀  ";
    const edited = await editLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), text, metadata });
    expect(edited.proposalDraft).toMatchObject({ originalText: "Original", editedText: text, revision: 2, editedBy: "owner", editedByName: "Dono", metadata: { contentHash: hashGuidanceContent(text) } });
    expect(edited.expectedRevision).not.toBe(learningProposalRevision("corpus_quality", proposal));
    expect(writes).toHaveLength(1);
  });
  it.each(["M", "N", "K"])("refuses D5 %s with no decision or truncation", async limit => {
    const text = limit === "M" ? "😀".repeat(281) : limit === "K" ? "x".repeat(280) : "Short";
    const proposal = row(text);
    const existing = Array.from({ length: limit === "N" ? 5 : limit === "K" ? 4 : 0 }, (_, i) => ({ ...row(limit === "K" ? "x".repeat(280) : "Short"), id: `rule-${i}`, rationale: limit === "K" ? "x".repeat(280) : "Short", confirmedMetadata: { ...metadata, contentHash: hashGuidanceContent(limit === "K" ? "x".repeat(280) : "Short") }, metadataConfirmedBy: "owner", metadataConfirmedAt: new Date() }));
    const writes = fake([actor, [proposal], [{ id: "brand" }], existing], proposal);
    await expect(approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true })).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(writes).toEqual([]); expect(proposal.proposalDraft.editedText).toBe(text);
  });
  it("approved rule bytes contain no failure prefix and preserve grouping and typed evidence", async () => {
    const text = "  Uma mensagem principal 😀  "; const proposal = row(text);
    const writes = fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    const result = await approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true });
    expect(result.rule.rationale).toBe(text); expect(result.rule.primaryFailureReason).toBe("visual_overload");
    expect(writes.find(w => w.type === "insert")?.value).toMatchObject({ rationale: text, primaryFailureReason: "visual_overload", supportingSignalIds: [], supportingEvidenceRefs: [{ kind: "corpus_item", id: "a" }, { kind: "corpus_item", id: "b" }, { kind: "corpus_item", id: "c" }], metadataConfirmedBy: "owner" });
    expect(result.proposal.status).toBe("accepted");
  });
  it("revises the same supported corpus slice without counting its previous text twice in D5", async () => {
    const proposal = row("Próximo texto");
    const existing = { ...row(), id: "stable-rule", category: "corpus_quality", status: "approved", supportedSliceKey: proposal.sliceKey, confirmedMetadata: { ...metadata, contentHash: hashGuidanceContent("Original") }, metadataConfirmedBy: "owner", metadataConfirmedAt: new Date() };
    const other = Array.from({ length: 4 }, (_, i) => ({ ...existing, id: `other-${i}`, confirmedMetadata: { ...metadata, contentHash: hashGuidanceContent("Original") }, metadataConfirmedBy: "owner", metadataConfirmedAt: new Date() }));
    const writes = fake([actor, [proposal], [{ id: "brand" }], [existing, ...other], [existing]], proposal, existing);
    const result = await approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true });
    expect(result.rule.id).toBe("stable-rule");
    expect(result.rule.rationale).toBe("Próximo texto");
    expect(writes.filter(write => write.type === "insert" && write.value.rationale)).toEqual([]);
    expect(writes.filter(write => write.value.status === "deprecated")).toEqual([]);
  });

  it.each(["corpus_quality", "rule"] as const)("replays %s using the saved decision, without revalidating evidence or writing", async kind => {
    const proposal = row("  Texto literal 😀  ", kind);
    const writes = fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    const input = { kind, proposalId: proposal.id, reviewerUserId: "owner", expectedRevision: learningProposalRevision(kind, proposal), acknowledgeFixtureOnly: true };
    const result = await approveLearningProposal(input);
    const receipt = JSON.parse(JSON.stringify(writes.find(write => write.value.expectedRevision === input.expectedRevision)?.value));
    vi.mocked(getCorpusConsent).mockResolvedValue(null);
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue([]);
    const replayWrites = fake([actor, [receipt.result.proposal], [receipt]], proposal);
    expect(await approveLearningProposal(input)).toEqual(result);
    expect(replayWrites).toEqual([]);
    expect(result.rule.proposalDraft?.editedAt).toEqual(proposal.proposalDraft.editedAt);
    fake([actor, [receipt.result.proposal], []], proposal);
    await expect(approveLearningProposal({ ...input, expectedRevision: "0".repeat(64) })).rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("requires the owner to write the instruction of a categorized-correction candidate before approving", async () => {
    const generic = correctionCandidateRationale(2);
    const withoutPrefix = generic.slice(CORRECTION_CANDIDATE_RATIONALE_PREFIX.length).trim();
    for (const editedText of [generic, `${generic} Use frases curtas.`, withoutPrefix, "Escreva a orientação a partir dos eventos de apoio.", "  "]) {
      const base = row(editedText, "rule");
      const proposal = { ...base, rationale: generic, mismatchBucket: null, supportingSignalIds: [],
        proposalDraft: { ...base.proposalDraft, originalText: generic } };
      const writes = fake([actor, [proposal]], proposal);
      await expect(approveLearningProposal({ kind: "rule", proposalId: "p", reviewerUserId: "owner",
        expectedRevision: learningProposalRevision("rule", proposal) })).rejects.toMatchObject({ code: "guidance_text_required" });
      expect(writes).toEqual([]);
    }
  });

  it("accepts a correction candidate whose owner wrote the instruction itself", async () => {
    const generic = correctionCandidateRationale(2);
    const base = row("Use frases curtas e verbos no imperativo.", "rule");
    const proposal = { ...base, rationale: generic, mismatchBucket: null, supportingSignalIds: [],
      proposalDraft: { ...base.proposalDraft, originalText: generic } };
    fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal({ kind: "rule", proposalId: "p", reviewerUserId: "owner",
      expectedRevision: learningProposalRevision("rule", proposal) })).rejects.not.toMatchObject({ code: "guidance_text_required" });
  });

  it("caveat acknowledgement cannot approve ineligible ambiguous single-row evidence", async () => {
    const proposal = { ...row("Texto", "rule"), supportingSignalIds: ["only-one"], mismatchBucket: "unclear_sample", confidence: "medium" };
    const writes = fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal({ kind: "rule", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("rule", proposal), acknowledgeCaveats: true })).rejects.toMatchObject({ code: "insufficient_evidence" });
    expect(writes).toEqual([]);
  });
  it("preserves the existing low-confidence caveat gate for otherwise eligible evidence", async () => {
    const proposal = { ...row("Texto", "rule"), confidence: "low", caveats: ["Review these limitations"], mismatchBucket: "unclear_sample" };
    const input = { kind: "rule" as const, proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("rule", proposal) };
    const writes = fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal(input)).rejects.toMatchObject({ code: "caveat_ack_required" }); expect(writes).toEqual([]);
    fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    expect((await approveLearningProposal({ ...input, acknowledgeCaveats: true })).rule.rationale).toBe("Texto");
  });
  it.each(["metadata_required", "fixture_ack_required", "insufficient_evidence"])("does not let approval bypass %s", async code => {
    const proposal = row(); if (code === "metadata_required") proposal.proposalDraft = null as never;
    if (code === "insufficient_evidence") proposal.evidenceRefs.corpusItemIds = ["a"];
    const writes = fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal) })).rejects.toMatchObject({ code });
    expect(writes).toEqual([]);
  });
  it.each(["accepted", "rejected"])("synthetic confirmation cannot override %s state", async status => {
    const proposal = { ...row(), status }; const writes = fake([actor, [proposal]], proposal);
    await expect(approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true })).rejects.toMatchObject({ code: "not_proposed" });
    expect(writes).toEqual([]);
  });
  it.each(["scope", "consent", "objective", "export", "missing", "replay", "artifact"])("synthetic confirmation does not bypass %s validation", async invalid => {
    const proposal = row(); const rows = evidenceRows();
    if (invalid === "scope") rows[0].item.clientProfileId = "another-brand";
    if (invalid === "consent") vi.mocked(getCorpusConsent).mockResolvedValue(null);
    if (invalid === "objective") rows[0].item.qualitySnapshot.hardFailures = [{ code: "factual_issue", message: "Falha factual" }];
    if (invalid === "export") rows[0].item.qualitySnapshot.exportStatus = { value: "bloqueado" };
    if (invalid === "artifact") Object.assign(proposal.evidenceRefs, { artifactIds: ["unrelated"] });
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockResolvedValue(invalid === "missing" ? rows.slice(0, 2) : invalid === "replay" ? [rows[0], rows[0], rows[0]] : rows);
    const writes = fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    await expect(approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true })).rejects.toMatchObject({ code: invalid === "consent" ? "client_consent_required" : "insufficient_evidence" });
    expect(writes).toEqual([]);
  });
  it("derives synthetic acknowledgment and caveats from current evidence when the saved flag is absent", async () => {
    const proposal = row(); proposal.evidenceRefs.fixtureOnly = false;
    const input = { kind: "corpus_quality" as const, proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal) };
    const writes = fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    await expect(approveLearningProposal(input)).rejects.toMatchObject({ code: "fixture_ack_required" });
    expect(writes).toEqual([]);
    fake([actor, [proposal], [{ id: "brand" }], []], proposal);
    expect((await approveLearningProposal({ ...input, acknowledgeFixtureOnly: true })).rule.caveats).toEqual(["fixture_only_corpus"]);
  });
  it("does not deprecate another rule when revising a supported slice at the corpus cap", async () => {
    const proposal = row("Próxima revisão");
    const approved = Array.from({ length: 10 }, (_, i) => ({ ...row(), id: `rule-${i}`, category: "corpus_quality", status: "approved", supportedSliceKey: i === 0 ? proposal.sliceKey : `slice-${i}`, approvedAt: new Date(2026, 0, i + 1) }));
    const writes = fake([actor, [proposal], [{ id: "brand" }], approved, [approved[0]]], proposal, approved[0]);
    await approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true });
    expect(writes.filter(write => write.value.status === "deprecated")).toEqual([]);
  });
  it("keeps the independent corpus cap by deprecating the oldest of eleven approved rules", async () => {
    const proposal = row();
    const approved = Array.from({ length: 10 }, (_, i) => ({ ...row(), id: `rule-${i}`, category: "corpus_quality", status: "approved", approvedAt: new Date(2026, 0, i + 1) }));
    const writes = fake([actor, [proposal], [{ id: "brand" }], approved], proposal);
    await approveLearningProposal({ kind: "corpus_quality", proposalId: "p", reviewerUserId: "owner", expectedRevision: learningProposalRevision("corpus_quality", proposal), acknowledgeFixtureOnly: true });
    expect(writes.filter(write => write.value.status === "deprecated")).toHaveLength(1);
  });
});
