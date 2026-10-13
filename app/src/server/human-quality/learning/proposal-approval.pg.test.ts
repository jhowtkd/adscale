import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { user, workspaces, workspaceMembers, clientProfiles, clientLearningProposals, calibrationRules } from "@/server/db/schema";
import { editLearningProposal, approveLearningProposal } from "./proposal-approval";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (testUrl) { const url = new URL(testUrl); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local _test database URLs"); }
const ownerId = randomUUID(); const email = `${ownerId}@example.com`; const workspaceIds: string[] = []; const userIds = [ownerId];
const metadata = { category: "brand_nuance" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"] };
async function scope() {
  const [ws] = await db.insert(workspaces).values({ name: "Proposal test", slug: randomUUID() }).returning(); workspaceIds.push(ws.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: ws.id, name: "Brand" }).returning();
  return { workspaceId: ws.id, clientProfileId: brand.id };
}
async function proposal(own: Awaited<ReturnType<typeof scope>>) {
  const [row] = await db.insert(clientLearningProposals).values({ ...own, sliceKey: randomUUID(), rationale: "Texto original", primaryFailureReason: "visual_overload",
    evidenceRefs: { corpusItemIds: [randomUUID(), randomUUID(), randomUUID()], fixtureOnly: true, stats: { count: 3, meanSignedDelta: 20, meanAbsError: 20, overScoreCount: 3, underScoreCount: 0 } } }).returning(); return row;
}
async function save(row: { id: string; expectedRevision?: string }, kind: "rule" | "corpus_quality", text: string) {
  return editLearningProposal({ kind, proposalId: row.id, reviewerUserId: ownerId, expectedRevision: row.expectedRevision ?? learningProposalRevision(kind, row), text, metadata });
}
async function accept(row: { id: string; expectedRevision: string }, kind: "rule" | "corpus_quality" = "corpus_quality") {
  return approveLearningProposal({ kind, proposalId: row.id, expectedRevision: row.expectedRevision, reviewerUserId: ownerId, acknowledgeFixtureOnly: true });
}
async function approved(own: Awaited<ReturnType<typeof scope>>, text: string) {
  await db.insert(calibrationRules).values({ ...own, rationale: text, category: "voice", status: "approved", confidence: "high", confirmedMetadata: { ...metadata, contentHash: hashGuidanceContent(text) }, metadataConfirmedBy: ownerId, metadataConfirmedAt: new Date() });
}
describe.skipIf(!testUrl)("proposal review (Postgres)", () => {
  beforeAll(async () => { vi.stubEnv("PLATFORM_OWNER_EMAILS", email); await db.insert(user).values({ id: ownerId, name: "Dono simulado", email }); });
  afterAll(async () => { if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds)); await db.delete(user).where(inArray(user.id, userIds)); vi.unstubAllEnvs(); });
  it.each(["corpus_quality", "rule"] as const)("preserves original, editor and exact %s bytes; stale saves/approval never approve the newer text", async kind => {
    const own = await scope();
    const row = kind === "rule" ? (await db.insert(calibrationRules).values({ ...own, category: "voice", status: "candidate", confidence: "high", rationale: "Texto original" }).returning())[0] : await proposal(own);
    const initial = await save(row, kind, "Primeira revisão");
    const exact = "  Convite humano 😀  "; const edited = await save(initial, kind, exact);
    await expect(accept(initial, kind)).rejects.toMatchObject({ code: "revision_conflict", current: { expectedRevision: edited.expectedRevision, proposalDraft: { editedText: exact } } });
    await expect(save(initial, kind, "Não deve substituir")).rejects.toMatchObject({ code: "revision_conflict" });
    expect((await db.select().from(calibrationRules).where(and(eq(calibrationRules.clientProfileId, own.clientProfileId), eq(calibrationRules.status, "approved"))))).toHaveLength(0);
    const result = await accept(edited, kind);
    expect(result.rule).toMatchObject({ rationale: exact, approvedBy: ownerId, metadataConfirmedBy: ownerId, confirmedMetadata: { contentHash: hashGuidanceContent(exact) }, proposalDraft: { originalText: "Texto original", editedText: exact, editedBy: ownerId, editedByName: "Dono simulado", revision: 3 } });
    if (kind === "corpus_quality") {
      expect(result.proposal.rationale).toBe("Texto original");
      expect(await getApprovedCorpusQualityRuleForFailure({ ...own, primaryFailureReason: "visual_overload" })).toMatchObject({ id: result.rule.id, rationale: exact });
    }
    await expect(accept(edited, kind)).rejects.toMatchObject({ code: "revision_conflict" });
  });
  it("concurrent saves have exactly one winner and return its state to the loser", async () => {
    const row = await proposal(await scope());
    const results = await Promise.allSettled([save(row, "corpus_quality", "Texto A"), save(row, "corpus_quality", "Texto B")]);
    const winner = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof save>>>;
    const loser = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(loser.reason).toMatchObject({ code: "revision_conflict", current: { expectedRevision: winner.value.expectedRevision, proposalDraft: winner.value.proposalDraft } });
  });
  it.each(["M", "N", "K"])("refuses D5 %s without truncation or status/rule writes", async limit => {
    const own = await scope(); const text = limit === "M" ? "😀".repeat(281) : limit === "K" ? "x".repeat(280) : "Short";
    for (let i = 0; i < (limit === "N" ? 5 : limit === "K" ? 4 : 0); i++) await approved(own, limit === "K" ? "x".repeat(280) : "Short");
    const edited = await save(await proposal(own), "corpus_quality", text);
    await expect(accept(edited)).rejects.toMatchObject({ code: "budget_exceeded" });
    const [stored] = await db.select().from(clientLearningProposals).where(eq(clientLearningProposals.id, edited.id));
    expect(stored.status).toBe("proposed"); expect(stored.acceptedBy).toBeNull(); expect(stored.proposalDraft?.editedText).toBe(text);
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId))).toHaveLength(limit === "N" ? 5 : limit === "K" ? 4 : 0);
  });
  it("counts Unicode points and only overlapping confirmed destinations and scope", async () => {
    const own = await scope();
    for (let i = 0; i < 5; i++) {
      await db.insert(calibrationRules).values({ ...own, category: "voice", status: "approved", rationale: "Another context", confirmedMetadata: { ...metadata, generationModes: ["carousel"], contentHash: hashGuidanceContent("Another context") }, metadataConfirmedBy: ownerId, metadataConfirmedAt: new Date() });
    }
    const exact = "😀".repeat(280); const edited = await save(await proposal(own), "corpus_quality", exact);
    expect((await accept(edited)).rule.rationale).toBe(exact);
  });
  it("serializes different concurrent approvals at the brand D5 boundary", async () => {
    const own = await scope(); for (let i = 0; i < 4; i++) await approved(own, `Guidance ${i}`);
    const a = await save(await proposal(own), "corpus_quality", "Candidate A"); const b = await save(await proposal(own), "corpus_quality", "Candidate B");
    const results = await Promise.allSettled([accept(a), accept(b)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "budget_exceeded" });
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId))).toHaveLength(5);
  });
  it.each(["owner", "admin", "member", "agent"])("workspace %s cannot edit or approve", async role => {
    const own = await scope(); const actorId = randomUUID(); userIds.push(actorId);
    await db.insert(user).values({ id: actorId, name: role, email: `${actorId}@example.com` });
    if (role !== "agent") await db.insert(workspaceMembers).values({ workspaceId: own.workspaceId, userId: actorId, role });
    const row = await proposal(own); const input = { kind: "corpus_quality" as const, proposalId: row.id, reviewerUserId: actorId, expectedRevision: learningProposalRevision("corpus_quality", row) };
    await expect(editLearningProposal({ ...input, text: "Forbidden", metadata })).rejects.toMatchObject({ code: "forbidden" });
    await expect(approveLearningProposal(input)).rejects.toMatchObject({ code: "forbidden" });
    const [stored] = await db.select().from(clientLearningProposals).where(eq(clientLearningProposals.id, row.id)); expect(stored.proposalDraft).toBeNull(); expect(stored.status).toBe("proposed");
  });
});
