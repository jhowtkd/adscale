import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import {
  user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs,
  creativeWorkSelectionDecisions, creativeWorkSelectionEffects, calibrationSignals, outputDecisionEvents,
  betaAnalyticsEvents, workspaceAssets,
} from "../db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { selectCreativeWorkOutputCommand } from "./select-creative-work-output";
import { runSelectionEffectsProcessor, processSelectionEffects, type ClaimedSelectionEffect } from "./process-selection-effects";
import { applyLearningSelectionEffect } from "./selection-learning-effect";
import { selecionarPeca } from "../mcp/tools";
import { listOutputDecisionEventsForClient } from "../repositories/output-decision-event";
import { listCalibrationSignalsForClientProfile } from "../repositories/calibration-signal";
import { buildBrandTasteProfile } from "../brand-taste/taste-profile";
import { aggregateOutputLearningsFromEvents } from "../output-learning/aggregate";
import { closeSelectionEffect, enqueueSelectionEffects } from "../repositories/selection-effects";
import { getCreativeWorkOutputForSelectionEffect } from "../repositories/creative-work";
import type { LocalLearningAuthorizationPort } from "../brand-taste/local-learning-authorization";

vi.mock("../mcp/audit", () => ({ auditMcpCall: vi.fn() }));
vi.mock("../storage", () => ({ objectStorage: { head: vi.fn(async () => ({ contentLength: 1 })) } }));
vi.mock("../output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));
vi.mock("../diagnostics/selection-export-tracing", () => ({ resolveLifecycleTraceContext: () => null }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Selection tests require matching local database URLs ending in _test");
  }
}
const creatorId = randomUUID();
const actorId = randomUUID();
const workspaceIds: string[] = [];

async function fixture() {
  const [workspace] = await db.insert(workspaces).values({ name: "Seleção simulada", slug: randomUUID() }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  const [work] = await db.insert(creativeWorkItems).values({
    workspaceId: workspace.id, clientProfileId: brand.id, createdByUserId: creatorId,
    title: "Trabalho simulado", request: "Teste", toolKind: "single", settings: { targetFormats: ["4:5"] },
    brief: { theme: "Teste", objective: "Teste", audience: "Teste", offer: "Teste" },
  }).returning();
  const outputs = await db.insert(creativeWorkOutputs).values([0, 1].map((index) => ({
    workspaceId: workspace.id, workItemId: work.id, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: index + 1,
    operationKey: randomUUID(), outputKey: `test/${randomUUID()}.png`, status: "completed" as const,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
  }))).returning();
  const input = { workspaceId: workspace.id, workItemId: work.id, outputId: outputs[0].id, userId: actorId, requestKey: randomUUID(), saveToLibrary: false };
  return { workspace, brand, work, outputs, input };
}

async function processLearning(workspaceId: string, authorize?: LocalLearningAuthorizationPort, fail = false) {
  const owner = randomUUID();
  return processSelectionEffects({
    owner,
    claim: async () => {
      // Scoped lease fixture: the production claim has its own Postgres suite.
      return db.update(creativeWorkSelectionEffects).set({
        state: "processing", leaseOwner: owner, attempts: sql`${creativeWorkSelectionEffects.attempts} + 1`,
      }).where(and(
        eq(creativeWorkSelectionEffects.workspaceId, workspaceId), eq(creativeWorkSelectionEffects.kind, "learning"),
        inArray(creativeWorkSelectionEffects.state, ["pending", "retry_wait"]),
      )).returning() as Promise<ClaimedSelectionEffect[]>;
    },
    loadScope: async (effect) => {
      const output = await getCreativeWorkOutputForSelectionEffect(effect.workspaceId, effect.workItemId, effect.outputId);
      return output?.outputKey ? { ...effect, outputKey: output.outputKey } : null;
    },
    sinks: {
      library: async () => { throw new Error("unexpected library effect"); },
      value_event: async () => { throw new Error("unexpected value effect"); },
      recipe: async () => { throw new Error("unexpected recipe effect"); },
      learning: async ({ effect }) => {
        if (fail) throw Object.assign(new Error("simulated failure"), { code: "ETIMEDOUT" });
        if (effect.payload.kind !== "learning") throw new Error("unexpected payload");
        return applyLearningSelectionEffect({ ...effect, selectionDecisionId: effect.payload.selectionDecisionId }, authorize);
      },
    },
    close: (id, resolution) => closeSelectionEffect(db, { id, owner, resolution }),
  });
}

async function rows<T extends typeof creativeWorkSelectionDecisions | typeof creativeWorkSelectionEffects | typeof outputDecisionEvents | typeof calibrationSignals>(table: T, workspaceId: string) {
  return db.select().from(table).where(eq(table.workspaceId, workspaceId));
}

describe.skipIf(!testUrl)("human composer selection to durable learning (Postgres)", () => {
  beforeAll(async () => {
    expect((await db.execute(sql`select current_database() as name`)).rows[0].name).toBe(new URL(testUrl!).pathname.slice(1));
    await db.insert(user).values([creatorId, actorId].map((id) => ({ id, name: "Pessoa simulada", email: `${id}@example.com` })));
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [creatorId, actorId]));
  });

  it("replays the original decision without changing the current choice; A→B→A creates three identities", async () => {
    const { input, outputs } = await fixture();
    const a = await selectCreativeWorkOutputCommand(input);
    expect(a).toMatchObject({ ok: true, value: { decision: { userId: actorId, previousDecisionId: null, previousOutputId: null } } });
    if (!a.ok) throw new Error("selection failed");
    const b = await selectCreativeWorkOutputCommand({ ...input, outputId: outputs[1].id, requestKey: randomUUID() });
    expect(b).toMatchObject({ ok: true, value: { decision: { previousDecisionId: a.value.decision!.id, previousOutputId: outputs[0].id } } });
    const replay = await selectCreativeWorkOutputCommand(input);
    expect(replay).toMatchObject({ ok: true, value: { decision: a.value.decision } });
    expect(await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, outputs[1].id))).toMatchObject([{ isSelected: true }]);
    expect(await selectCreativeWorkOutputCommand({ ...input, userId: creatorId })).toEqual({ ok: false, error: { code: "selection_decision_conflict" } });
    expect(await selectCreativeWorkOutputCommand({ ...input, outputId: outputs[1].id })).toEqual({ ok: false, error: { code: "selection_decision_conflict" } });
    expect(await selectCreativeWorkOutputCommand({ ...input, saveToLibrary: true })).toEqual({ ok: false, error: { code: "selection_decision_conflict" } });
    const again = await selectCreativeWorkOutputCommand({ ...input, requestKey: randomUUID() });
    expect(again.ok).toBe(true);
    const decisions = await rows(creativeWorkSelectionDecisions, input.workspaceId);
    expect(new Set(decisions.map((row) => row.id)).size).toBe(3);
    expect((await rows(creativeWorkSelectionEffects, input.workspaceId)).filter((row) => row.kind === "learning")).toHaveLength(3);
    expect(await db.select().from(betaAnalyticsEvents).where(eq(betaAnalyticsEvents.workspaceId, input.workspaceId))).toHaveLength(2);
    await processLearning(input.workspaceId);
    const events = await rows(outputDecisionEvents, input.workspaceId);
    expect(events).toHaveLength(3);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ action: "approved", direction: "positive", strength: "strong", userId: actorId, source: "composer", campaignId: null, derivationId: null })]));
    const signals = await rows(calibrationSignals, input.workspaceId);
    expect(signals).toHaveLength(3);
    expect(signals).toEqual(expect.arrayContaining([expect.objectContaining({ humanVerdict: "entra", sourceLabel: "real_customer", reviewerId: actorId, systemOlharVerdict: null, systemExportStatus: null })]));
    expect(events.find((row) => row.creativeWorkOutputId === outputs[1].id)?.contextSnapshot).toMatchObject({ format: "4:5", creativeLevel: "balanced", generationMode: "single" });
    expect(events.find((row) => row.idempotencyKey === `selection-decision:${a.value.decision!.id}:approved`)?.createdAt).toEqual(a.value.decision!.createdAt);
  });

  it("claims and processes the learning obligation through the production wiring", async () => {
    const { input } = await fixture();
    const selected = await selectCreativeWorkOutputCommand(input);
    if (!selected.ok) throw new Error("selection failed");
    const [effect] = await db.update(creativeWorkSelectionEffects).set({ requestedAt: new Date("0001-01-01T00:00:00Z") }).where(and(
      eq(creativeWorkSelectionEffects.workspaceId, input.workspaceId), eq(creativeWorkSelectionEffects.kind, "learning"),
    )).returning();
    expect(await runSelectionEffectsProcessor({ owner: randomUUID(), limit: 1 })).toEqual([{ effectId: effect.id, status: "done" }]);
    expect(await rows(outputDecisionEvents, input.workspaceId)).toMatchObject([{ userId: actorId, createdAt: selected.value.decision!.createdAt }]);
    expect(await rows(calibrationSignals, input.workspaceId)).toMatchObject([{ humanVerdict: "entra", sourceLabel: "real_customer" }]);
  });

  it("records human confirmation of an agent choice as a new attributed decision", async () => {
    const { input } = await fixture();
    const agent = await selectCreativeWorkOutputCommand({ ...input, requestKey: randomUUID(), actorId: "mcp-test-prefix", selectedBy: "agent" });
    expect(agent).toMatchObject({ ok: true, value: { output: { selectedBy: "agent" }, decision: { authorType: "agent", userId: actorId } } });
    expect(await rows(creativeWorkSelectionDecisions, input.workspaceId)).toHaveLength(1);
    expect(await rows(creativeWorkSelectionEffects, input.workspaceId)).toMatchObject([{ kind: "learning" }]);
    expect(await selectCreativeWorkOutputCommand(input)).toMatchObject({ ok: true, value: { decision: { userId: actorId, previousOutputId: input.outputId }, output: { selectedBy: "operator" } } });
    await processLearning(input.workspaceId);
    expect(await rows(calibrationSignals, input.workspaceId)).toHaveLength(1);
  });

  it("keeps MCP authorship through recovery, then confirms the same piece as a new human decision", async () => {
    const { input, outputs } = await fixture();
    const ctx = { workspaceId: input.workspaceId, userId: actorId, tokenPrefix: "mcp-test-prefix", tokenId: randomUUID() };
    const args = { trabalho_id: input.workItemId, peca_id: input.outputId, chave_requisicao: randomUUID() };
    expect(await selecionarPeca(ctx, args)).toMatchObject({ ok: true, data: { selecionada_por: "agent" } });
    const [agent] = await rows(creativeWorkSelectionDecisions, input.workspaceId);
    expect(agent).toMatchObject({ authorType: "agent", actorId: ctx.tokenId, userId: actorId });
    expect(await rows(creativeWorkSelectionEffects, input.workspaceId)).toMatchObject([{ kind: "learning" }]);
    expect(await processLearning(input.workspaceId, undefined, true)).toMatchObject([{ status: "retry_scheduled" }]);
    expect(await processLearning(input.workspaceId)).toMatchObject([{ status: "done" }]);
    expect(await rows(outputDecisionEvents, input.workspaceId)).toMatchObject([{
      authorType: "agent", actorId: ctx.tokenId, userId: actorId, action: "selected_for_delivery",
      direction: "positive", strength: "medium", createdAt: agent.createdAt, source: "mcp",
    }]);
    expect(await rows(calibrationSignals, input.workspaceId)).toEqual([]);
    expect(await listOutputDecisionEventsForClient(agent.clientProfileId!, input.workspaceId)).toEqual([]);
    expect(aggregateOutputLearningsFromEvents(await rows(outputDecisionEvents, input.workspaceId))).toEqual([]);
    expect(await db.select().from(betaAnalyticsEvents).where(eq(betaAnalyticsEvents.workspaceId, input.workspaceId))).toEqual([]);
    expect(await db.select().from(workspaceAssets).where(eq(workspaceAssets.workspaceId, input.workspaceId))).toEqual([]);
    expect(await selecionarPeca(ctx, args)).toMatchObject({ ok: true, data: { decisao_id: agent.id } });
    expect(await selecionarPeca({ ...ctx, tokenId: randomUUID() }, args)).toMatchObject({ ok: false, code: "selecao_selection_decision_conflict" });
    expect(await selectCreativeWorkOutputCommand({ ...input, requestKey: args.chave_requisicao })).toMatchObject({ ok: false, error: { code: "selection_decision_conflict" } });
    const confirmation = { ...input, userId: creatorId, requestKey: randomUUID() };
    const [first, replay] = await Promise.all([selectCreativeWorkOutputCommand(confirmation), selectCreativeWorkOutputCommand(confirmation)]);
    if (!first.ok || !replay.ok) throw new Error("confirmation failed");
    expect(first.value.decision).toEqual(replay.value.decision);
    expect(first.value.decision).toMatchObject({ authorType: "human", userId: creatorId, actorId: null,
      previousDecisionId: agent.id, previousOutputId: input.outputId });
    expect(first.value.decision!.id).not.toBe(agent.id);
    expect(await selecionarPeca(ctx, args)).toMatchObject({ ok: true, data: { decisao_id: agent.id, selecionada_por: "operator" } });
    expect(await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, outputs[0].id))).toMatchObject([{ isSelected: true, selectedBy: "operator" }]);
    await processLearning(input.workspaceId);
    await applyLearningSelectionEffect({ ...input, selectionDecisionId: agent.id });
    await applyLearningSelectionEffect({ ...input, selectionDecisionId: first.value.decision!.id });
    expect(await rows(creativeWorkSelectionDecisions, input.workspaceId)).toHaveLength(2);
    const events = await rows(outputDecisionEvents, input.workspaceId);
    expect(events).toHaveLength(2);
    expect(events.find(event => event.authorType === "agent")).toMatchObject({ action: "selected_for_delivery", userId: actorId });
    expect(events.find(event => event.authorType === "human")).toMatchObject({ action: "approved", userId: creatorId, strength: "strong" });
    expect(await listOutputDecisionEventsForClient(agent.clientProfileId!, input.workspaceId)).toHaveLength(1);
    const signals = await listCalibrationSignalsForClientProfile({ workspaceId: input.workspaceId, clientProfileId: agent.clientProfileId! });
    expect(signals).toMatchObject([{ authorType: "human", reviewerId: creatorId, humanVerdict: "entra" }]);
    expect(buildBrandTasteProfile({ workspaceId: input.workspaceId, clientProfileId: agent.clientProfileId!, signals }).decisionCount).toBe(1);
  });

  it("still blocks objective failure for agent selection and subsequent human confirmation", async () => {
    const { input } = await fixture();
    const agentInput = { ...input, selectedBy: "agent" as const, actorId: "mcp-test-prefix" };
    expect((await selectCreativeWorkOutputCommand(agentInput)).ok).toBe(true);
    await db.update(creativeWorkOutputs).set({ quality: { schemaVersion: 1, objectiveVerdict: "fail" } }).where(eq(creativeWorkOutputs.id, input.outputId));
    for (const selection of [input, agentInput]) {
      expect(await selectCreativeWorkOutputCommand({ ...selection, requestKey: randomUUID(), confirmObjective: true }))
        .toMatchObject({ ok: false, error: { code: "objective_selection_blocked" } });
    }
    expect(await rows(creativeWorkSelectionDecisions, input.workspaceId)).toHaveLength(1);
    expect(await rows(calibrationSignals, input.workspaceId)).toEqual([]);
  });

  it("concurrent requests with the same key converge on one decision and effect", async () => {
    const { input } = await fixture();
    const results = await Promise.all([selectCreativeWorkOutputCommand(input), selectCreativeWorkOutputCommand(input)]);
    expect(results.every((result) => result.ok)).toBe(true);
    if (!results[0].ok || !results[1].ok) throw new Error("selection failed");
    expect(results[0].value.decision).toEqual(results[1].value.decision);
    expect(await rows(creativeWorkSelectionDecisions, input.workspaceId)).toHaveLength(1);
    expect((await rows(creativeWorkSelectionEffects, input.workspaceId)).filter((row) => row.kind === "learning")).toHaveLength(1);
  });

  it("rolls back choice and decision when the learning obligation cannot be inserted", async () => {
    const { input } = await fixture();
    const trigger = `selection_test_${randomUUID().replaceAll("-", "")}`;
    await db.execute(sql.raw(`CREATE FUNCTION adscale_app.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.work_item_id = '${input.workItemId}' AND NEW.kind = 'learning' THEN RAISE EXCEPTION 'simulated outbox failure'; END IF; RETURN NEW; END $$`));
    await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON adscale_app.creative_work_selection_effects FOR EACH ROW EXECUTE FUNCTION adscale_app.${trigger}()`));
    try {
      await expect(selectCreativeWorkOutputCommand(input)).rejects.toThrow();
      expect(await rows(creativeWorkSelectionDecisions, input.workspaceId)).toEqual([]);
      expect(await rows(creativeWorkSelectionEffects, input.workspaceId)).toEqual([]);
      expect(await db.select().from(creativeWorkOutputs).where(and(eq(creativeWorkOutputs.workItemId, input.workItemId), eq(creativeWorkOutputs.isSelected, true)))).toEqual([]);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON adscale_app.creative_work_selection_effects`));
      await db.execute(sql.raw(`DROP FUNCTION adscale_app.${trigger}()`));
    }
  });

  it.each(["local_learning_denied", "brand_out_of_scope"] as const)("settles %s permanently without projecting after a later grant", async (reason) => {
    const { input } = await fixture();
    expect((await selectCreativeWorkOutputCommand(input)).ok).toBe(true);
    const deny = vi.fn(async () => ({ allowed: false as const, reason }));
    expect(await processLearning(input.workspaceId, deny)).toMatchObject([{ status: "done" }]);
    expect((await rows(creativeWorkSelectionEffects, input.workspaceId)).find((row) => row.kind === "learning")).toMatchObject({ state: "done", errorCode: reason });
    expect(await rows(outputDecisionEvents, input.workspaceId)).toEqual([]);
    expect(await rows(calibrationSignals, input.workspaceId)).toEqual([]);
    const grant = vi.fn(async () => ({ allowed: true as const }));
    expect(await processLearning(input.workspaceId, grant)).toEqual([]);
    expect(grant).not.toHaveBeenCalled();
  });

  it("keeps selection, library and value settled across a projection failure and idempotent recovery", async () => {
    const { input } = await fixture();
    const selection = await selectCreativeWorkOutputCommand({ ...input, saveToLibrary: true });
    expect(selection).toMatchObject({ ok: true, value: { effects: { library: { status: "done" }, valueEvent: { status: "done" } } } });
    expect(await processLearning(input.workspaceId, undefined, true)).toMatchObject([{ status: "retry_scheduled" }]);
    const effects = await rows(creativeWorkSelectionEffects, input.workspaceId);
    expect(effects.find((row) => row.kind === "learning")).toMatchObject({ state: "pending", attempts: 1, errorCode: "ETIMEDOUT" });
    expect(effects.filter((row) => row.kind !== "learning").every((row) => row.state === "done")).toBe(true);
    expect(await db.select().from(workspaceAssets).where(eq(workspaceAssets.workspaceId, input.workspaceId))).toHaveLength(1);
    expect(await processLearning(input.workspaceId)).toMatchObject([{ status: "done" }]);
    if (!selection.ok) throw new Error("selection failed");
    await applyLearningSelectionEffect({ ...input, selectionDecisionId: selection.value.decision!.id });
    expect(await rows(outputDecisionEvents, input.workspaceId)).toHaveLength(1);
    expect(await rows(calibrationSignals, input.workspaceId)).toHaveLength(1);
    expect(await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, input.outputId))).toMatchObject([{ isSelected: true }]);
  });

  it("enforces learning decision references and preserves legacy effect deduplication", async () => {
    const { input } = await fixture();
    const selected = await selectCreativeWorkOutputCommand(input);
    if (!selected.ok) throw new Error("selection failed");
    const base = { workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: input.outputId, requestedAt: new Date() };
    await expect(db.insert(creativeWorkSelectionEffects).values({ ...base, kind: "learning", idempotencyKey: randomUUID(), payload: { version: 1, kind: "learning", selectionDecisionId: selected.value.decision!.id } })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(creativeWorkSelectionEffects).values({ ...base, kind: "unknown" as never, idempotencyKey: randomUUID(), payload: { version: 1, kind: "recipe", receiptId: "test" } })).rejects.toMatchObject({ cause: { code: "23514" } });
    for (const kind of ["library", "recipe"] as const) {
      const effect = kind === "library" ? { kind, payload: { kind, version: 1 as const, outputKey: "test", theme: "test", creativeLevel: "balanced" } } : { kind, payload: { kind, version: 1 as const, receiptId: "test" } };
      const first = await enqueueSelectionEffects(db, { ...base, effects: [effect] });
      const replay = await enqueueSelectionEffects(db, { ...base, effects: [effect] });
      expect(first[0].effect.id).toBe(replay[0].effect.id);
      expect(replay[0].created).toBe(false);
    }
  });
});
