// dispatch_publication send (#548): the two-step publish after the gate
// passed. The publisher is called OUTSIDE transactions, in phases: prepare
// (gate → held/missed/sending), create container, persist the container id,
// record the publish attempt, publish, outcome (published/verifying/failed).
//
// A retry reuses the stored container and never creates another; a retry
// that finds a recorded publish attempt for that container never calls
// publish again — the outcome is ambiguous (the process may have died after
// the provider accepted the call), so the item goes to `verifying` and
// reconcile owns it from there. A timeout or ambiguous response goes to
// `verifying` the same way. Nunca há republicação às cegas.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeEvent } from "../data";
import type { EquipeModuleDeps, Publisher } from "./ports";
import { PublisherFailedError, PublisherUncertainError } from "./ports";
import { dispatchPublicationPayloadSchema } from "./envelope";
import {
  appendEvent,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { storedDestinationOf } from "./item-shared";
import { prepareDispatch, type PrepareDispatch } from "./dispatch-gate";
import {
  ITEM_CONTAINER_CREATED_EVENT,
  ITEM_PUBLISH_ATTEMPTED_EVENT,
  hasPublishAttemptFor,
  loadIntentItemOrError,
  providerOf,
  writeFailedOutcome,
  writePublishedOutcome,
  writeUncertainOutcome,
} from "./dispatch-outcomes";

export type DispatchPublicationPayload = z.infer<typeof dispatchPublicationPayloadSchema>;

/**
 * Dispatch one claimed intent: gate, two-step send, outcome. External
 * publisher calls run between transactions — a crash between phases only
 * leaves the intent `sending` (lease expires, the job retries, the stored
 * container is reused, and a recorded publish attempt turns the retry into
 * `verifying` instead of a second publish call).
 */
export async function runDispatchPublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DispatchPublicationPayload,
): Promise<Result<CommandSuccess>> {
  const publisher: Publisher | undefined = deps.publisher;
  if (!publisher) {
    return err("publisher_missing", "dispatch needs a publisher");
  }
  const events: EquipeEvent[] = [];
  const prepared = await transact(deps, base, (ctx) => prepareDispatch(ctx, deps, payload.intentId));
  if (!prepared.ok) return prepared;
  events.push(...prepared.value.events);
  const prep = prepared.value.data as unknown as PrepareDispatch;
  if (prep.action !== "send") {
    return ok({ accountId: prepared.value.accountId, events, data: prepared.value.data });
  }

  const input = {
    workspaceId: base.workspaceId,
    accountId: base.accountId,
    itemId: prep.itemId,
    versionHash: prep.versionHash,
    caption: prep.caption,
    mediaRef: prep.mediaRef,
  };
  let containerId = prep.containerId;
  if (!containerId) {
    try {
      containerId = (await publisher.createContainer(input)).containerId;
    } catch (error) {
      return failFromPublisher(deps, base, events, payload.intentId, "create", null, error);
    }
    const persisted = await transact(deps, base, async (ctx) => {
      const loaded = await loadIntentItemOrError(ctx, payload.intentId);
      if (!loaded.ok) return loaded;
      // The container id is stored BEFORE the publish call, so any retry
      // reuses it instead of creating another container.
      await ctx.repos.intents.update(scopeOf(ctx), loaded.value.intent.id, { containerId });
      await appendEvent(ctx, {
        eventType: ITEM_CONTAINER_CREATED_EVENT,
        objectType: "item",
        objectId: loaded.value.item.id,
        payload: { containerId },
      });
      return ok({ containerId });
    });
    if (!persisted.ok) return persisted;
    events.push(...persisted.value.events);
  }

  // The attempt is recorded BEFORE the publish call, in its own
  // transaction: a crash after this point (even one where the provider
  // accepted the call) retries into `verifying`, never into a republish.
  const claimed = await transact(deps, base, async (ctx) => {
    const loaded = await loadIntentItemOrError(ctx, payload.intentId);
    if (!loaded.ok) return loaded;
    if (await hasPublishAttemptFor(ctx, loaded.value.item.id, containerId)) {
      return ok({ alreadyAttempted: true });
    }
    await appendEvent(ctx, {
      eventType: ITEM_PUBLISH_ATTEMPTED_EVENT,
      objectType: "item",
      objectId: loaded.value.item.id,
      payload: { containerId, intentId: payload.intentId },
    });
    return ok({ alreadyAttempted: false });
  });
  if (!claimed.ok) return claimed;
  events.push(...claimed.value.events);
  if ((claimed.value.data as { alreadyAttempted: boolean }).alreadyAttempted) {
    return returnUncertainOutcome(
      deps,
      base,
      events,
      payload.intentId,
      containerId,
      "tentativa de publish já registrada para este container — resultado desconhecido após queda, a reconciliação decide",
    );
  }

  let published: { externalId: string; permalink?: string };
  try {
    published = await publisher.publishContainer({ ...input, containerId });
  } catch (error) {
    return failFromPublisher(deps, base, events, payload.intentId, "publish", containerId, error);
  }

  const done = await transact(deps, base, async (ctx) => {
    const loaded = await loadIntentItemOrError(ctx, payload.intentId);
    if (!loaded.ok) return loaded;
    const written = await writePublishedOutcome(ctx, loaded.value.item, loaded.value.intent, {
      externalId: published.externalId,
      permalink: published.permalink,
      containerId,
      versionHash: prep.versionHash,
    });
    if (!written.ok) return written;
    return ok({
      action: "published",
      itemId: prep.itemId,
      intentId: payload.intentId,
      externalId: published.externalId,
      permalink: published.permalink ?? null,
      containerId,
    });
  });
  if (!done.ok) return done;
  events.push(...done.value.events);
  return ok({ accountId: done.value.accountId, events, data: done.value.data });
}

