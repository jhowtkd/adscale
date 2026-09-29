import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  approveTestItem,
  ctx,
  deliverTestBatch,
  makeTestDeps,
  openTestAccount,
  setup,
  type ItemIds,
} from "./testing/publication";

function scopeOf(ids: ItemIds) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function setupManual() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  const agreed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "agree_manual_mode",
    payload: {},
  });
  if (!agreed.ok) throw new Error(`agree_manual_mode failed: ${agreed.error.code}`);
  return { t, ids };
}

describe("declare_manual_publication", () => {
  it("approving in manual mode offers the download and creates no intent", async () => {
    const { t, ids } = await setupManual();
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe(
      "available_for_download",
    );
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: itemIds[0]! })).toHaveLength(0);
  });

  it("the approver declares 'publiquei' with a receipt", async () => {
    const { t, ids } = await setupManual();
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toContain("item.manual_publish_declared");
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_declared");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    const declaration = receipts.find((r) => r.action === "declare_manual_publication");
    expect(declaration).toMatchObject({
      personRole: "approver",
      objectVersion: versionHashes[0],
    });
  });

  it("the substitute may declare; members may not", async () => {
    const { t, ids } = await setupManual();
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    await approveTestItem(t, ids, itemIds[1]!, versionHashes[1]!);
    const bySubstitute = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(bySubstitute.ok).toBe(true);
    const byMember = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[1]! },
    });
    expect(byMember.ok).toBe(false);
    if (byMember.ok) return;
    expect(byMember.error.code).toBe("forbidden_actor");
    expect((await t.deps.uow.repos.items.get(scope, itemIds[1]!))?.status).toBe(
      "available_for_download",
    );
  });

  it("declaring twice is a no-op result", async () => {
    const { t, ids } = await setupManual();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ alreadyDeclared: true });
  });

  it("only downloaded items can be declared", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });

  it("downloaded and declared items never gain a dispatch intent", async () => {
    const { t, ids } = await setupManual();
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    await approveTestItem(t, ids, itemIds[1]!, versionHashes[1]!);
    const declared = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(declared.ok).toBe(true);
    // Manual approvals create no intent. A later mode change does not
    // backfill intents for these already-approved versions.
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: itemIds[0]! })).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: itemIds[1]! })).toHaveLength(0);
  });
});
