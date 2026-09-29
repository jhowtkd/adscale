// Conversation map commands + queries (#551).

import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  PARALLEL_THREAD_OPENED_EVENT,
  PRIMARY_THREAD_ENSURED_EVENT,
  findEquipeThreadByAssistantThread,
  getEquipeThreads,
} from "./threads";
import { makeTestDeps, openTestAccount, uuid } from "./testing/deps";

function addConversation(t: ReturnType<typeof makeTestDeps>, workspaceId: string, profileId: string) {
  const id = uuid();
  t.store.assistantThreads.rows.set(id, { id, workspaceId, clientProfileId: profileId, campaignId: null });
  return id;
}

describe("ensure_primary_thread", () => {
  it("reuses the primary conversation created while opening the account", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, profileId, actors } = await openTestAccount(t);
    const assistantThreadId = (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId;

    const outcome = await executeCommand(
      t.deps,
      { actor: actors.agent, workspaceId, accountId },
      { type: "ensure_primary_thread", payload: { assistantThreadId } },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ created: false, assistantThreadId });
    expect(outcome.value.events.map((event) => event.eventType)).not.toContain(PRIMARY_THREAD_ENSURED_EVENT);
    const view = await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId);
    expect(view?.primary?.assistantThreadId).toBe(assistantThreadId);
    expect(t.store.assistantThreads.rows.get(assistantThreadId)?.clientProfileId).toBe(profileId);
    expect(view?.parallel).toHaveLength(0);
  });

  it("is idempotent for the same conversation", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const assistantThreadId = (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId;
    const context = { actor: actors.agent, workspaceId, accountId };

    const first = await executeCommand(t.deps, context, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId },
    });
    const second = await executeCommand(t.deps, context, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId },
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.data).toMatchObject({
      threadId: first.value.data.threadId,
      created: false,
    });
    expect(second.value.events).toHaveLength(0);
  });

  it("refuses to rebind the primary to another conversation", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, profileId, actors } = await openTestAccount(t);
    const context = { actor: actors.agent, workspaceId, accountId };

    const first = await executeCommand(t.deps, context, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId: (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId },
    });
    expect(first.ok).toBe(true);

    const second = await executeCommand(t.deps, context, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId: addConversation(t, workspaceId, profileId) },
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("thread_conflict");
  });

  it("refuses a conversation already mapped as parallel", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, profileId, actors } = await openTestAccount(t);
    const context = { actor: actors.member, workspaceId, accountId };
    const assistantThreadId = addConversation(t, workspaceId, profileId);

    const opened = await executeCommand(t.deps, context, {
      type: "open_parallel_thread",
      payload: { assistantThreadId, topic: "Black Friday" },
    });
    expect(opened.ok).toBe(true);

    const outcome = await executeCommand(t.deps, { ...context, actor: actors.agent }, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("thread_conflict");
  });

  it("rejects actors outside the conversation", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);

    const outcome = await executeCommand(
      t.deps,
      { actor: actors.quality, workspaceId, accountId },
      { type: "ensure_primary_thread", payload: { assistantThreadId: (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId } },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("forbidden_actor");
  });

  it("requires a known account", async () => {
    const t = makeTestDeps();
    const { workspaceId, actors } = await openTestAccount(t);

    const outcome = await executeCommand(
      t.deps,
      { actor: actors.agent, workspaceId, accountId: uuid() },
      { type: "ensure_primary_thread", payload: { assistantThreadId: uuid() } },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("unknown_account");
  });
});

