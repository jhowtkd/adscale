import { describe, expect, it } from "vitest";
import { PublisherFailedError, PublisherUncertainError } from "./ports";
import { executeCommand } from "./commands";
import {
  approveLiveMandate,
  ctx,
  deliverDueApprovedItem,
  seedInstagramConnection,
  setup,
  type ItemIds,
  type TestDeps,
} from "./testing/publication";

async function setupReady() {
  const { t, ids } = await setup();
  await approveLiveMandate(t, ids);
  await seedInstagramConnection(t, ids);
  return { t, ids };
}

function scopeOf(ids: ItemIds) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function publishOne(t: TestDeps, ids: ItemIds): Promise<string> {
  const { intentId, itemId } = await deliverDueApprovedItem(t, ids);
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "dispatch_publication",
    payload: { intentId },
  });
  if (!outcome.ok) throw new Error(`setup dispatch failed: ${outcome.error.code}`);
  return itemId;
}

describe("remove_published_post", () => {
  it("operations removes through the API and the removal is recorded", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const itemId = await publishOne(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId, reason: "preço errado no ar" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(t.publisher.deletes).toHaveLength(1);
    expect(t.publisher.deletes[0]).toMatchObject({ externalId: "ig_media_1" });
    expect(outcome.value.events.map((e) => e.eventType)).toContain("post.removed");
    const removed = outcome.value.events.find((e) => e.eventType === "post.removed");
    expect(removed?.payload).toMatchObject({
      externalId: "ig_media_1",
      via: "api",
      reason: "preço errado no ar",
    });
    // The item keeps its published state: removal is recorded, not rewritten.
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("published");
  });

  it("a removal by the custodian is recorded without calling the API", async () => {
    const { t, ids } = await setupReady();
    const itemId = await publishOne(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId, via: "custodian", reason: "custodiante removeu à mão" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(t.publisher.deletes).toHaveLength(0);
    const removed = outcome.value.events.find((e) => e.eventType === "post.removed");
    expect(removed?.payload).toMatchObject({ via: "custodian" });
  });

  it("only operations removes; the client cannot", async () => {
    const { t, ids } = await setupReady();
    const itemId = await publishOne(t, ids);
    for (const actor of [ids.actors.approver, ids.actors.member, ids.actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "remove_published_post",
        payload: { itemId },
      });
      expect(outcome.ok).toBe(false);
    }
    expect(t.publisher.deletes).toHaveLength(0);
  });

  it("only published items with a recorded external id qualify", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId } = await deliverDueApprovedItem(t, ids);
    const scheduled = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId },
    });
    expect(scheduled.ok).toBe(false);
    if (scheduled.ok) return;
    expect(scheduled.error.code).toBe("invalid_transition");

    const publishedId = await publishOne(t, ids);
    const item = await t.deps.uow.repos.items.get(scope, publishedId);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      scope,
      publishedId,
      item!.currentVersionHash!,
    );
    await t.deps.uow.repos.intents.update(scope, intent!.id, { externalId: null });
    const withoutRecord = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId: publishedId },
    });
    expect(withoutRecord.ok).toBe(false);
    if (withoutRecord.ok) return;
    expect(withoutRecord.error.code).toBe("unknown_external_id");
    expect(t.publisher.deletes).toHaveLength(0);
  });

  it("a refused or uncertain delete fails without recording a removal", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const first = await publishOne(t, ids);
    t.publisher.deleteMedia = async () => {
      throw new PublisherFailedError("o Instagram recusou a remoção");
    };
    const refused = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId: first },
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("removal_failed");

    const second = await publishOne(t, ids);
    t.publisher.deleteMedia = async () => {
      throw new PublisherUncertainError("tempo esgotado removendo");
    };
    const uncertain = await executeCommand(t.deps, ctx(ids, ids.actors.operations), {
      type: "remove_published_post",
      payload: { itemId: second },
    });
    expect(uncertain.ok).toBe(false);
    if (uncertain.ok) return;
    expect(uncertain.error.code).toBe("removal_uncertain");
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "post.removed" })).toHaveLength(0);
  });
});
