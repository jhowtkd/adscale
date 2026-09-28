// Shared fixtures for the publication command tests (#548): live mandate
// approval, Instagram connection seeding, and item approval through the
// real executeCommand path.

import { executeCommand } from "../commands";
import { mandateRuleOf, mandateVersionHash } from "../plan-mandate";
import {
  ctx,
  deliverTestBatch,
  frontIdOf,
  makeTestDeps,
  openTestAccount,
  setup,
  uuid,
  type ItemIds,
  type TestAccountActors,
  type TestDeps,
} from "./items";

export { ctx, deliverTestBatch, frontIdOf, makeTestDeps, openTestAccount, setup, uuid };
export type { ItemIds, TestAccountActors, TestDeps };

/** Propose (live, account-wide) and approve a publication mandate. */
export async function approveLiveMandate(t: TestDeps, ids: ItemIds): Promise<void> {
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "propose_mandate",
    payload: { shadow: false },
  });
  if (!proposed.ok) {
    throw new Error(`propose_mandate failed: ${proposed.error.code} ${proposed.error.message}`);
  }
  const mandates = await t.deps.uow.repos.mandates.list(scope);
  const open = mandates.find((row) => row.status === "proposed");
  if (!open) throw new Error("missing proposed mandate");
  const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_mandate",
    payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) },
  });
  if (!approved.ok) {
    throw new Error(`approve_mandate failed: ${approved.error.code} ${approved.error.message}`);
  }
}

export type SeedConnectionOptions = {
  status?: "active" | "expired" | "revoked" | "error";
  withCustodian?: boolean;
};

/** Seed the account's own Instagram connection row. */
export async function seedInstagramConnection(
  t: TestDeps,
  ids: ItemIds,
  options: SeedConnectionOptions = {},
): Promise<string> {
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  let custodianPersonId: string | null = null;
  if (options.withCustodian !== false) {
    const people = await t.deps.uow.repos.people.list(scope);
    custodianPersonId = people.find((person) => person.role === "custodian")?.id ?? null;
  }
  const created = await t.deps.uow.repos.connections.create(scope, {
    provider: "instagram",
    encryptedToken: "v1:test-token",
    custodianPersonId,
    status: options.status ?? "active",
  });
  return created.id;
}

/** Approve one item at its delivered version. */
export async function approveTestItem(
  t: TestDeps,
  ids: ItemIds,
  itemId: string,
  versionHash: string,
) {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_item",
    payload: { itemId, expectedVersionHash: versionHash },
  });
  if (!outcome.ok) {
    throw new Error(`approve_item failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return outcome.value;
}

/** Intent the approval created for an item version. */
export async function intentOf(t: TestDeps, ids: ItemIds, itemId: string, versionHash: string) {
  const intent = await t.deps.uow.repos.intents.getByItemVersion(
    { workspaceId: ids.workspaceId, accountId: ids.accountId },
    itemId,
    versionHash,
  );
  if (!intent) throw new Error(`missing intent for ${itemId}@${versionHash}`);
  return intent;
}

/** A due time: 5 min before the default test clock (Mon 11:00 SP). */
export function dueScheduledFor(): Date {
  return new Date("2026-10-05T13:55:00.000Z");
}

/** Deliver one due item and approve it; returns ids + intent id. */
export async function deliverDueApprovedItem(
  t: TestDeps,
  ids: ItemIds,
  options: { caption?: string } = {},
) {
  const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
    items: [{ scheduledFor: dueScheduledFor(), caption: options.caption ?? "legenda 1" }],
  });
  const itemId = itemIds[0]!;
  const versionHash = versionHashes[0]!;
  await approveTestItem(t, ids, itemId, versionHash);
  const intent = await intentOf(t, ids, itemId, versionHash);
  return { itemId, versionHash, intentId: intent.id };
}