describe("open_parallel_thread", () => {
  it("opens parallel threads by topic", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, profileId, actors } = await openTestAccount(t);
    const context = { actor: actors.approver, workspaceId, accountId };

    for (const topic of ["Black Friday", "Natal"]) {
      const outcome = await executeCommand(t.deps, context, {
        type: "open_parallel_thread",
        payload: { assistantThreadId: addConversation(t, workspaceId, profileId), topic },
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.data).toMatchObject({ topic });
      expect(outcome.value.events.map((event) => event.eventType)).toContain(
        PARALLEL_THREAD_OPENED_EVENT,
      );
    }

    const view = await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId);
    expect(view?.primary?.assistantThreadId).toBeTruthy();
    expect(view?.parallel.map((row) => row.topic)).toEqual(["Black Friday", "Natal"]);
  });

  it("refuses a conversation that is already mapped", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const assistantThreadId = (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId;

    const first = await executeCommand(
      t.deps,
      { actor: actors.agent, workspaceId, accountId },
      { type: "ensure_primary_thread", payload: { assistantThreadId } },
    );
    expect(first.ok).toBe(true);

    const second = await executeCommand(
      t.deps,
      { actor: actors.approver, workspaceId, accountId },
      { type: "open_parallel_thread", payload: { assistantThreadId, topic: "Natal" } },
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("thread_conflict");
  });

  it("rejects an empty topic", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);

    const outcome = await executeCommand(
      t.deps,
      { actor: actors.approver, workspaceId, accountId },
      { type: "open_parallel_thread", payload: { assistantThreadId: uuid(), topic: "" } },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_command");
  });
});

describe("thread queries", () => {
  it("finds the map entry by assistant thread for dispatch", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, profileId, actors } = await openTestAccount(t);
    const primaryId = (await getEquipeThreads(t.deps.uow.repos, workspaceId, accountId))!.primary!.assistantThreadId;
    const parallelId = addConversation(t, workspaceId, profileId);

    await executeCommand(t.deps, { actor: actors.agent, workspaceId, accountId }, {
      type: "ensure_primary_thread",
      payload: { assistantThreadId: primaryId },
    });
    await executeCommand(t.deps, { actor: actors.member, workspaceId, accountId }, {
      type: "open_parallel_thread",
      payload: { assistantThreadId: parallelId, topic: "Black Friday" },
    });

    const primary = await findEquipeThreadByAssistantThread(
      t.deps.uow.repos,
      workspaceId,
      profileId,
      primaryId,
    );
    expect(primary?.account.id).toBe(accountId);
    expect(primary?.thread.kind).toBe("primary");

    const parallel = await findEquipeThreadByAssistantThread(
      t.deps.uow.repos,
      workspaceId,
      profileId,
      parallelId,
    );
    expect(parallel?.thread.kind).toBe("parallel");

    const missing = await findEquipeThreadByAssistantThread(
      t.deps.uow.repos,
      workspaceId,
      profileId,
      uuid(),
    );
    expect(missing).toBeNull();
  });

  it("returns null when the brand has no account", async () => {
    const t = makeTestDeps();
    const { workspaceId } = await openTestAccount(t);

    const found = await findEquipeThreadByAssistantThread(
      t.deps.uow.repos,
      workspaceId,
      uuid(),
      uuid(),
    );
    expect(found).toBeNull();

    const view = await getEquipeThreads(t.deps.uow.repos, workspaceId, uuid());
    expect(view).toBeNull();
  });

  it("rejects conversations from another workspace or brand", async () => {
    const t = makeTestDeps();
    const first = await openTestAccount(t);
    const second = await openTestAccount(t);
    const foreignBrandId = addConversation(t, first.workspaceId, second.profileId);
    const foreignWorkspaceId = addConversation(t, second.workspaceId, first.profileId);
    const context = { actor: first.actors.agent, workspaceId: first.workspaceId, accountId: first.accountId };
    // A legacy account without a map reaches the ownership check, rather
    // than failing earlier only because it already has a different primary.
    const primary = (await getEquipeThreads(t.deps.uow.repos, first.workspaceId, first.accountId))!.primary!;
    t.store.threads.rows.delete(primary.id);

    for (const assistantThreadId of [foreignBrandId, foreignWorkspaceId]) {
      const outcome = await executeCommand(t.deps, context, {
        type: "ensure_primary_thread", payload: { assistantThreadId },
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("thread_conflict");
    }

    for (const assistantThreadId of [foreignBrandId, foreignWorkspaceId]) {
      const parallel = await executeCommand(t.deps, { actor: first.actors.approver, workspaceId: first.workspaceId, accountId: first.accountId }, {
        type: "open_parallel_thread", payload: { assistantThreadId, topic: "Outro escopo" },
      });
      expect(parallel.ok).toBe(false);
      if (!parallel.ok) expect(parallel.error.code).toBe("thread_conflict");
    }
  });
});
