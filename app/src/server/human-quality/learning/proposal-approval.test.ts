import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), allowed: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: mocks.allowed }));
import { editLearningProposal, approveLearningProposal } from "./proposal-approval";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
const metadata = { category: "voice" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"] };
function row(text = "Original", kind = "corpus_quality") {
  return { id: "p", workspaceId: "ws", clientProfileId: "brand", rationale: "Original", status: kind === "rule" ? "candidate" : "proposed",
    confidence: "high", supportingSignalIds: ["s1", "s2"], supportingEvidenceRefs: [], caveats: [], category: "voice", version: 1, createdAt: new Date(), updatedAt: new Date(),
    evidenceRefs: { corpusItemIds: ["a", "b", "c"], fixtureOnly: true }, primaryFailureReason: "visual_overload",
    proposalDraft: { originalText: "Original", editedText: text, revision: 1, editedBy: "owner", editedByName: "Dono", editedAt: new Date().toISOString(), metadata: { ...metadata, contentHash: hashGuidanceContent(text) } },
  };
}
function fake(rows: unknown[][], proposal: ReturnType<typeof row>) {
  const writes: { type: string; value: Record<string, unknown> }[] = [];
  const tx = {
    select: () => { const values = rows.shift()!; const query = { from: () => query, where: () => query, for: () => query, limit: async () => values, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(values).then(resolve) }; return query; },
    update: () => { let patch: Record<string, unknown>; const query = { set: (value: Record<string, unknown>) => { patch = value; writes.push({ type: "update", value }); return query; }, where: () => query, returning: async () => [{ ...proposal, ...patch }], then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve) }; return query; },
    insert: () => ({ values: (value: Record<string, unknown>) => { writes.push({ type: "insert", value }); return { returning: async () => [{ ...proposal, ...value, id: "new-rule", approvedAt: new Date() }] }; } }),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return writes;
}
const actor = [{ id: "owner", name: "Dono", email: "owner@example.com" }];
beforeEach(() => { vi.clearAllMocks(); mocks.allowed.mockReturnValue(true); });
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
});
