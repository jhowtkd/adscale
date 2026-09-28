import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import { contextVersionHash } from "./context";
import {
  makeTestDeps,
  openTestAccount,
  type TestAccountActors,
  type TestDeps,
} from "./testing/deps";

const FIELDS = {
  offer: { status: "sustained" as const, value: "frete grátis acima de R$150", source: "catálogo" },
  audience: { status: "inferred" as const, value: "25-34" },
  niche: { status: "unknown" as const },
};

type Ids = { workspaceId: string; accountId: string; actors: TestAccountActors };

async function setup() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  return { t, ...ids };
}

function ctx(ids: Ids, actor: Actor) {
  return { actor, workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function propose(t: TestDeps, ids: Ids, fields = FIELDS) {
  return executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "propose_context_section",
    payload: { section: "oferta", fields },
  });
}

describe("propose_context_section", () => {
  it("creates versioned proposals, superseding the open one", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const first = await propose(t, ids);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.data).toMatchObject({ section: "oferta", version: 1 });
    expect(first.value.events.map((e) => e.eventType)).toEqual([
      "context_section.proposed",
      "notification.requested",
    ]);
    expect(first.value.events[1]?.payload).toMatchObject({
      recipientRole: "approver",
      templateKey: "context_section.proposed",
    });

    const second = await propose(t, ids);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ version: 2 });

    const scope = { workspaceId, accountId };
    const versions = await t.deps.uow.repos.contexts.list(scope);
    expect(versions.map((v) => [v.version, v.status]).sort()).toEqual([
      [1, "superseded"],
      [2, "proposed"],
    ]);
    expect(versions[0]?.authorRole).toBe("agent");
  });

  it("is agent-only", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const rawCommand = {
      type: "propose_context_section",
      payload: { section: "oferta", fields: FIELDS },
    } as const;
    for (const actor of [actors.approver, actors.member, actors.system, actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("rejects empty fields", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const outcome = await executeCommand(t.deps, ctx({ workspaceId, accountId, actors }, actors.agent), {
      type: "propose_context_section",
      payload: { section: "oferta", fields: {} },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
  });
});

describe("approve_context_section", () => {
  it("approves the exact version with an immutable receipt", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    expect((await propose(t, ids)).ok).toBe(true);
    const hash = contextVersionHash(FIELDS);
    const outcome = await executeCommand(t.deps, ctx(ids, actors.substitute), {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: hash },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ section: "oferta", version: 1, versionHash: hash });

    const scope = { workspaceId, accountId };
    const versions = await t.deps.uow.repos.contexts.list(scope);
    expect(versions[0]?.status).toBe("approved");

    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    const substituteId =
      actors.substitute.kind === "client_person" ? actors.substitute.personId : "";
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personId: substituteId,
      personRole: "substitute",
      objectType: "context_section",
      objectId: versions[0]?.id,
      objectVersion: hash,
      action: "approve_context_section",
    });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "context_section.approved",
      "notification.requested",
    ]);
  });

  it("supersedes the previous approval on re-approval of a new version", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    expect((await propose(t, ids)).ok).toBe(true);
    const first = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: contextVersionHash(FIELDS) },
    });
    expect(first.ok).toBe(true);
    const updated = { ...FIELDS, niche: { status: "sustained" as const, value: "moda" } };
    expect((await propose(t, ids, updated)).ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: contextVersionHash(updated) },
    });
    expect(second.ok).toBe(true);
    const scope = { workspaceId, accountId };
    const versions = await t.deps.uow.repos.contexts.list(scope);
    expect(versions.map((v) => [v.version, v.status]).sort()).toEqual([
      [1, "superseded"],
      [2, "approved"],
    ]);
  });

  it("rejects agent, system, member and staff approvals", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    expect((await propose(t, ids)).ok).toBe(true);
    const rawCommand = {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: contextVersionHash(FIELDS) },
    } as const;
    for (const actor of [actors.agent, actors.system, actors.member, actors.custodian, actors.quality, actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("fails without an open proposal and on a stale version", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const none = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: "abc" },
    });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe("invalid_transition");

    expect((await propose(t, ids)).ok).toBe(true);
    const stale = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "approve_context_section",
      payload: { section: "oferta", expectedVersionHash: "deadbeef" },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stale_version");

    // Nothing was written: the proposal is still open, no receipt, no event.
    const scope = { workspaceId, accountId };
    const versions = await t.deps.uow.repos.contexts.list(scope);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe("proposed");
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    const approvals = await t.deps.uow.repos.events.list(scope, {
      eventType: "context_section.approved",
    });
    expect(approvals).toHaveLength(0);
  });

});

describe("answer_conflict", () => {
  const CONFLICT_FIELDS = {
    shipping: { status: "unknown" as const, source: "conflict:O frete grátis vale acima de quanto?" },
  };

  it("resolves the conflict with the client's answer", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    expect((await propose(t, ids, CONFLICT_FIELDS)).ok).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "answer_conflict",
      payload: { section: "oferta", field: "shipping", answer: "Acima de R$150" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const scope = { workspaceId, accountId };
    const versions = await t.deps.uow.repos.contexts.list(scope);
    const fields = versions[0]?.fields as Record<string, { status: string; value: unknown }>;
    expect(fields.shipping).toMatchObject({ status: "sustained", value: "Acima de R$150" });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "context.conflict_answered",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]?.payload).toMatchObject({
      field: "shipping",
      answer: "Acima de R$150",
    });
  });

  it("is a client decision: agents and members cannot answer", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    expect((await propose(t, ids, CONFLICT_FIELDS)).ok).toBe(true);
    const rawCommand = {
      type: "answer_conflict",
      payload: { section: "oferta", field: "shipping", answer: "x" },
    } as const;
    for (const actor of [actors.agent, actors.system, actors.member, actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("fails without an open conflict", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const noVersion = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "answer_conflict",
      payload: { section: "oferta", field: "shipping", answer: "x" },
    });
    expect(noVersion.ok).toBe(false);
    if (!noVersion.ok) expect(noVersion.error.code).toBe("invalid_transition");

    expect((await propose(t, ids, FIELDS)).ok).toBe(true);
    const noConflict = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "answer_conflict",
      payload: { section: "oferta", field: "niche", answer: "x" },
    });
    expect(noConflict.ok).toBe(false);
    if (!noConflict.ok) expect(noConflict.error.code).toBe("invalid_transition");
  });
});
