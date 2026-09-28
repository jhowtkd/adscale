// equipe-agent-work: event trigger plus per-account concurrency, the pilot
// gate, no retries, and the turn_failed failure event.

import { describe, expect, it, vi } from "vitest";
import { makeTestDeps, openTestAccount, uuid } from "../module/testing/deps";
import {
  EQUIPE_AGENT_WORK_EVENT,
  EQUIPE_AGENT_WORK_ID,
  EQUIPE_NOT_ENABLED_ERROR,
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

  it("refuses workspaces outside the pilot without running the turn", async () => {
    // The Equipe gate is off in the test env (EQUIPE_ENABLED unset), so a
    // valid event for any workspace refuses here — before any model call
    // or ledger write. step.run never firing proves the turn never ran.
    const step = { run: vi.fn(async () => ({ unreachable: true })) };
    const result = await equipeAgentWorkHandler({
      event: {
        data: {
          workspaceId: uuid(),
          accountId: uuid(),
          kind: "research",
          input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] },
        },
      },
      step,
    });
    expect(result).toEqual({ refused: true, error: EQUIPE_NOT_ENABLED_ERROR });
    expect(step.run).not.toHaveBeenCalled();
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
