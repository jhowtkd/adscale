import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, calibrationRuleRevisions, clientProfiles, creativeWorkItems, creativeWorkOutputs, user, workspaces } from "@/server/db/schema";
import { decideCalibrationRule } from "./guidance-decisions";
import { editLearningProposal, approveLearningProposal } from "../human-quality/learning/proposal-approval";
import { learningProposalRevision } from "./proposal-review";
import { hashGuidanceContent } from "./learned-guidance";
import { freezeSinglePieceOutputGuidance } from "../repositories/single-piece-guidance";
import { listCalibrationRuleHistory } from "../repositories/calibration-rule-history";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) { const url = new URL(testUrl); if (!["localhost", "127.0.0.1"].includes(url.hostname) || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local _test database URLs"); }
const ownerId = randomUUID(), email = `${ownerId}@example.test`, oldOwnerId = randomUUID();
const workspaceIds: string[] = [], userIds = [ownerId, oldOwnerId];
async function scope(status = "approved") {
  const [ws] = await db.insert(workspaces).values({ name: "Decisão simulada", slug: randomUUID() }).returning(); workspaceIds.push(ws.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: ws.id, name: "Marca simulada" }).returning();
  const own = { workspaceId: ws.id, clientProfileId: brand.id };
  const rationale = "Convites acolhedores";
  const [rule] = await db.insert(calibrationRules).values({ ...own, status, rationale, category: "voice", confidence: "high",
    approvedBy: status === "approved" ? oldOwnerId : null, approvedAt: status === "approved" ? new Date("2026-10-01T00:00:00Z") : null,
    confirmedMetadata: { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"], contentHash: hashGuidanceContent(rationale) },
    metadataConfirmedBy: oldOwnerId, metadataConfirmedAt: new Date(),
  }).returning();
  return { own, rule };
}
describe.skipIf(!testUrl)("immutable guidance decisions (Postgres)", () => {
  beforeAll(async () => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
    await db.insert(user).values([{ id: ownerId, email, name: "Dono atual" }, { id: oldOwnerId, email: `${oldOwnerId}@example.test`, name: "Autor anterior" }]);
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, userIds)); vi.unstubAllEnvs();
  });
  it.each(["deprecate", "reject"] as const)("%s excludes new operations, retains in-flight selections and preserves the approval", async action => {
    const { own, rule } = await scope();
    const before = await listCalibrationRuleHistory(own);
    const [work] = await db.insert(creativeWorkItems).values({ ...own, createdByUserId: ownerId, title: "Trabalho simulado", request: "Pedido", toolKind: "single", format: "1:1" }).returning();
    const [inFlight, next] = await db.insert(creativeWorkOutputs).values([0, 1].map(() => ({ workspaceId: own.workspaceId, workItemId: work.id, creativeLevel: "balanced", targetFormat: "1:1", operationKey: randomUUID() }))).returning();
    const freeze = (outputId: string) => freezeSinglePieceOutputGuidance({ workspaceId: own.workspaceId, workItemId: work.id, outputId });
    const frozen = await freeze(inFlight.id);
    expect(frozen!.roles.copy.lines).toContain(rule.rationale);
    const input = { ...own, ruleId: rule.id, reviewerUserId: ownerId, action, reason: "  Nova direção  ", expectedRevision: learningProposalRevision("rule", rule) };
    const [decided, replay] = await Promise.all([decideCalibrationRule(input), decideCalibrationRule(input)]);
    expect(replay).toEqual(decided);
    expect(decided).toMatchObject({ approvedBy: oldOwnerId, approvedAt: rule.approvedAt, rationale: rule.rationale,
      reviewDecision: { action, decidedBy: ownerId, reason: "Nova direção", source: "manual" } });
    expect(await freeze(inFlight.id)).toEqual(frozen);
    expect((await freeze(next.id))!.roles.copy.appliedRefs).toEqual([]);
    const history = await listCalibrationRuleHistory(own);
    expect(history).toHaveLength(2); expect(history[0]).toEqual(before[0]);
    expect(history[1]).toMatchObject({ status: action === "reject" ? "rejected" : "deprecated", decisionBy: ownerId,
      decisionReason: "Nova direção", decisionAt: decided.reviewDecision!.decidedAt, approvedBy: oldOwnerId });
    await expect(db.update(calibrationRuleRevisions).set({ snapshot: {} }).where(eq(calibrationRuleRevisions.ruleId, rule.id))).rejects.toMatchObject({ cause: { code: "55000" } });
    expect(await decideCalibrationRule(input)).toEqual(decided);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
  });
  it("serializes conflicting decisions with exactly one winner and no rewritten author", async () => {
    const { own, rule } = await scope();
    const base = { ...own, ruleId: rule.id, reviewerUserId: ownerId, expectedRevision: learningProposalRevision("rule", rule) };
    const results = await Promise.allSettled([decideCalibrationRule({ ...base, action: "deprecate", reason: "Depreciar" }), decideCalibrationRule({ ...base, action: "reject", reason: "Rejeitar" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "revision_conflict" });
    const history = await listCalibrationRuleHistory(own);
    expect(history).toHaveLength(2); expect(history[1].decisionBy).toBe(ownerId);
  });
  it("serializes candidate rejection against approval of its viewed draft", async () => {
    const { own, rule } = await scope("candidate");
    const edited = await editLearningProposal({ kind: "rule", proposalId: rule.id, reviewerUserId: ownerId, expectedRevision: learningProposalRevision("rule", rule),
      text: rule.rationale, metadata: rule.confirmedMetadata });
    const results = await Promise.allSettled([
      decideCalibrationRule({ ...own, ruleId: rule.id, reviewerUserId: ownerId, action: "reject", reason: "Não usar", expectedRevision: edited.expectedRevision }),
      approveLearningProposal({ kind: "rule", proposalId: rule.id, reviewerUserId: ownerId, expectedRevision: edited.expectedRevision }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "revision_conflict" });
    expect(await listCalibrationRuleHistory(own)).toHaveLength(3);
  });
  it("isolates brands and denies workspace roles and missing users", async () => {
    const { own, rule } = await scope();
    const other = await scope();
    const base = { ...own, ruleId: rule.id, reviewerUserId: ownerId, action: "deprecate" as const, reason: "Motivo", expectedRevision: learningProposalRevision("rule", rule) };
    await expect(decideCalibrationRule({ ...base, ...other.own })).rejects.toMatchObject({ code: "not_found" });
    for (const reviewerUserId of [oldOwnerId, "nonexistent-agent"]) {
      await expect(decideCalibrationRule({ ...base, reviewerUserId })).rejects.toMatchObject({ code: "forbidden" });
    }
    expect((await db.select().from(calibrationRules).where(and(eq(calibrationRules.id, rule.id), eq(calibrationRules.workspaceId, own.workspaceId))))[0]).toEqual(rule);
    expect(await listCalibrationRuleHistory(own)).toHaveLength(1);
  });
});
