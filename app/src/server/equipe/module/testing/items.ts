// Shared fixtures for the batch-approval command tests: gateway seeding
// and batch delivery through the real executeCommand path.

import type { Actor } from "../../domain";
import type { EquipeFrontKey } from "../../data";
import { executeCommand } from "../commands";
import { itemVersionHash } from "../item-shared";
import { makeTestDeps, openTestAccount, uuid, type TestAccountActors, type TestDeps } from "./deps";

export type ItemIds = {
  workspaceId: string;
  accountId: string;
  actors: TestAccountActors;
};

export function ctx(ids: ItemIds, actor: Actor) {
  return { actor, workspaceId: ids.workspaceId, accountId: ids.accountId };
}

export async function setup(fronts: EquipeFrontKey[] = ["social_instagram", "midia_paga"]) {
  const t = makeTestDeps();
  const ids = await openTestAccount(t, { fronts });
  return { t, ids };
}

/** Seed a creative work + output pair belonging to the workspace. */
export function seedWork(
  t: TestDeps,
  workspaceId: string,
): { workId: string; outputId: string } {
  const workId = uuid();
  const outputId = uuid();
  t.gateway.works.set(workId, { id: workId, workspaceId });
  t.gateway.addOutput({ id: outputId, workspaceId, workId });
  return { workId, outputId };
}

export async function frontIdOf(
  t: TestDeps,
  ids: ItemIds,
  key: EquipeFrontKey,
): Promise<string> {
  const fronts = await t.deps.uow.repos.fronts.list({
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
  });
  const found = fronts.find((front) => front.key === key);
  if (!found) throw new Error(`missing front ${key}`);
  return found.id;
}

export type DeliverItemInput = {
  caption?: string;
  destinationAccount?: string;
  scheduledFor?: Date;
  needsConfirmation?: boolean;
  workId?: string;
  outputId?: string;
};

export type DeliverBatchResult = {
  batchId: string;
  itemIds: string[];
  versionHashes: string[];
};

/** Deliver a batch through deliver_batch; seeds works/outputs as needed. */
export async function deliverTestBatch(
  t: TestDeps,
  ids: ItemIds,
  options: {
    front?: EquipeFrontKey;
    title?: string;
    approveByAt?: Date;
    items?: DeliverItemInput[];
  } = {},
): Promise<DeliverBatchResult> {
  const frontId = await frontIdOf(t, ids, options.front ?? "social_instagram");
  const inputs = options.items ?? [{}, {}];
  const payloadItems = inputs.map((input, index) => {
    const seeded = seedWork(t, ids.workspaceId);
    return {
      creativeWorkId: input.workId ?? seeded.workId,
      creativeWorkOutputId: input.outputId ?? seeded.outputId,
      caption: input.caption ?? `legenda ${index + 1}`,
      destinationAccount: input.destinationAccount ?? "instagram:@brand",
      scheduledFor: input.scheduledFor ?? new Date("2026-10-09T12:00:00.000Z"),
      needsConfirmation: input.needsConfirmation ?? false,
    };
  });
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "deliver_batch",
    payload: {
      title: options.title ?? "Lote 1",
      frontId,
      approveByAt: options.approveByAt ?? new Date("2026-10-07T17:00:00.000Z"),
      items: payloadItems,
    },
  });
  if (!outcome.ok) {
    throw new Error(`deliverTestBatch failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  const data = outcome.value.data as unknown as DeliverBatchResult;
  return { batchId: data.batchId, itemIds: data.itemIds, versionHashes: data.versionHashes };
}

export function versionHashOf(input: {
  output: string;
  caption: string;
  destination: string;
  destinationIgUserId?: string | null;
  scheduledFor: Date;
}): string {
  return itemVersionHash({
    output: input.output,
    caption: input.caption,
    destination: input.destination,
    destinationIgUserId: input.destinationIgUserId,
    scheduledFor: input.scheduledFor,
  });
}

export { makeTestDeps, openTestAccount, uuid };
export type { TestAccountActors, TestDeps };
