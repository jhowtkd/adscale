// Estrategista tools: no approval action, hallucinations rejected, and a
// full turn proposing a plan through executeCommand as actor `agent`.

import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
}));
import { executeCommand } from "../module/commands";
import { getGoalsView } from "../module/queries";
import { makeTestDeps, openTestAccount } from "../module/testing/deps";
import {
  buildStrategistTools,
  executeStrategistTool,
  runStrategistTurn,
  strategistCommandTypes,
  STRATEGIST_AGENT_ID,
} from "./strategist";
import { FakeModelClient } from "./testing";
import { frontIdOf, seedWork } from "../module/testing/items";
import { encryptEquipeIgToken } from "../publishing/crypto";

describe("strategist tools", () => {
  it("exposes no approval action", () => {
    const t = makeTestDeps();
    const tools = buildStrategistTools({ deps: t.deps, workspaceId: "w", accountId: "a" });
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("approve_plan");
    expect(names.some((name) => name.startsWith("approve_"))).toBe(false);
    expect(strategistCommandTypes().some((type) => type.startsWith("approve_"))).toBe(false);
    expect(strategistCommandTypes()).toEqual([
      "propose_context_section",
      "propose_plan",
      "propose_mandate",
      "advance_onboarding",
      "deliver_batch",
      "submit_item_version",
      "submit_corrected_version",
    ]);
    expect(names).toContain("get_pipeline");
    expect(names).toContain("get_item");
    expect(names).toContain("deliver_batch");
    expect(names).toContain("submit_item_version");
    expect(names).toContain("submit_corrected_version");
  });

  it("rejects a hallucinated approval call before the module", async () => {
    const t = makeTestDeps();
    const tools = buildStrategistTools({ deps: t.deps, workspaceId: "w", accountId: "a" });
    const execution = await executeStrategistTool(
      tools,
      "approve_plan",
      JSON.stringify({ expectedVersionHash: "whatever-the-model-invented" }),
    );
    expect(execution.ok).toBe(false);
    expect(execution.ok ? "" : execution.error).toMatch(/unknown tool "approve_plan"/);
  });

  it.each([
    { modelDestination: undefined, igUsername: "connected-brand", destination: "instagram:@connected-brand" },
    { modelDestination: "instagram:@model-invented", igUsername: null, destination: "instagram:ig_1" },
  ])("derives $destination from the account connection, ignoring model input", async ({ modelDestination, igUsername, destination }) => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await t.deps.uow.repos.connections.create(scope, {
      provider: "instagram", status: "active",
      encryptedToken: encryptEquipeIgToken({ accessToken: "private-token", igUserId: "ig_1", igUsername }),
    });
    const work = seedWork(t, ids.workspaceId);
    const tools = buildStrategistTools({ deps: t.deps, ...scope });
    expect(JSON.stringify(tools.find((tool) => tool.name === "deliver_batch")?.parameters)).not.toContain("destinationAccount");
    const execution = await executeStrategistTool(tools, "deliver_batch", JSON.stringify({
      title: "Lote", frontId: await frontIdOf(t, ids, "social_instagram"), approveByAt: "2026-10-07T17:00:00.000Z",
      items: [{ creativeWorkId: work.workId, creativeWorkOutputId: work.outputId, caption: "Legenda",
        scheduledFor: "2026-10-09T12:00:00.000Z", needsConfirmation: false, destinationAccount: modelDestination }],
    }));
    expect(execution).toMatchObject({ ok: true, result: { ok: true } });
    expect(JSON.stringify(execution)).not.toContain("private-token");
    const items = await t.deps.uow.repos.items.list(scope);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ destination, status: "awaiting_approval" });
    expect((await t.deps.uow.repos.itemVersions.list(scope, { itemId: items[0]!.id }))[0]?.destination).toBe(destination);
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it.each(["missing", "expired"])("delivers a neutral manual batch when the connection is %s, never using another account", async (connectionState) => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t, { fronts: ["social_instagram", "midia_paga"] });
    const foreign = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const connection = { provider: "instagram", status: "active" as const,
      encryptedToken: encryptEquipeIgToken({ accessToken: "private-token", igUserId: "ig_1", igUsername: "brand" }) };
    await t.deps.uow.repos.connections.create({ workspaceId: foreign.workspaceId, accountId: foreign.accountId }, connection);
    if (connectionState === "expired") {
      await t.deps.uow.repos.connections.create(scope, { ...connection, status: "expired" });
    }
    const work = seedWork(t, ids.workspaceId);
    const tools = buildStrategistTools({ deps: t.deps, ...scope });
    const payload = {
      title: "Lote", frontId: await frontIdOf(t, ids, "social_instagram"), approveByAt: "2026-10-07T17:00:00.000Z",
      items: [{ creativeWorkId: work.workId, creativeWorkOutputId: work.outputId, caption: "Legenda",
        scheduledFor: "2026-10-09T12:00:00.000Z", needsConfirmation: false, destinationAccount: "instagram:@brand" }],
    };
    for (const frontId of [await frontIdOf(t, ids, "midia_paga"), await frontIdOf(t, foreign, "social_instagram")]) {
      expect(await executeStrategistTool(tools, "deliver_batch", JSON.stringify({ ...payload, frontId }))).toMatchObject({ ok: false, error: expect.stringContaining("social_instagram front") });
    }
    expect(await t.deps.uow.repos.batches.list(scope)).toHaveLength(0);
    expect(await executeStrategistTool(tools, "deliver_batch", JSON.stringify(payload))).toMatchObject({ ok: true, result: { ok: true } });
    const items = await t.deps.uow.repos.items.list(scope);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item).toMatchObject({ destination: "instagram", status: "awaiting_approval" });
    expect((await t.deps.uow.repos.itemVersions.list(scope, { itemId: item.id }))[0]?.destination).toBe("instagram");
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    const clientCtx = { ...scope, actor: ids.actors.approver };
    expect((await executeCommand(t.deps, clientCtx, { type: "agree_manual_mode", payload: {} })).ok).toBe(true);
    expect((await executeCommand(t.deps, clientCtx, {
      type: "approve_item", payload: { itemId: item.id, expectedVersionHash: item.currentVersionHash },
    })).ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, item.id))?.status).toBe("available_for_download");
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.batches.list({ workspaceId: foreign.workspaceId, accountId: foreign.accountId })).toHaveLength(0);
  });

  it("rejects any unknown tool name", async () => {
    const t = makeTestDeps();
    const tools = buildStrategistTools({ deps: t.deps, workspaceId: "w", accountId: "a" });
    const execution = await executeStrategistTool(tools, "delete_everything", "{}");
    expect(execution.ok).toBe(false);
  });

  it("the agent cannot approve: the module refuses an agent approval", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const outcome = await executeCommand(
      t.deps,
      { actor: account.actors.agent, workspaceId: account.workspaceId, accountId: account.accountId },
      { type: "approve_plan", payload: { expectedVersionHash: "v1" } },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error.code).toBe("forbidden_actor");
  });

  it("runs a turn that proposes a plan as the agent actor", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const client = new FakeModelClient([
      {
        content: null,
        toolCalls: [
          {
            id: "call-1",
            name: "propose_plan",
            argumentsJson: JSON.stringify({ content: { goals: ["launch instagram"] } }),
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      { content: "Plano proposto, aguardando sua aprovação.", usage: { inputTokens: 200, outputTokens: 20 } },
    ]);
    const calls: Array<{ model: string; inputTokens: number; outputTokens: number }> = [];
    const result = await runStrategistTurn({
      client,
      ctx: { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId },
      message: "Monte o plano da conta.",
      onModelCall: async (call) => {
        calls.push(call);
      },
    });
    expect(result.text).toBe("Plano proposto, aguardando sua aprovação.");
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.promptVersion).toBe("equipe-prompts/v2");
    expect(calls).toHaveLength(2);

    const goals = await getGoalsView(t.deps.uow.repos, account.workspaceId, account.accountId);
    expect(goals?.plan?.status).toBe("proposed");

    const events = await t.deps.uow.repos.events.list({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
    });
    const proposal = events.find((event) => event.eventType === "plan.proposed");
    expect(proposal?.actorType).toBe("agent");
    expect(proposal?.actorId).toBe(STRATEGIST_AGENT_ID);
  });

  it("sends the role effort and a reasoning-sized limit on every step", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const client = new FakeModelClient([
      {
        content: null,
        toolCalls: [{ id: "call-1", name: "get_goals", argumentsJson: "{}" }],
      },
      { content: "Resumo." },
    ]);
    await runStrategistTurn({
      client,
      ctx: { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId },
      message: "Metas?",
    });
    expect(client.requests).toHaveLength(2);
    for (const request of client.requests) {
      expect(request.model).toBe("claude-opus-5-5");
      expect(request.effort).toBe("high");
      expect(request.maxTokens).toBe(16000);
    }
  });

  it("sends cache auto with identical system/tools bytes on every iteration", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const client = new FakeModelClient([
      {
        content: null,
        toolCalls: [{ id: "call-1", name: "get_goals", argumentsJson: "{}" }],
      },
      { content: "Resumo." },
    ]);
    await runStrategistTurn({
      client,
      ctx: { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId },
      message: "Metas?",
    });
    expect(client.requests).toHaveLength(2);
    for (const request of client.requests) {
      expect(request.cache).toBe("auto");
    }
    const systems = client.requests.map((request) =>
      request.messages.filter((message) => message.role === "system"),
    );
    expect(systems[0]).toHaveLength(1);
    expect(JSON.stringify(systems[1])).toBe(JSON.stringify(systems[0]));
    const tools = client.requests.map((request) => JSON.stringify(request.tools));
    expect(tools[1]).toBe(tools[0]);
  });

  it("replays the assistant providerContent unchanged on the next iteration", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const providerContent = [
      { type: "thinking", thinking: "sigilo", signature: "sig-1" },
      { type: "tool_use", id: "call-1", name: "get_goals", input: {} },
    ];
    const client = new FakeModelClient([
      {
        content: null,
        toolCalls: [{ id: "call-1", name: "get_goals", argumentsJson: "{}" }],
        stopReason: "tool_calls",
        providerContent,
      },
      { content: "Resumo." },
    ]);
    await runStrategistTurn({
      client,
      ctx: { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId },
      message: "Metas?",
    });
    expect(client.requests).toHaveLength(2);
    const assistant = client.requests[1]?.messages.find((message) => message.role === "assistant");
    expect(assistant).toMatchObject({ role: "assistant" });
    expect(assistant && assistant.role === "assistant" ? assistant.providerContent : undefined).toBe(
      providerContent,
    );
  });

  it("fails the turn on refusal or truncation instead of answering", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const ctx = { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId };
    await expect(
      runStrategistTurn({
        client: new FakeModelClient([{ content: null, stopReason: "refusal" }]),
        ctx,
        message: "Oi",
      }),
    ).rejects.toThrow("strategist_refused");
    await expect(
      runStrategistTurn({
        client: new FakeModelClient([{ content: "metad", stopReason: "max_tokens" }]),
        ctx,
        message: "Oi",
      }),
    ).rejects.toThrow("strategist_truncated");
  });

  it("feeds tool errors back to the model instead of crashing", async () => {
    const t = makeTestDeps();
    const account = await openTestAccount(t);
    const client = new FakeModelClient([
      {
        content: null,
        toolCalls: [{ id: "call-1", name: "approve_batch", argumentsJson: "{}" }],
      },
      { content: "Entendi, não posso aprovar. Posso preparar o lote para você revisar." },
    ]);
    const result = await runStrategistTurn({
      client,
      ctx: { deps: t.deps, workspaceId: account.workspaceId, accountId: account.accountId },
      message: "Ok, pode postar.",
    });
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.text).toMatch(/não posso aprovar/);
    const toolMessage = client.requests[1]?.messages.find((message) => message.role === "tool");
    expect(toolMessage?.role).toBe("tool");
    expect(toolMessage && toolMessage.role === "tool" ? toolMessage.content : "").toMatch(/unknown tool/);
  });
});