async function returnUncertainOutcome(
  deps: EquipeModuleDeps,
  base: TxBase,
  events: EquipeEvent[],
  intentId: string,
  containerId: string | null,
  error: string,
): Promise<Result<CommandSuccess>> {
  const outcome = await transact(deps, base, async (ctx) => {
    const loaded = await loadIntentItemOrError(ctx, intentId);
    if (!loaded.ok) return loaded;
    const written = await writeUncertainOutcome(ctx, loaded.value.item, loaded.value.intent, {
      step: containerId ? "publish" : "create",
      containerId,
      error,
    });
    if (!written.ok) return written;
    return ok({
      action: "verifying",
      step: containerId ? "publish" : "create",
      containerId,
      itemId: loaded.value.item.id,
      intentId,
    });
  });
  if (!outcome.ok) return outcome;
  events.push(...outcome.value.events);
  return ok({ accountId: outcome.value.accountId, events, data: outcome.value.data });
}

async function failFromPublisher(
  deps: EquipeModuleDeps,
  base: TxBase,
  events: EquipeEvent[],
  intentId: string,
  step: "create" | "publish",
  containerId: string | null,
  error: unknown,
): Promise<Result<CommandSuccess>> {
  if (error instanceof PublisherUncertainError) {
    return returnUncertainOutcome(deps, base, events, intentId, containerId, error.message);
  }
  if (error instanceof PublisherFailedError) {
    const outcome = await transact(deps, base, async (ctx) => {
      const loaded = await loadIntentItemOrError(ctx, intentId);
      if (!loaded.ok) return loaded;
      const version = loaded.value.item.currentVersionHash
        ? await ctx.repos.itemVersions.getByHash(
            scopeOf(ctx),
            loaded.value.item.id,
            loaded.value.item.currentVersionHash,
          )
        : null;
      const provider = providerOf(storedDestinationOf(loaded.value.item, version));
      const connections = await ctx.repos.connections.list(scopeOf(ctx));
      const connection =
        provider == null ? null : (connections.find((row) => row.provider === provider) ?? null);
      const written = await writeFailedOutcome(ctx, loaded.value.item, loaded.value.intent, {
        code: error.code,
        error: error.message,
        step,
        connection,
      });
      if (!written.ok) return written;
      return ok({
        action: "failed",
        step,
        code: error.code,
        itemId: loaded.value.item.id,
        intentId,
        connectionId: written.value.connectionId,
      });
    });
    if (!outcome.ok) return outcome;
    events.push(...outcome.value.events);
    return ok({ accountId: outcome.value.accountId, events, data: outcome.value.data });
  }
  throw error;
}
