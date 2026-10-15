import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user, workspaces, workspaceMembers, clientProfiles, clientLearningProposals, calibrationRules, guidanceProposalApprovals, campaigns, derivations } from "@/server/db/schema";
import { editLearningProposal, approveLearningProposal } from "./proposal-approval";
import { decideCalibrationRule } from "@/server/brand-taste/guidance-decisions";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { grantCorpusConsent } from "@/server/repositories/assistant-goal";
import { insertCorpusItem, submitCorpusEvaluation } from "@/server/repositories/human-quality-corpus";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";
import { loadLocalLearningPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";
import type { ConfirmedGuidanceMetadata } from "@/server/brand-taste/guidance-metadata";
import { listCalibrationRuleHistory } from "@/server/repositories/calibration-rule-history";
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (testUrl) { const url = new URL(testUrl); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local _test database URLs"); }
const ownerId = randomUUID(); const email = `${ownerId}@example.com`; const workspaceIds: string[] = []; const userIds = [ownerId];
const metadata = { category: "brand_nuance" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"] };
async function scope() {
  const [ws] = await db.insert(workspaces).values({ name: "Proposal test", slug: randomUUID() }).returning(); workspaceIds.push(ws.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: ws.id, name: "Brand" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: ownerId, role: "owner" });
  await grantCorpusConsent({ workspaceId: ws.id, clientProfileId: brand.id, reviewedByUserId: ownerId });
  return { workspaceId: ws.id, clientProfileId: brand.id };
}
async function proposal(own: Awaited<ReturnType<typeof scope>>, reason: "visual_overload" | "illegible_cta" = "visual_overload") {
  const [campaign] = await db.insert(campaigns).values({ ...own, name: "Corpus simulado" }).returning();
  const corpusItemIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [derivation] = await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId: campaign.id, status: "completed" }).returning();
    const item = await insertCorpusItem({ ...own, campaignId: campaign.id, derivationId: derivation.id, generationMode: "art_variation", format: "1:1", cohort: "baseline", corpusVersion: 1, selectedByUserId: ownerId, artifactRef: { derivationId: derivation.id }, qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } });
    await submitCorpusEvaluation({ workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: ownerId, visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: reason });
    corpusItemIds.push(item.id);
  }
  const [row] = await db.insert(clientLearningProposals).values({ ...own, sliceKey: `${own.workspaceId}:${own.clientProfileId}:${reason}|art_variation|1:1`, rationale: "Texto original", primaryFailureReason: reason,
    evidenceRefs: { corpusItemIds, fixtureOnly: true, stats: { count: 3, meanSignedDelta: 20, meanAbsError: 20, overScoreCount: 3, underScoreCount: 0 } } }).returning(); return row;
}
async function save(row: { id: string; expectedRevision?: string }, kind: "rule" | "corpus_quality", text: string, confirmation: Omit<ConfirmedGuidanceMetadata, "contentHash"> = metadata) {
  return editLearningProposal({ kind, proposalId: row.id, reviewerUserId: ownerId, expectedRevision: row.expectedRevision ?? learningProposalRevision(kind, row), text, metadata: confirmation });
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
    const history = await listCalibrationRuleHistory(own);
    expect(history.at(-1)).toMatchObject({ ruleId: result.rule.id, text: exact, status: "approved", approvedBy: ownerId,
      contentHash: createHash("sha256").update(exact, "utf8").digest("hex") });
    expect(history.map(revision => [revision.revisionNumber, revision.status, revision.text])).toEqual(kind === "rule"
      ? [[1, "candidate", "Texto original"], [2, "candidate", "Texto original"], [3, "candidate", "Texto original"], [4, "approved", exact]]
      : [[1, "approved", exact]]);
    if (kind === "corpus_quality") {
      expect(result.proposal.rationale).toBe("Texto original");
      expect(await getApprovedCorpusQualityRuleForFailure({ ...own, primaryFailureReason: "visual_overload" })).toMatchObject({ id: result.rule.id, rationale: exact });
    }
    expect(await accept(edited, kind)).toEqual(result);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
  });
  it.each(["corpus_quality", "rule"] as const)("serializes two accepts of the same %s revision and returns one immutable decision", async kind => {
    const own = await scope();
    const row = kind === "rule"
      ? (await db.insert(calibrationRules).values({ ...own, category: "voice", confidence: "high", rationale: "Candidata" }).returning())[0]
      : await proposal(own);
    const edited = await save(row, kind, "  Aceite único 😀  ");
    const [a, b] = await Promise.all([accept(edited, kind), accept(edited, kind)]);
    expect(a).toEqual(b);
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId))).toHaveLength(1);
    expect(await db.select().from(guidanceProposalApprovals).where(eq(guidanceProposalApprovals.ruleId, a.rule.id))).toHaveLength(1);
    const history = await listCalibrationRuleHistory(own);
    expect(history.map(row => row.revisionNumber)).toEqual(kind === "rule" ? [1, 2, 3] : [1]);
    expect(history.filter(row => row.status === "approved")).toHaveLength(1);
    expect(await accept(edited, kind)).toEqual(a);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
  });
  it("advances the same supported slice and replays the earlier acceptance even after its projection changes", async () => {
    const own = await scope();
    const first = await save(await proposal(own), "corpus_quality", "Primeiro texto aprovado");
    const initial = await accept(first);
    const before = await listCalibrationRuleHistory(own);
    const second = await save(await proposal(own), "corpus_quality", "Segundo texto aprovado");
    // A pending proposal never replaces the approved projection.
    expect(await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "pt-BR", fixedPromptVersion: "copy/v1" }))
      .toMatchObject({ lines: expect.arrayContaining(["Primeiro texto aprovado"]) });
    const [next, replay, duplicate] = await Promise.all([accept(second), accept(first), accept(second)]);
    expect(next).toEqual(duplicate);
    expect(replay).toEqual(initial);
    expect(next.rule.id).toBe(initial.rule.id);
    expect(next.rule.supportedSliceKey).toBe(second.sliceKey);
    const rules = await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(next.rule);
    const history = await listCalibrationRuleHistory(own);
    expect(history.map(row => [row.revisionNumber, row.text])).toEqual([[1, "Primeiro texto aprovado"], [2, "Segundo texto aprovado"]]);
    expect(history[0]).toEqual(before[0]);
    expect(await accept(first)).toEqual(initial);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
    const selected = await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "pt-BR", fixedPromptVersion: "copy/v1" });
    expect(selected.lines).toContain("Segundo texto aprovado");
    expect(selected.lines).not.toContain("Primeiro texto aprovado");
  });
  it("replaces a slice already counted at the D5 boundary instead of admitting a sixth rule", async () => {
    const own = await scope();
    const first = await save(await proposal(own), "corpus_quality", "Texto anterior");
    const initial = await accept(first);
    for (let i = 0; i < 4; i++) await approved(own, `Outra orientação ${i}`);
    const next = await save(await proposal(own), "corpus_quality", "Texto substituto");
    const result = await accept(next);
    expect(result.rule.id).toBe(initial.rule.id);
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId))).toHaveLength(5);
    expect((await listCalibrationRuleHistory(own)).filter(row => row.ruleId === initial.rule.id).map(row => row.revisionNumber)).toEqual([1, 2]);
  });
  it("keeps the replay result immutable in Postgres", async () => {
    const own = await scope();
    const edited = await save(await proposal(own), "corpus_quality", "Decisão persistida");
    const initial = await accept(edited);
    const where = eq(guidanceProposalApprovals.proposalId, edited.id);
    const [receipt] = await db.select().from(guidanceProposalApprovals).where(where);
    await expect(db.insert(guidanceProposalApprovals).values(receipt)).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(db.update(guidanceProposalApprovals).set({ expectedRevision: "0".repeat(64) }).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(db.delete(guidanceProposalApprovals).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(db.execute(sql`TRUNCATE adscale_app.guidance_proposal_approvals`)).rejects.toMatchObject({ cause: { code: "55000" } });
    expect(await accept(edited)).toEqual(initial);
  });
  it("records cap depreciation with the approving owner and keeps previous approval and receipt immutable", async () => {
    const own = await scope();
    const previousOwner = randomUUID(); userIds.push(previousOwner);
    await db.insert(user).values({ id: previousOwner, name: "Aprovador anterior", email: `${previousOwner}@example.test` });
    const rules = await db.insert(calibrationRules).values(Array.from({ length: 10 }, (_, i) => ({
      ...own, category: "corpus_quality", status: "approved", rationale: `Orientação anterior ${i}`, approvedBy: previousOwner,
      approvedAt: new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    }))).returning();
    const before = (await listCalibrationRuleHistory(own)).filter(row => row.ruleId === rules[0].id);
    const edited = await save(await proposal(own), "corpus_quality", "Nova orientação");
    const result = await accept(edited);
    const [retired] = await db.select().from(calibrationRules).where(eq(calibrationRules.id, rules[0].id));
    expect(retired).toMatchObject({ status: "deprecated", approvedBy: previousOwner, approvedAt: rules[0].approvedAt,
      reviewDecision: { action: "deprecate", decidedBy: ownerId, source: "corpus_quality_cap", reason: expect.stringContaining("teto de 10") } });
    expect(retired.reviewDecision!.decidedAt).toBe(result.rule.approvedAt!.toISOString());
    const history = (await listCalibrationRuleHistory(own)).filter(row => row.ruleId === retired.id);
    expect(history).toHaveLength(2); expect(history[0]).toEqual(before[0]);
    expect(history[1]).toMatchObject({ decisionBy: ownerId, decisionReason: retired.reviewDecision!.reason, approvedBy: previousOwner });
    expect(await db.select().from(calibrationRules).where(and(eq(calibrationRules.clientProfileId, own.clientProfileId), eq(calibrationRules.status, "approved")))).toHaveLength(10);
    await decideCalibrationRule({ ...own, ruleId: result.rule.id, reviewerUserId: ownerId, action: "deprecate", reason: "Decisão posterior", expectedRevision: learningProposalRevision("rule", result.rule) });
    const after = await listCalibrationRuleHistory(own);
    expect(await accept(edited)).toEqual(result);
    expect(await listCalibrationRuleHistory(own)).toEqual(after);
    expect((await db.select().from(calibrationRules).where(eq(calibrationRules.id, result.rule.id)))[0].status).toBe("deprecated");
  });

  it("serializes cap and manual retirement without replacing the winning decision", async () => {
    const own = await scope();
    const rules = await db.insert(calibrationRules).values(Array.from({ length: 10 }, (_, i) => ({
      ...own, category: "corpus_quality", status: "approved", rationale: `Anterior ${i}`, approvedBy: ownerId,
      approvedAt: new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    }))).returning();
    const edited = await save(await proposal(own), "corpus_quality", "Nova orientação");
    const results = await Promise.allSettled([accept(edited), decideCalibrationRule({ ...own, ruleId: rules[0].id,
      reviewerUserId: ownerId, action: "reject", reason: "Motivo manual", expectedRevision: learningProposalRevision("rule", rules[0]) })]);
    expect(results[0].status).toBe("fulfilled");
    if (results[1].status === "rejected") expect(results[1].reason).toMatchObject({ code: "revision_conflict" });
    const history = (await listCalibrationRuleHistory(own)).filter(row => row.ruleId === rules[0].id);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ approvedBy: ownerId, decisionBy: ownerId });
    expect(["rejected", "deprecated"]).toContain(history[1].status);
  });

  it("makes approved voice and invite text eligible without calibration while visual guidance stays pending proof", async () => {
    const own = await scope();
    const ruleIds: string[] = [];
    for (const [category, nature, text] of [["voice", "text", "Voz acolhedora"], ["invite", "text", "Convite direto"], ["brand_nuance", "visual", "Composição visual"]] as const) {
      const [row] = await db.insert(calibrationRules).values({ ...own, category, confidence: "high", rationale: "Candidata" }).returning();
      const edited = await save(row, "rule", text, { ...metadata, category, nature });
      ruleIds.push((await accept(edited, "rule")).rule.id);
    }
    const history = await listCalibrationRuleHistory(own);
    const loaded = await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "pt-BR", fixedPromptVersion: "copy/v1" });
    expect(loaded.lines).toContain("Voz acolhedora");
    expect(loaded.lines).toContain("Convite direto");
    expect(loaded.lines).not.toContain("Composição visual");
    expect(loaded.appliedRefs.map(ref => ref.ruleId).sort()).toEqual(ruleIds.slice(0, 2).sort());
    expect(loaded.omissions).toEqual([{ ruleId: ruleIds[2], reason: "visual_proof_missing" }]);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
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
    expect(await db.select().from(guidanceProposalApprovals).where(eq(guidanceProposalApprovals.proposalId, edited.id))).toEqual([]);
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
    const a = await save(await proposal(own), "corpus_quality", "Candidate A"); const b = await save(await proposal(own, "illegible_cta"), "corpus_quality", "Candidate B");
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
