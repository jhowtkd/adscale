// remove_published_post (#548): operations removes an already-published
// post. The removal goes through the API when it exists; when it does not,
// the custodian removes it guided by one of our people. Both are recorded
// with the time — the item keeps its `published` state (it was published),
// and the removal lives on the event, never as a rewrite of history.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps, Publisher } from "./ports";
import { PublisherFailedError, PublisherUncertainError } from "./ports";
import { removePublishedPostPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { loadItemOrError } from "./item-shared";

export type RemovePublishedPostPayload = z.infer<typeof removePublishedPostPayloadSchema>;

export const POST_REMOVED_EVENT = "post.removed";

/**
 * Operations records a post removal. `via: "api"` calls the publisher's
 * delete; `via: "custodian"` only records a removal the custodian did by
 * hand. Only published items with a recorded external id qualify.
 */
export async function runRemovePublishedPost(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RemovePublishedPostPayload,
): Promise<Result<CommandSuccess>> {
  const prepared = await transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const item = loaded.value;
    if (item.status !== "published") {
      return err("invalid_transition", `item ${item.id} is ${item.status}, not published`);
    }
    if (!item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    const intent = await ctx.repos.intents.getByItemVersion(
      scopeOf(ctx),
      item.id,
      item.currentVersionHash,
    );
    if (!intent?.externalId) {
      return err("unknown_external_id", `item ${item.id} has no recorded external media id`);
    }
    return ok({ itemId: item.id, externalId: intent.externalId });
  });
  if (!prepared.ok) return prepared;
  const { itemId, externalId } = prepared.value.data as { itemId: string; externalId: string };

  if (payload.via === "api") {
    const publisher: Publisher | undefined = deps.publisher;
    if (!publisher) {
      return err("publisher_missing", "removal needs a publisher");
    }
    try {
      await publisher.deleteMedia({
        workspaceId: base.workspaceId,
        accountId: base.accountId,
        externalId,
      });
    } catch (error) {
      if (error instanceof PublisherUncertainError) {
        return err("removal_uncertain", error.message);
      }
      if (error instanceof PublisherFailedError) {
        return err("removal_failed", error.message);
      }
      throw error;
    }
  }

  const recorded = await transact(deps, base, async (ctx) => {
    const loaded = await loadItemOrError(ctx, itemId);
    if (!loaded.ok) return loaded;
    await appendEvent(ctx, {
      eventType: POST_REMOVED_EVENT,
      objectType: "item",
      objectId: itemId,
      payload: {
        externalId,
        via: payload.via,
        reason: payload.reason ?? null,
        removedAt: ctx.now.toISOString(),
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "post.removed",
      detail: { itemId, externalId, via: payload.via },
    });
    return ok({ itemId, externalId, via: payload.via });
  });
  if (!recorded.ok) return recorded;
  return ok({
    accountId: recorded.value.accountId,
    events: [...prepared.value.events, ...recorded.value.events],
    data: recorded.value.data,
  });
}
