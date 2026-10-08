// equipe-agent-work: event trigger plus per-account concurrency, no retries,
// and the turn_failed failure event.

import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "../module/commands";
import { getItemDetail } from "../module/queries";
import { ctx, deliverTestBatch, seedWork, setup } from "../module/testing/items";
import { makeTestDeps, openTestAccount, uuid } from "../module/testing/deps";
import { MemoryLedgerStore } from "./ledger";
import { createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";
import { openTestRound, scoreAll, setupCalibration } from "../module/testing/calibration";
import { buildStrategistTools, executeStrategistTool } from "./strategist";
import { inngest } from "@/server/jobs/client";
import {
  EQUIPE_AGENT_WORK_EVENT,
  EQUIPE_AGENT_WORK_ID,
  buildEquipeAgentWorkJob,
  createAgentWorkHandler,
  TURN_FAILED_EVENT,
  equipeAgentWorkHandler,
  equipeAgentWorkJob,
  recordAgentTurnFailed,
} from "./agent-work";

describe("equipeAgentWorkJob", () => {
  it("triggers on the agent work event with concurrency 1 per account and no retries", () => {
    expect(EQUIPE_AGENT_WORK_ID).toBe("equipe-agent-work");
    expect(EQUIPE_AGENT_WORK_EVENT).toBe("equipe.agent.work");
    const opts = (
      equipeAgentWorkJob as unknown as {
        opts: {
          id?: string;
          retries?: number;
          concurrency?: Array<{ limit: number; key?: string }>;
          triggers?: Array<{ event?: string }>;
        };
      }
    ).opts;
    expect(opts.id).toBe("equipe-agent-work");
    // A retry would re-run the whole turn: duplicated commands and a
    // double ledger charge. Failures record agent.turn_failed instead.
    expect(opts.retries).toBe(0);
    expect(opts.concurrency).toEqual([{ limit: 1, key: "event.data.accountId" }]);
    expect(opts.triggers).toEqual([{ event: "equipe.agent.work" }]);
  });

  it("throws on an invalid event", async () => {
    const step = { run: vi.fn(async () => ({ unreachable: true })) };
    await expect(
      equipeAgentWorkHandler({ event: { data: { kind: "research" } }, step }),
    ).rejects.toThrow(/invalid equipe\.agent\.work event/);
    expect(step.run).not.toHaveBeenCalled();
  });
});

describe("recordAgentTurnFailed", () => {
  it("records agent.turn_failed for the account through the unit of work", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const at = new Date("2026-10-15T12:00:00.000Z");
    await recordAgentTurnFailed(
      t.deps.uow,
      { workspaceId: account.workspaceId, accountId: account.accountId },
      { taskKind: "research", error: "model timeout" },
      at,
    );
    const events = await t.deps.uow.repos.events.list({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
    });
    const failed = events.find((event) => event.eventType === TURN_FAILED_EVENT);
    expect(failed).toMatchObject({
      actorType: "agent",
      actorId: "estrategista",
      payload: { taskKind: "research", error: "model timeout" },
    });
    // Both stores keep the passed occurredAt; the stamp is the fallback.
    expect(failed?.occurredAt).toBeInstanceOf(Date);
  });
});

