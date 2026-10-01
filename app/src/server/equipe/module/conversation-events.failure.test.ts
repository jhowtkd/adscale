// How a failed diagnosis reaches the conversation, for every failure code (ticket 13, D-12): the card carries the code (the screen words the credit case
// differently), the suggestions offer "Tentar de novo" only when the failure can be retried, and a malformed event never breaks the projection.
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { appendEvent, transact } from "./shared";
import { projectConversationEvent } from "./conversation-events";
import { makeTestDeps } from "./testing/deps";
import { advancingClock, confirmedHandoff } from "./testing/diagnosis";
import { DIAGNOSIS_RETRY_PHRASE } from "@/lib/equipe/diagnosis-copy";
import { DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_RETRYABLE_CODES } from "../handoff/diagnosis-contract";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
type F = Awaited<ReturnType<typeof confirmedHandoff>>;
const cards = (f: F) => [...f.t.store.assistantMessages.rows.values()].filter(m => m.type === "equipe_card" && (m.payload as { kind?: string }).kind === "diagnosis");
const labels = (card: { payload: unknown }) => ((card.payload as { suggestions?: Array<{ label?: string; text?: string } | string> }).suggestions ?? []).map(s => (typeof s === "string" ? s : s.label ?? s.text ?? ""));

const CODES = ["budget_exceeded", "provider_error", "model_truncated", "diagnosis_invalid", "execution_blocked", "model_refused", "diagnosis_unavailable", "something_new"] as const;

describe("diagnosis.failed through the real command, one card per failure", () => {
  it.each(CODES)("%s: the card says failed, carries the code, and offers the retry only when the module says it is retryable", async (code) => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    const out = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code } });
    if (!out.ok) throw new Error(out.error.code);
    const retryable = Boolean(out.value.data.retryable);
    expect(retryable).toBe((DIAGNOSIS_RETRYABLE_CODES as readonly string[]).includes(code));
    const [card] = cards(f);
    expect(cards(f)).toHaveLength(1);
    expect(card!.payload).toMatchObject({ kind: "diagnosis", status: "failed", failureCode: code, accountId: f.accountId });
    const offered = labels(card!);
    if (retryable) expect(offered).toContain(DIAGNOSIS_RETRY_PHRASE);
    else { expect(offered).not.toContain(DIAGNOSIS_RETRY_PHRASE); expect(offered).toEqual([]); } // A final failure leaves no bait: nothing to click that cannot work.
    // The card's line is the one the conversation keeps, never the raw code.
    expect(card!.content).not.toContain(code);
  });

  it("a duplicate failure for the same intent is ignored and adds no second card", async () => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    const send = () => executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "budget_exceeded" } });
    await send(); await send(); await send();
    expect(cards(f)).toHaveLength(1);
  });
});

describe("diagnosis.failed projected from malformed payloads", () => {
  async function project(payload: unknown) {
    const f = await confirmedHandoff();
    let id = "";
    const out = await transact(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId, now: new Date("2026-10-01T12:00:00.000Z") } as never, async (ctx) => {
      const event = await appendEvent(ctx, { eventType: DIAGNOSIS_FAILED_EVENT, objectType: "handoff", objectId: f.handoffId, payload });
      id = event.id;
      return { ok: true, value: {} } as never;
    });
    if (!out.ok) throw new Error(out.error.code);
    return { f, id, project: async () => f.t.deps.uow.run(async repos => projectConversationEvent({ ...f.t.deps, repos, workspaceId: f.workspaceId, accountId: f.accountId, now: new Date(), internal: f.t.deps.uow.internal } as never, (await repos.events.list(f.scope, { eventType: DIAGNOSIS_FAILED_EVENT })).at(-1)!)) };
  }
  it.each([
    ["no code", { retryable: false }, "unknown", false],
    ["a numeric code", { code: 42, retryable: false }, "42", false],
    ["a null code", { code: null, retryable: false }, "unknown", false],
    ["retryable as text", { code: "provider_error", retryable: "true" }, "provider_error", false],
    ["retryable as 1", { code: "provider_error", retryable: 1 }, "provider_error", false],
    ["no retryable flag", { code: "budget_exceeded" }, "budget_exceeded", false],
    ["an empty payload", {}, "unknown", false],
    ["retryable true", { code: "provider_error", retryable: true }, "provider_error", true],
  ])("%s: a card with failureCode %s, retry offered=%s", async (_name, payload, failureCode, retry) => {
    const p = await project(payload);
    await expect(p.project()).resolves.not.toThrow();
    const card = cards(p.f).at(-1);
    expect(card).toBeDefined();
    expect(card!.payload).toMatchObject({ kind: "diagnosis", status: "failed", failureCode });
    expect(labels(card!).includes(DIAGNOSIS_RETRY_PHRASE)).toBe(retry);
  });
});
