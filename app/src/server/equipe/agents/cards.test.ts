// Card builders (#551): closed lists, exclusions, pending resolution.

import { describe, expect, it } from "vitest";
import { buildBatchCard, buildIdeaCard, buildItemCard, resolvePendingCard } from "./cards";
import {
  deliverTestBatch,
  frontIdOf,
  makeTestDeps,
  openTestAccount,
  setup,
  uuid,
} from "../module/testing/items";

describe("buildBatchCard", () => {
  it("lists ready items closed and the rest excluded with reasons", async () => {
    const { t, ids } = await setup();
    const delivered = await deliverTestBatch(t, ids, {
      title: "Calendário 23–27/11",
      items: [{}, {}, { needsConfirmation: true }],
    });

    const card = await buildBatchCard(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      delivered.batchId,
    );

    expect(card).not.toBeNull();
    expect(card?.kind).toBe("batch");
    expect(card?.accountId).toBe(ids.accountId);
    expect(card?.batchId).toBe(delivered.batchId);
    expect(card?.title).toBe("Calendário 23–27/11");
    // The closed list: exactly the two ready items with their version hashes.
    expect(card?.items).toHaveLength(2);
    expect(card?.items.map((item) => item.itemId).sort()).toEqual(
      [delivered.itemIds[0], delivered.itemIds[1]].sort(),
    );
    for (const [index, item] of (card?.items ?? []).entries()) {
      const deliveredIndex = delivered.itemIds.indexOf(item.itemId);
      expect(item.versionHash).toBe(delivered.versionHashes[deliveredIndex]);
      expect(item.title).toContain("legenda");
      expect(item.scheduledFor).toBe("2026-10-09T12:00:00.000Z");
      void index;
    }
    // The offer item needs individual confirmation: excluded, with its reason.
    expect(card?.excluded).toHaveLength(1);
    expect(card?.excluded?.[0]?.itemId).toBe(delivered.itemIds[2]);
    expect(card?.excluded?.[0]?.reason).toBe("pede confirmação");
  });

  it("returns null for unknown batches and accounts", async () => {
    const { t, ids } = await setup();
    expect(
      await buildBatchCard(t.deps.uow.repos, ids.workspaceId, ids.accountId, uuid()),
    ).toBeNull();
    expect(await buildBatchCard(t.deps.uow.repos, ids.workspaceId, uuid(), uuid())).toBeNull();
  });
});

describe("buildItemCard", () => {
  it("points at one item version", async () => {
    const { t, ids } = await setup();
    const delivered = await deliverTestBatch(t, ids, { items: [{}] });

    const card = await buildItemCard(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      delivered.itemIds[0]!,
    );

    expect(card?.kind).toBe("item");
    expect(card?.items).toHaveLength(1);
    expect(card?.items[0]).toMatchObject({
      itemId: delivered.itemIds[0],
      versionHash: delivered.versionHashes[0],
    });
    expect(
      await buildItemCard(t.deps.uow.repos, ids.workspaceId, ids.accountId, uuid()),
    ).toBeNull();
  });
});

describe("buildIdeaCard", () => {
  it("summarizes an idea without approval refs", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const idea = await t.deps.uow.repos.ideas.create(
      { workspaceId, accountId },
      { kind: "content", payload: { title: "Série bastidores", summary: "3 posts" } },
    );

    const card = await buildIdeaCard(t.deps.uow.repos, workspaceId, accountId, idea.id);

    expect(card).toMatchObject({
      kind: "idea",
      accountId,
      title: "Série bastidores",
      ideaId: idea.id,
      summary: "3 posts",
      items: [],
    });
    expect(await buildIdeaCard(t.deps.uow.repos, workspaceId, accountId, uuid())).toBeNull();
  });
});

describe("resolvePendingCard", () => {
  it("answers approval intent with the most urgent batch card", async () => {
    const { t, ids } = await setup();
    const sooner = await deliverTestBatch(t, ids, {
      title: "Lote urgente",
      approveByAt: new Date("2026-10-06T17:00:00.000Z"),
    });
    await deliverTestBatch(t, ids, {
      title: "Lote depois",
      approveByAt: new Date("2026-10-09T17:00:00.000Z"),
    });

    const card = await resolvePendingCard(t.deps.uow.repos, ids.workspaceId, ids.accountId);

    expect(card?.kind).toBe("batch");
    expect(card?.title).toBe("Lote urgente");
    expect(card?.batchId).toBe(sooner.batchId);
    expect(card?.items).toHaveLength(2);
  });

  it("falls back to a standalone item card", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const frontId = await frontIdOf(t, { workspaceId, accountId, actors }, "social_instagram");
    const scope = { workspaceId, accountId };
    // A standalone item (no batch) straight in the repository.
    const item = await t.deps.uow.repos.items.create(scope, {
      frontId,
      status: "awaiting_approval",
      scheduledFor: new Date("2026-10-09T12:00:00.000Z"),
      currentVersionHash: "hash-standalone",
    });
    await t.deps.uow.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash: "hash-standalone",
      caption: "Post avulso",
    });
    const card = await resolvePendingCard(t.deps.uow.repos, workspaceId, accountId);

    expect(card?.kind).toBe("item");
    expect(card?.items).toHaveLength(1);
    expect(card?.items[0]).toMatchObject({
      itemId: item.id,
      versionHash: "hash-standalone",
      title: "Post avulso",
    });
  });

  it("returns null when nothing is ready", async () => {
    const { t, ids } = await setup();
    // Every item needs individual confirmation: no card to answer with.
    await deliverTestBatch(t, ids, {
      items: [{ needsConfirmation: true }, { needsConfirmation: true }],
    });

    const card = await resolvePendingCard(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(card).toBeNull();
  });

  it("returns null for unknown accounts", async () => {
    const { t, ids } = await setup();
    expect(await resolvePendingCard(t.deps.uow.repos, ids.workspaceId, uuid())).toBeNull();
  });
});
