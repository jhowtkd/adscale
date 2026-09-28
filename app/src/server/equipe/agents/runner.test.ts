// Agents port: dispatch, ledger recording, and the budget cap refusal.

import { describe, expect, it } from "vitest";
import type { GenerateSocialPostCopySuccess } from "@/server/application/generate-social-post-copy";
import { fromSaoPauloWallTime } from "../domain";
import { makeTestDeps, openTestAccount, uuid } from "../module/testing/deps";
import { BUDGET_EXCEEDED_EVENT, MemoryLedgerStore } from "./ledger";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import { resolveAgentMonthlyBudgetUsdCents } from "./roles";
import { BUDGET_EXCEEDED_ERROR, createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";

const OCTOBER_NOON = () => fromSaoPauloWallTime(2026, 10, 15, 12, 0);

async function setup() {
  const t = makeTestDeps();
  const account = await openTestAccount(t);
  const ledger = new MemoryLedgerStore();
  return { t, account, ledger };
}

describe("createEquipeAgents", () => {
  it("rejects unknown kinds, bad input, and missing scope", async () => {
    const { t, account, ledger } = await setup();
    const agents = createEquipeAgents({ moduleDeps: t.deps, ledger });
    const unknown = await agents.runTask({
      kind: "teleport",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: {},
    });
    expect(unknown).toEqual({ ok: false, error: "unknown_agent_task:teleport" });

    const badInput = await agents.runTask({
      kind: "research",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { materials: [] },
    });
    expect(badInput.ok).toBe(false);

    const noScope = await agents.runTask({ kind: "research", workspaceId: "", accountId: "", input: {} });
    expect(noScope).toEqual({ ok: false, error: "agent_task_requires_scope" });
  });

  it("records research calls in the ledger with the prompt version", async () => {
    const { t, account, ledger } = await setup();
    const client = new FakeModelClient([
      {
        content: JSON.stringify({ facts: [{ claim: "Fato", source: "Site", section: null }], diagnosis: "Ok." }),
        usage: { inputTokens: 1000, outputTokens: 100 },
      },
    ]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger });
    const result = await agents.runTask({
      kind: "research",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] },
    });
    expect(result.ok).toBe(true);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      accountId: account.accountId,
      role: "research",
      promptVersion: EQUIPE_PROMPT_VERSION,
      taskKind: "research",
      inputTokens: 1000,
      outputTokens: 100,
    });
    expect(ledger.entries[0]?.costUsdCents).toBeGreaterThan(0);
  });

  it("records cache reads/writes in the ledger and prices them", async () => {
    const { t, account, ledger } = await setup();
    const client = new FakeModelClient([
      {
        content: JSON.stringify({ facts: [{ claim: "Fato", source: "Site", section: null }], diagnosis: "Ok." }),
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 9000, cacheWriteTokens: 0 },
      },
    ]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger });
    const result = await agents.runTask({
      kind: "research",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] },
    });
    expect(result.ok).toBe(true);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      model: "muse-spark-1.3-contributor",
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 9000,
      cacheWriteTokens: 0,
    });
    // 1k uncached in * 0.01 + 100 out * 0.02 + 9k cache reads * 0.0002
    // = 0.01 + 0.002 + 0.0018 = 0.0138 -> 1 cent.
    expect(ledger.entries[0]?.costUsdCents).toBe(1);
  });

  it("refuses new work past the monthly cap and emits agent.budget_exceeded", async () => {
    const { t, account, ledger } = await setup();
    const cap = resolveAgentMonthlyBudgetUsdCents();
    const spent = await ledger.record({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      role: "strategist",
      model: "gpt-5.6-sol",
      promptVersion: EQUIPE_PROMPT_VERSION,
      taskKind: "strategist_turn",
      inputTokens: 0,
      outputTokens: 0,
      costUsdCents: cap,
    });
    spent.createdAt = fromSaoPauloWallTime(2026, 10, 1, 9, 0);
    const client = new FakeModelClient([{ content: "should never run" }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger, now: OCTOBER_NOON });
    const result = await agents.runTask({
      kind: "strategist_turn",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { message: "Oi" },
    });
    expect(result).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);

    const events = await t.deps.uow.repos.events.list({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
    });
    const refusal = events.find((event) => event.eventType === BUDGET_EXCEEDED_EVENT);
    expect(refusal?.actorType).toBe("agent");
    expect(refusal?.payload).toMatchObject({ totalCostUsdCents: cap, budgetUsdCents: cap });
  });

  it("ignores last month's spend against the monthly cap", async () => {
    const { t, account, ledger } = await setup();
    const cap = resolveAgentMonthlyBudgetUsdCents();
    const spent = await ledger.record({
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      role: "strategist",
      model: "gpt-5.6-sol",
      promptVersion: EQUIPE_PROMPT_VERSION,
      taskKind: "strategist_turn",
      inputTokens: 0,
      outputTokens: 0,
      costUsdCents: cap,
    });
    spent.createdAt = fromSaoPauloWallTime(2026, 9, 30, 23, 59);
    const client = new FakeModelClient([{ content: "Tudo certo por aqui." }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger, now: OCTOBER_NOON });
    const result = await agents.runTask({
      kind: "strategist_turn",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { message: "Como está a conta?" },
    });
    expect(result.ok).toBe(true);
    expect(client.requests).toHaveLength(1);
  });

  it("delegates writing to the existing caption generator without a ledger entry", async () => {
    const { t, account, ledger } = await setup();
    const seen: unknown[] = [];
    const agents = createEquipeAgents({
      moduleDeps: t.deps,
      ledger,
      writing: {
        generateCopy: async (input) => {
          seen.push(input);
          return {
            ok: true,
            value: {
              copy: { headline: "h", body: "b", cta: "c" },
            } as unknown as GenerateSocialPostCopySuccess,
          };
        },
      },
    });
    const workItemId = uuid();
    const result = await agents.runTask({
      kind: "writing",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { workItemId },
    });
    expect(result).toEqual({ ok: true, output: { headline: "h", body: "b", cta: "c" } });
    expect(seen).toMatchObject([{ workspaceId: account.workspaceId, workItemId }]);
    expect(ledger.entries).toHaveLength(0);
  });

  it("resolves art direction through the gateway without generating", async () => {
    const { t, account, ledger } = await setup();
    const workId = uuid();
    t.gateway.works.set(workId, { id: workId, workspaceId: account.workspaceId });
    const agents = createEquipeAgents({ moduleDeps: t.deps, ledger });
    const result = await agents.runTask({
      kind: "art_direction",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { workId },
    });
    expect(result).toEqual({ ok: true, output: { workId, workspaceId: account.workspaceId, engineOwned: true } });

    const missing = await agents.runTask({
      kind: "art_direction",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { workId: uuid() },
    });
    expect(missing).toEqual({ ok: false, error: "art_direction_work_not_found" });
  });

  it("reads measurement through the injected shadow reader", async () => {
    const { t, account, ledger } = await setup();
    const agents = createEquipeAgents({
      moduleDeps: t.deps,
      ledger,
      measurement: {
        read: async () => ({
          mode: "shadow" as const,
          sources: ["served_ads"] as ["served_ads"],
          windowDays: 7,
          totals: { impressions: 1, clicks: 0, spend: 0, conversions: 0 },
          topAds: [],
          recommendations: ["[shadow] nada a fazer"],
        }),
      },
    });
    const result = await agents.runTask({
      kind: "measurement",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { brandId: uuid() },
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.output : null).toMatchObject({ mode: "shadow" });
  });

  it("runs a strategist turn end to end and surfaces failures", async () => {
    const { t, account, ledger } = await setup();
    const client = new FakeModelClient([{ content: "Tudo certo por aqui." }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger });
    const result = await agents.runTask({
      kind: "strategist_turn",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { message: "Como está a conta?" },
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? (result.output as { text: string }).text : null).toBe("Tudo certo por aqui.");
    expect(ledger.entries).toHaveLength(1);

    const failing = createEquipeAgents({
      moduleDeps: t.deps,
      client: new FakeModelClient([]),
      ledger,
    });
    const failed = await failing.runTask({
      kind: "strategist_turn",
      workspaceId: account.workspaceId,
      accountId: account.accountId,
      input: { message: "Oi" },
    });
    expect(failed).toEqual({ ok: false, error: "fakeModelClientOutOfResponses" });
  });

  it("routes each role to the client of its model's provider", async () => {
    const { t, account, ledger } = await setup();
    const anthropic = new FakeModelClient([
      { content: "Tudo certo por aqui." },
      {
        content: JSON.stringify({ findings: [], summary: "Limpo." }),
      },
    ]);
    const meta = new FakeModelClient([
      {
        content: JSON.stringify({
          facts: [{ claim: "Fato", source: "Site", section: null }],
          diagnosis: "Ok.",
        }),
      },
    ]);
    const agents = createEquipeAgents({
      moduleDeps: t.deps,
      clients: { anthropic, meta },
      ledger,
    });
    const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
    const strategist = await agents.runTask({ kind: "strategist_turn", ...scope, input: { message: "Oi" } });
    expect(strategist.ok).toBe(true);
    const research = await agents.runTask({
      kind: "research",
      ...scope,
      input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] },
    });
    expect(research.ok).toBe(true);
    const review = await agents.runTask({
      kind: "review_text",
      ...scope,
      input: { copy: { headline: "h", body: "b", cta: "c" } },
    });
    expect(review.ok).toBe(true);
    // Defaults: strategist + reviewer on claude-*, research on muse-*.
    expect(anthropic.requests.map((request) => request.model)).toEqual([
      "claude-opus-5-5",
      "claude-opus-5-5",
    ]);
    expect(meta.requests.map((request) => request.model)).toEqual(["muse-spark-1.3-contributor"]);
  });

  it("fills model and effort from the role config", async () => {
    const { t, account, ledger } = await setup();
    const client = new FakeModelClient([
      { content: "ok" },
      {
        content: JSON.stringify({
          facts: [{ claim: "Fato", source: "Site", section: null }],
          diagnosis: "Ok.",
        }),
      },
      { content: JSON.stringify({ findings: [], summary: "Limpo." }) },
    ]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger });
    const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
    await agents.runTask({ kind: "strategist_turn", ...scope, input: { message: "Oi" } });
    await agents.runTask({
      kind: "research",
      ...scope,
      input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] },
    });
    await agents.runTask({
      kind: "review_text",
      ...scope,
      input: { copy: { headline: "h", body: "b", cta: "c" } },
    });
    expect(client.requests.map((request) => [request.model, request.effort])).toEqual([
      ["claude-opus-5-5", "high"],
      ["muse-spark-1.3-contributor", "xhigh"],
      ["claude-opus-5-5", "high"],
    ]);
  });

  it("fails the task on typed model failures, never with empty output", async () => {
    const { t, account, ledger } = await setup();
    const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
    const truncated = createEquipeAgents({
      moduleDeps: t.deps,
      client: new FakeModelClient([{ content: "metad", stopReason: "max_tokens" }]),
      ledger,
    });
    expect(
      await truncated.runTask({ kind: "strategist_turn", ...scope, input: { message: "Oi" } }),
    ).toEqual({ ok: false, error: "model_truncated:strategist_truncated" });

    const refused = createEquipeAgents({
      moduleDeps: t.deps,
      client: new FakeModelClient([{ content: null, stopReason: "refusal" }]),
      ledger,
    });
    expect(
      await refused.runTask({
        kind: "review_text",
        ...scope,
        input: { copy: { headline: "h", body: "b", cta: "c" } },
      }),
    ).toEqual({ ok: false, error: "model_refused:text_review_refused" });
  });
});
