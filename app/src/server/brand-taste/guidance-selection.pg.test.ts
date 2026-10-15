import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, guidanceSelectionPins, creativeWorkItems, creativeWorkOutputs, clientProfiles, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { freezeSinglePieceOutputGuidance } from "../repositories/single-piece-guidance";
import type { FrozenSinglePieceGuidance } from "./single-piece-guidance";
import { getGuidanceSelection } from "../repositories/guidance-selection";
import { pinGuidanceSelection, revertGuidanceSelection } from "./guidance-selection";
import { listCalibrationRuleHistory } from "../repositories/calibration-rule-history";
import { hashGuidanceContent, hashGuidanceSet, renderLearnedGuidance, LEARNED_GUIDANCE_WRAPPERS } from "./learned-guidance";
import { loadLocalLearningPromptCalibrationContext } from "./prompt-calibration-loader";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl && (process.env.DATABASE_URL !== testUrl || !["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname))) throw new Error("Requires matching local _test database URLs");
const ownerId = randomUUID(), memberId = randomUUID(), email = `${ownerId}@example.test`;
const workspaceIds: string[] = [];
const target = { role: "copy", generationMode: "single", format: "1:1", language: "en", fixedPromptVersion: "copy/v1" } as const;
function values(text: string) {
  return { category: "voice", status: "approved", rationale: text, approvedBy: ownerId, approvedAt: new Date(),
    confirmedMetadata: { category: "voice" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"], contentHash: hashGuidanceContent(text) },
    metadataConfirmedBy: ownerId, metadataConfirmedAt: new Date() };
}
async function scope(texts = ["Voz acolhedora"]) {
  const [ws] = await db.insert(workspaces).values({ name: "Seleção simulada", slug: randomUUID() }).returning(); workspaceIds.push(ws.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: ws.id, name: "Marca simulada" }).returning();
  const own = { workspaceId: ws.id, clientProfileId: brand.id };
  const rules = await db.insert(calibrationRules).values(texts.map(text => ({ ...own, ...values(text) }))).returning();
  return { own, rules };
}
const load = (own: { workspaceId: string; clientProfileId: string }) => loadLocalLearningPromptCalibrationContext({ ...own, ...target });
describe.skipIf(!testUrl)("active numeric guidance selection (Postgres)", () => {
  beforeAll(async () => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
    await db.insert(user).values([{ id: ownerId, email, name: "Dono" }, { id: memberId, email: `${memberId}@example.test`, name: "Membro" }]);
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [ownerId, memberId])); vi.unstubAllEnvs();
  });
  it("reverts to exact previous revisions with a new immutable receipt, preserving brand and rule decisions", async () => {
    const { own, rules: [rule] } = await scope();
    await db.update(clientProfiles).set({ description: "Fato confirmado: produto simulado", brandColors: ["#123456"],
      logoAssetKey: "simulated/brand-logo.png", toneOfVoice: "Identidade confirmada", requiredElements: "Nome do produto" }).where(eq(clientProfiles.id, own.clientProfileId));
    const previous = await getGuidanceSelection(own);
    await db.update(calibrationRules).set(values("Voz posterior")).where(eq(calibrationRules.id, rule.id));
    const latest = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: latest.version, refs: previous.refs });
    const history = await listCalibrationRuleHistory(own);
    const brand = await db.select().from(clientProfiles).where(eq(clientProfiles.id, own.clientProfileId));
    const rules = await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId));
    const input = { ...own, reviewerUserId: ownerId, expectedVersion: pinned.version };
    const reverted = await revertGuidanceSelection(input);
    expect(reverted).toMatchObject({ version: pinned.version + 1, refs: latest.refs, pinnedBy: ownerId,
      previousSelection: { version: pinned.version, refs: previous.refs, pinnedBy: ownerId, pinnedAt: pinned.pinnedAt } });
    expect(new Date(reverted.pinnedAt!).getTime()).toBeLessThanOrEqual(Date.now());
    expect((await load(own)).appliedRefs).toEqual(latest.refs);
    expect((await load(own)).lines).toContain("Voz posterior");
    expect(await revertGuidanceSelection(input)).toEqual(reverted);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
    expect(await db.select().from(clientProfiles).where(eq(clientProfiles.id, own.clientProfileId))).toEqual(brand);
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, own.clientProfileId))).toEqual(rules);
    const receipts = await db.select().from(guidanceSelectionPins).where(eq(guidanceSelectionPins.clientProfileId, own.clientProfileId));
    expect(receipts).toHaveLength(2);
    expect(receipts.find(row => row.expectedVersion === input.expectedVersion)).toMatchObject({ action: "revert_selection", result: reverted });
  });
  it("follows numeric approvals, preserves selection during review and retains the hash formula", async () => {
    const { own, rules: [rule] } = await scope();
    const first = await load(own);
    expect(first.appliedRefs).toEqual([{ ruleId: rule.id, revision: 1, contentHash: hashGuidanceContent(rule.rationale) }]);
    expect(first.setHash).toBe(hashGuidanceSet(first.appliedRefs));
    expect(hashGuidanceSet([{ ...first.appliedRefs[0], revision: "legacy" }])).not.toBe(first.setHash);
    await db.update(calibrationRules).set({ status: "candidate", rationale: "Em revisão" }).where(eq(calibrationRules.id, rule.id));
    expect(await load(own)).toEqual(first);
    await db.update(calibrationRules).set(values("Nova voz")).where(eq(calibrationRules.id, rule.id));
    expect((await load(own)).appliedRefs).toEqual([{ ruleId: rule.id, revision: 3, contentHash: hashGuidanceContent("Nova voz") }]);
  });
  it.each(["deprecated", "rejected"])("reverts only eligible previous refs after %s, reapproval and invalid metadata, without fallback", async status => {
    const { own, rules: [valid, retired, unconfirmed] } = await scope(["Voz anterior elegível", "Voz retirada", "Não conferida"]);
    await db.update(calibrationRules).set({ confirmedMetadata: null, metadataConfirmedBy: null, metadataConfirmedAt: null }).where(eq(calibrationRules.id, unconfirmed.id));
    const previous = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: previous.version, refs: [] });
    await db.update(calibrationRules).set({ status }).where(eq(calibrationRules.id, retired.id));
    await db.update(calibrationRules).set(values("Reaprovada, não deve substituir a anterior")).where(eq(calibrationRules.id, retired.id));
    await db.update(calibrationRules).set(values("Voz mais nova, não deve substituir a anterior")).where(eq(calibrationRules.id, valid.id));
    const history = await listCalibrationRuleHistory(own);
    const reverted = await revertGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: pinned.version });
    expect(reverted.refs).toEqual(previous.refs.filter(ref => ref.ruleId === valid.id));
    expect(reverted.previousSelection?.refs).toEqual([]);
    expect((await load(own)).appliedRefs).toEqual(reverted.refs);
    expect((await load(own)).lines).toContain(valid.rationale);
    expect(await listCalibrationRuleHistory(own)).toEqual(history);
  });
  it("keeps an empty previous selection pinned and rejects missing history, nonowners and foreign scopes", async () => {
    const { own } = await scope();
    const automatic = await getGuidanceSelection(own);
    const base = { ...own, reviewerUserId: ownerId, expectedVersion: automatic.version };
    await expect(revertGuidanceSelection(base)).rejects.toMatchObject({ code: "no_previous_selection" });
    await expect(revertGuidanceSelection({ ...base, reviewerUserId: memberId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(revertGuidanceSelection({ ...base, workspaceId: randomUUID() })).rejects.toMatchObject({ code: "not_found" });
    const empty = await pinGuidanceSelection({ ...base, refs: [] });
    const pinned = await pinGuidanceSelection({ ...base, expectedVersion: empty.version, refs: automatic.refs });
    const reverted = await revertGuidanceSelection({ ...base, expectedVersion: pinned.version });
    await db.insert(calibrationRules).values({ ...own, ...values("Nova aprovação após reversão") });
    expect(reverted.refs).toEqual([]); expect(reverted.pinnedBy).toBe(ownerId);
    expect(await getGuidanceSelection(own)).toEqual(reverted);
    expect((await load(own)).appliedRefs).toEqual([]);
  });
  it("omits missing and stale references, keeping an all-ineligible reversion empty", async () => {
    const { own, rules: [stale, missing, retired] } = await scope(["Metadados anteriores", "Removida", "Retirada"]);
    await db.update(calibrationRules).set({ rationale: "Mudou sem conferir metadados" }).where(eq(calibrationRules.id, stale.id));
    const previous = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: previous.version, refs: [] });
    await db.delete(calibrationRules).where(eq(calibrationRules.id, missing.id));
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, retired.id));
    const reverted = await revertGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: pinned.version });
    expect(reverted.refs).toEqual([]); expect(reverted.pinnedBy).toBe(ownerId);
    expect((await load(own)).appliedRefs).toEqual([]);
  });
  it("validates the eligible remainder against D5 after excluding a retired rule", async () => {
    const { own, rules } = await scope(Array.from({ length: 6 }, (_, i) => `Voz ${i}`));
    const previous = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: previous.version, refs: [] });
    await db.update(calibrationRules).set({ status: "rejected" }).where(eq(calibrationRules.id, rules[0].id));
    const reverted = await revertGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: pinned.version });
    expect(reverted.refs).toEqual(previous.refs.filter(ref => ref.ruleId !== rules[0].id));
    expect((await load(own)).appliedRefs).toHaveLength(5);
  });
  it("replays the immutable reversion after a later pin and distinguishes pin/reversion receipts", async () => {
    const { own } = await scope(); const previous = await getGuidanceSelection(own);
    const base = { ...own, reviewerUserId: ownerId };
    const pinned = await pinGuidanceSelection({ ...base, expectedVersion: previous.version, refs: [] });
    await expect(revertGuidanceSelection({ ...base, expectedVersion: previous.version })).rejects.toMatchObject({ code: "selection_conflict" });
    const input = { ...base, expectedVersion: pinned.version };
    const [first, replay] = await Promise.all([revertGuidanceSelection(input), revertGuidanceSelection(input)]);
    expect(replay).toEqual(first);
    await expect(pinGuidanceSelection({ ...input, refs: first.refs })).rejects.toMatchObject({ code: "selection_conflict" });
    const later = await pinGuidanceSelection({ ...base, expectedVersion: first.version, refs: [] });
    expect(await revertGuidanceSelection(input)).toEqual(first);
    expect(await getGuidanceSelection(own)).toEqual(later);
    const where = eq(guidanceSelectionPins.clientProfileId, own.clientProfileId);
    expect(await db.select().from(guidanceSelectionPins).where(where)).toHaveLength(3);
    await expect(db.update(guidanceSelectionPins).set({ action: "pin_selection" }).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(db.delete(guidanceSelectionPins).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
  });
  it("serializes competing reversion and pin commands with the same expected version", async () => {
    const { own } = await scope(); const before = await getGuidanceSelection(own);
    const base = { ...own, reviewerUserId: ownerId };
    const pinned = await pinGuidanceSelection({ ...base, expectedVersion: before.version, refs: [] });
    const input = { ...base, expectedVersion: pinned.version };
    const results = await Promise.allSettled([revertGuidanceSelection(input), pinGuidanceSelection({ ...input, refs: [] })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(result => result.status === "rejected");
    expect(failed?.reason).toMatchObject({ code: "selection_conflict" });
    expect((await getGuidanceSelection(own)).version).toBe(pinned.version + 1);
    expect(await db.select().from(guidanceSelectionPins).where(eq(guidanceSelectionPins.clientProfileId, own.clientProfileId))).toHaveLength(2);
  });
  it.each([
    ["N", Array.from({ length: 6 }, (_, i) => `Regra ${i}`)],
    ["M", ["😀".repeat(281)]],
    ["K", Array.from({ length: 5 }, (_, i) => String(i).repeat(260))],
  ])("rejects reversion %s overflow without cutting, changing selection or recording a decision", async (_label, texts) => {
    const { own } = await scope(texts); const automatic = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: automatic.version, refs: [] });
    await expect(revertGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: pinned.version })).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(await getGuidanceSelection(own)).toEqual(pinned);
    expect(await db.select().from(guidanceSelectionPins).where(eq(guidanceSelectionPins.clientProfileId, own.clientProfileId))).toHaveLength(1);
  });
  it("preserves a previously frozen legacy output and its hash across numeric loading and pinning", async () => {
    const { own } = await scope();
    const numeric = await load(own);
    const refs = numeric.appliedRefs.map(ref => ({ ...ref, revision: "legacy" as const }));
    const emptyFragment = { lines: [], appliedRefs: [], setHash: null, omissions: [] };
    const frozen: FrozenSinglePieceGuidance = { version: 1, generationMode: "single", format: "1:1", fixedPromptVersion: "copy/v1",
      roles: { copy: { ...numeric, appliedRefs: refs, setHash: hashGuidanceSet(refs) }, art_direction: emptyFragment, image_prompt: emptyFragment } };
    const [work] = await db.insert(creativeWorkItems).values({ ...own, createdByUserId: ownerId, title: "Legado", request: "Pedido", toolKind: "single", format: "1:1", settings: { targetFormats: [] } }).returning();
    const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId: own.workspaceId, workItemId: work.id, creativeLevel: "balanced", targetFormat: "1:1", versionNumber: 1, operationKey: randomUUID(), frozenGuidance: frozen }).returning();
    const before = await getGuidanceSelection(own);
    await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: before.refs });
    const pinned = await getGuidanceSelection(own);
    const empty = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: pinned.version, refs: [] });
    const workBefore = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, work.id));
    const outputBefore = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id));
    await revertGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: empty.version });
    expect(await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, work.id))).toEqual(workBefore);
    expect(await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id))).toEqual(outputBefore);
    expect((await load(own)).appliedRefs).toEqual(numeric.appliedRefs);
    expect(await freezeSinglePieceOutputGuidance({ workspaceId: own.workspaceId, workItemId: work.id, outputId: output.id })).toEqual(frozen);
    expect((await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id)))[0].frozenGuidance).toEqual(frozen);
  });
  it("keeps an explicitly empty pin empty when further rules are approved", async () => {
    const { own } = await scope(); const before = await getGuidanceSelection(own);
    const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: [] });
    await db.insert(calibrationRules).values({ ...own, ...values("Mais uma aprovação") });
    expect(await load(own)).toMatchObject({ lines: [], appliedRefs: [], setHash: null });
    expect(await getGuidanceSelection(own)).toEqual(pinned);
  });
  it("pins exact bytes with author, date and previous selection; retirement wins without fallback", async () => {
    const { own, rules: [rule] } = await scope();
    const before = await getGuidanceSelection(own);
    const input = { ...own, reviewerUserId: ownerId, refs: before.refs, expectedVersion: before.version };
    const pinned = await pinGuidanceSelection(input);
    expect(pinned).toMatchObject({ refs: before.refs, pinnedBy: ownerId, previousSelection: { version: before.version, refs: before.refs, pinnedBy: null, pinnedAt: null } });
    expect(new Date(pinned.pinnedAt!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(await pinGuidanceSelection(input)).toEqual(pinned);
    await db.update(calibrationRules).set(values("Outra voz")).where(eq(calibrationRules.id, rule.id));
    expect((await load(own)).lines).toContain(rule.rationale);
    expect((await load(own)).appliedRefs).toEqual(before.refs);
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
    expect(await load(own)).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissions: [{ ruleId: rule.id, reason: "rule_retired" }] });
    expect(await getGuidanceSelection(own)).toEqual(pinned);
  });
  it("serializes competing pins, isolates scope and denies nonowners", async () => {
    const { own } = await scope(["A", "B"]);
    const before = await getGuidanceSelection(own);
    const base = { ...own, reviewerUserId: ownerId, expectedVersion: before.version };
    const results = await Promise.allSettled(before.refs.map(ref => pinGuidanceSelection({ ...base, refs: [ref] })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "selection_conflict" });
    const other = await scope();
    await expect(pinGuidanceSelection({ ...base, refs: (await getGuidanceSelection(other.own)).refs, expectedVersion: (await getGuidanceSelection(own)).version })).rejects.toMatchObject({ code: "invalid_reference" });
    await expect(pinGuidanceSelection({ ...base, refs: [], reviewerUserId: memberId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(pinGuidanceSelection({ ...base, refs: [], workspaceId: randomUUID() })).rejects.toMatchObject({ code: "not_found" });
  });
  it("keeps pin receipts immutable, replays the original receipt after a later pin and rejects ambiguous refs", async () => {
    const { own } = await scope(["Primeira", "Segunda"]);
    const before = await getGuidanceSelection(own);
    const input = { ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: [before.refs[0]] };
    const first = await pinGuidanceSelection(input);
    const next = await pinGuidanceSelection({ ...input, expectedVersion: first.version, refs: [before.refs[1]] });
    expect(await pinGuidanceSelection(input)).toEqual(first);
    expect(await getGuidanceSelection(own)).toEqual(next);
    for (const refs of [[before.refs[0], before.refs[0]], [{ ...before.refs[0], contentHash: "0".repeat(64) }], [{ ...before.refs[0], revision: 999 }]]) {
      await expect(pinGuidanceSelection({ ...input, expectedVersion: next.version, refs })).rejects.toMatchObject({ code: "invalid_reference" });
    }
    const where = eq(guidanceSelectionPins.clientProfileId, own.clientProfileId);
    await expect(db.update(guidanceSelectionPins).set({ expectedVersion: 999 }).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(db.delete(guidanceSelectionPins).where(where)).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(db.execute(sql`TRUNCATE adscale_app.guidance_selection_pins`)).rejects.toMatchObject({ cause: { code: "55000" } });
  });
  it("serializes concurrent automatic revisions without losing a rule, and a pin competing with approval", async () => {
    const { own, rules } = await scope(["A", "B"]);
    await Promise.all(rules.map(rule => db.update(calibrationRules).set(values(`${rule.rationale} revisada`)).where(eq(calibrationRules.id, rule.id))));
    const before = await getGuidanceSelection(own);
    expect(before.refs).toHaveLength(2); expect(before.refs.map(ref => ref.revision)).toEqual([2, 2]);
    const [pin] = await Promise.allSettled([
      pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: before.refs }),
      db.update(calibrationRules).set(values("A terceira revisão")).where(eq(calibrationRules.id, rules[0].id)),
    ]);
    const current = await getGuidanceSelection(own);
    if (pin.status === "fulfilled") {
      expect(current.refs).toEqual(before.refs); expect(current.pinnedBy).toBe(ownerId);
    } else {
      expect(pin.reason).toMatchObject({ code: "selection_conflict" });
      expect(current.pinnedBy).toBeNull(); expect(current.refs.find(ref => ref.ruleId === rules[0].id)?.revision).toBe(3);
    }
  });
  it("keeps retired pinned revisions invalid after reapproval and omits visual/scope mismatches without fallback", async () => {
    const { own, rules: [rule] } = await scope();
    const before = await getGuidanceSelection(own);
    await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: before.refs });
    const input = { ...own, ...target };
    expect(await loadLocalLearningPromptCalibrationContext({ ...input, format: "4:5" })).toMatchObject({ appliedRefs: [], omissions: [{ ruleId: rule.id, reason: "scope_mismatch" }] });
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
    await db.update(calibrationRules).set(values("Nova aprovação")).where(eq(calibrationRules.id, rule.id));
    expect(await load(own)).toMatchObject({ appliedRefs: [], omissions: [{ ruleId: rule.id, reason: "rule_retired" }] });
    const visual = await scope();
    await db.update(calibrationRules).set({ confirmedMetadata: { ...visual.rules[0].confirmedMetadata!, nature: "visual" } }).where(eq(calibrationRules.id, visual.rules[0].id));
    const selection = await getGuidanceSelection(visual.own);
    await pinGuidanceSelection({ ...visual.own, reviewerUserId: ownerId, expectedVersion: selection.version, refs: selection.refs });
    expect(await load(visual.own)).toMatchObject({ appliedRefs: [], omissions: [{ ruleId: visual.rules[0].id, reason: "visual_proof_missing" }] });
  });
  it("accepts exact Unicode, N and K boundaries and checks both wrapper languages", async () => {
    for (const text of ["😀".repeat(280), "e\u0301".repeat(140)]) {
      const { own } = await scope([text]); const before = await getGuidanceSelection(own);
      await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: before.refs });
      expect((await load(own)).lines).toContain(text);
    }
    const overhead = [...LEARNED_GUIDANCE_WRAPPERS["pt-BR"].join("\n")].length + 5;
    const points = 1500 - overhead;
    const texts = Array.from({ length: 5 }, (_, i) => String(i).repeat(Math.floor(points / 5) + (i < points % 5 ? 1 : 0)));
    const { own } = await scope(texts); const before = await getGuidanceSelection(own);
    await pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: [...before.refs].reverse() });
    const exact = await loadLocalLearningPromptCalibrationContext({ ...own, ...target, language: "pt-BR" });
    expect([...exact.lines.join("\n")]).toHaveLength(1500); expect(exact.appliedRefs).toHaveLength(5);
    expect((await load(own)).setHash).toBe(exact.setHash);
    const over = await scope(texts.map((text, i) => i ? text : text + "x")); const overflow = await getGuidanceSelection(over.own);
    const revisions = overflow.refs.map(ref => ({ ...ref, category: "voice" as const, roles: ["copy" as const], text: over.rules.find(rule => rule.id === ref.ruleId)!.rationale }));
    expect(renderLearnedGuidance({ role: "copy", language: "en", revisions }).appliedRefs).toHaveLength(5);
    await expect(pinGuidanceSelection({ ...over.own, reviewerUserId: ownerId, expectedVersion: overflow.version, refs: overflow.refs })).rejects.toMatchObject({ code: "budget_exceeded" });
  });

  it.each([
    ["N", Array.from({ length: 6 }, (_, i) => `Regra ${i}`)],
    ["M", ["😀".repeat(281)]],
    ["K", Array.from({ length: 5 }, (_, i) => String(i).repeat(260))],
  ])("rejects %s overflow without cutting or changing the selection", async (_label, texts) => {
    const { own } = await scope(texts);
    const before = await getGuidanceSelection(own);
    await expect(pinGuidanceSelection({ ...own, reviewerUserId: ownerId, expectedVersion: before.version, refs: before.refs })).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(await getGuidanceSelection(own)).toEqual(before);
  });
});