describe("agent work journey", () => {
  it("routes calibration_correction to human production and resumes only in Quality conference", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await scoreAll(t, ids, round.roundId, [itemId]);
    const returned = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix", payload: { roundId: round.roundId, itemId, note: "Refazer a Peça com o tom aprovado" },
    });
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    const source = returned.value.events.find((event) => event.eventType === "agent_work.requested")!;
    expect(source.payload).toMatchObject({ kind: "calibration_correction" });
    const model = vi.fn(async () => { throw new Error("human correction must not invoke a model"); });
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => ({ runTask: model }) });
    const event = { id: source.id, data: { ...scope, kind: "calibration_correction", sourceEventId: source.id } };
    for (const runId of ["calibration-human", "calibration-redelivery"]) {
      await handler({ event, step: { run: (_name, fn) => fn() }, runId });
    }
    expect(model).not.toHaveBeenCalled();
    const item = await t.deps.uow.repos.items.get(scope, itemId);
    const exceptions = await t.deps.uow.repos.exceptions.list(scope);
    expect(exceptions).toEqual([expect.objectContaining({ trigger: "production_fix", dueAt: new Date("2026-10-06T14:00:00.000Z") })]);
    expect(exceptions[0]?.reason).toContain(item!.creativeWorkId);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "support_exception.opened" })).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ itemId, workId: item!.creativeWorkId, roundId: round.roundId, sourceEventId: source.id }) }),
    ]);
    const resumed = await executeStrategistTool(buildStrategistTools({ deps: t.deps, ...scope }), "submit_corrected_version", JSON.stringify({
      roundId: round.roundId, itemId, caption: "Versão corrigida para conferência",
    }));
    expect(resumed).toMatchObject({ ok: true, result: { ok: true } });
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "round.item_corrected" })).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "round.item_released" })).toHaveLength(0);
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
    expect(await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemId)).toBeNull();
  });

  it("applies a fake review to the current version without approving it", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "Legenda original" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "Legenda editada" },
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const client = new FakeModelClient([{ content: JSON.stringify({
      findings: [{ severity: "warning", area: "brand", message: "Tom informal", suggestion: null }],
      summary: "Revisão concluída.", natures: ["none"],
    }) }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger: new MemoryLedgerStore() });
    const runtime = { depsFor: () => t.deps, agentsFor: () => agents };
    const handler = createAgentWorkHandler(runtime);
    const result = await handler({
      event: { id: source.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "review_caption", sourceEventId: source.id } },
      step: { run: (_name, fn) => fn() }, runId: "run-review-1",
    });

    expect(result).toMatchObject({ refused: false });
    expect(client.requests).toHaveLength(1);
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.versions.find((version) => version.versionHash === edited.value.data.versionHash)?.caption).toBe("Legenda editada");
    expect(detail?.review.status).toBe("edit_with_warning");
    expect(await t.deps.uow.repos.receipts.list({ workspaceId: ids.workspaceId, accountId: ids.accountId })).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list({ workspaceId: ids.workspaceId, accountId: ids.accountId })).toHaveLength(0);
    expect((await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "item.approved" }))).toHaveLength(0);
  });

  it("routes caption revalidation, adjustment, replacement, and reschedule through the job", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{}, {}, {}, { scheduledFor: new Date("2026-10-05T15:00:00.000Z") }],
    });
    const sourceEvents = [];
    const caption = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "Nova legenda" },
    });
    expect(caption.ok).toBe(true);
    if (!caption.ok) return;
    sourceEvents.push(caption.value.events.find((event) => event.eventType === "agent_work.requested")!);
    const adjustment = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment", payload: { itemId: itemIds[1]!, category: "brand", note: "Ajustar tom" },
    });
    expect(adjustment.ok).toBe(true);
    if (!adjustment.ok) return;
    sourceEvents.push(adjustment.value.events.find((event) => event.eventType === "agent_work.requested")!);
    const replacement = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "decline_publish", payload: { itemId: itemIds[2]!, reason: "Prefiro outra ideia" },
    });
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    sourceEvents.push(replacement.value.events.find((event) => event.eventType === "agent_work.requested")!);
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline", payload: { itemId: itemIds[3]! },
    });
    const reschedule = await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent_work.requested" });
    sourceEvents.push(reschedule.find((event) => event.objectId === itemIds[3])!);

    const outputs: Record<string, unknown> = {
      review_caption: { findings: [], summary: "Revisado.", natures: ["none"] },
      plan_adjustment: { caption: "Legenda ajustada" },
      plan_replacement: { title: "Nova pauta", description: "Ideia substituta" },
      plan_reschedule: { scheduledFor: "2026-10-20T12:00:00.000Z" },
    };
    const kinds: string[] = [];
    const handler = createAgentWorkHandler({
      depsFor: () => t.deps,
      agentsFor: () => ({ runTask: async (task) => {
        kinds.push(task.kind);
        return { ok: true as const, output: outputs[task.kind]! };
      } }),
    });
    for (const [index, event] of sourceEvents.entries()) {
      const kind = (event.payload as { kind: string }).kind;
      await handler({
        event: { id: event.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind, sourceEventId: event.id } },
        step: { run: (_name, fn) => fn() }, runId: `kind-run-${index}`,
      });
    }

    expect(kinds).toEqual(["review_caption", "plan_adjustment", "plan_replacement", "plan_reschedule"]);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect((await t.deps.uow.repos.items.get(scope, itemIds[1]!))?.status).toBe("adjusting");
    expect((await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[1]! })).some((version) => version.caption === "Legenda ajustada")).toBe(true);
    expect((await t.deps.uow.repos.ideas.list(scope)).some((idea) => idea.status === "proposed")).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[3]!))?.status).toBe("awaiting_approval");
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.some((event) => event.eventType === "item.approved" && itemIds.includes(event.objectId ?? ""))).toBe(false);
    expect(versionHashes).toHaveLength(4);
  });

  it("keeps a newer caption when an old review finishes late", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "Primeira edição" },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const source = first.value.events.find((event) => event.eventType === "agent_work.requested")!;
    let submittedVersion = false;
    const runtime = {
      depsFor: () => t.deps,
      agentsFor: () => ({ runTask: async () => {
        if (!submittedVersion) {
          submittedVersion = true;
          const newer = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
            type: "submit_item_version", payload: {
              itemId: itemIds[0]!, expectedVersionHash: first.value.data.versionHash as string, caption: "Edição mais nova",
            },
          });
          expect(newer.ok).toBe(true);
        }
        return { ok: true as const, output: { findings: [], summary: "Stale", natures: ["none"] } };
      } }),
    };
    const handler = createAgentWorkHandler(runtime);
    await handler({
      event: { id: source.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "review_caption", sourceEventId: source.id } },
      step: { run: (_name, fn) => fn() }, runId: "run-stale-review",
    });

    const item = await t.deps.uow.repos.items.get({ workspaceId: ids.workspaceId, accountId: ids.accountId }, itemIds[0]!);
    const current = await t.deps.uow.repos.itemVersions.getByHash({ workspaceId: ids.workspaceId, accountId: ids.accountId }, itemIds[0]!, item!.currentVersionHash!);
    expect(current?.caption).toBe("Edição mais nova");
    const reviews = await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "item.reviewed" });
    expect(reviews).toHaveLength(0);
  });

  it("submits a new Peça from the same Trabalho and blocks a visual finding", async () => {
    const { t, ids } = await setup();
    const original = seedWork(t, ids.workspaceId);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ workId: original.workId, outputId: original.outputId, caption: "Legenda" }],
    });
    const adjustment = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment", payload: { itemId: itemIds[0]!, category: "brand", note: "Atualizar direção" },
    });
    expect(adjustment.ok).toBe(true);
    const replacement = uuid();
    const foreign = seedWork(t, ids.workspaceId);
    t.gateway.addOutput({ id: replacement, workspaceId: ids.workspaceId, workId: original.workId, imageUrl: "https://cdn.example.test/new-piece.png" });
    const mismatch = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_item_version", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]!, caption: "Legenda nova", creativeWorkOutputId: foreign.outputId },
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error.code).toBe("output_work_mismatch");

    const submitted = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_item_version", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]!, caption: "Legenda nova", creativeWorkOutputId: replacement },
    });
    expect(submitted.ok, submitted.ok ? "" : `${submitted.error.code}: ${submitted.error.message}`).toBe(true);
    if (!submitted.ok) return;
    const request = submitted.value.events.find((event) => event.eventType === "agent_work.requested")!;
    expect(request.payload).toMatchObject({ kind: "caption_revalidation", reviewVisual: true });

    const client = new FakeModelClient([
      { content: JSON.stringify({ findings: [], summary: "Texto correto.", natures: ["none"] }) },
      { content: JSON.stringify({ findings: [{ severity: "blocking", area: "visual", message: "Imagem fora do briefing", suggestion: "Usar a nova direção." }], summary: "Imagem divergente." }) },
    ]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger: new MemoryLedgerStore() });
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => agents });
    await handler({
      event: { id: request.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "review_caption", sourceEventId: request.id } },
      step: { run: (_name, fn) => fn() }, runId: "run-visual-review",
    });

    expect(client.requests).toHaveLength(2);
    expect(JSON.stringify(client.requests[1]?.messages)).toContain("https://cdn.example.test/new-piece.png");
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.review.status).toBe("blocked");
    expect(detail?.findings.find((version) => version.versionHash === request.payload.versionHash)?.findings).toMatchObject({
      blocked: true,
      findings: [expect.objectContaining({ message: "Imagem fora do briefing", severity: "blocking" })],
    });
    expect(await t.deps.uow.repos.receipts.listByObject({ workspaceId: ids.workspaceId, accountId: ids.accountId }, "item", itemIds[0]!)).toHaveLength(0);
  });

  it("uses the Inngest failure envelope and escalates a failed run", async () => {
    const { t, ids } = await setup();
    const runtime = { depsFor: () => t.deps, agentsFor: () => ({ runTask: async () => ({ ok: true as const, output: {} }) }) };
    const job = buildEquipeAgentWorkJob(inngest, { id: "test-agent-work-failure", eventName: "equipe.agent.work" }, runtime);
    const onFailure = (job as unknown as { opts: { onFailure: (input: unknown) => Promise<void> } }).opts.onFailure;
    const request = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_support", payload: { note: "failure trigger" },
    });
    expect(request.ok).toBe(true);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await onFailure({
      event: { data: { run_id: "inngest-run-591", event: { data: {
        workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "review_caption",
      } } } },
      error: new Error("model timeout"),
    });
    const events = await t.deps.uow.repos.events.list(scope);
    const failed = events.find((event) => event.eventType === TURN_FAILED_EVENT);
    expect(failed?.payload).toMatchObject({ taskKind: "review_caption", error: "model timeout", runId: "inngest-run-591" });
    const escalation = (await t.deps.uow.repos.escalations.list(scope))[0];
    expect(escalation).toMatchObject({ kind: "technical", ownerRole: "operations", status: "open" });
  });
});
