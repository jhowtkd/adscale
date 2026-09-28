// deliver_batch: the agent (or a system job) delivers a batch with its
// "aprovar até" deadline and items. Each item links a creative work/output
// verified against the AdscaleGateway and starts at version 1, whose hash
// covers output + caption + destination account + scheduled time.

import { z } from "zod";
import { actorId, err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { deliverBatchPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  BATCH_DELIVERED_EVENT,
  ITEM_DELIVERED_EVENT,
  itemDeadlineFor,
  itemVersionHash,
} from "./item-shared";

export type DeliverBatchPayload = z.infer<typeof deliverBatchPayloadSchema>;

/**
 * Deliver a batch: verify every work/output belongs to the workspace, then
 * create the batch, its items and each version 1. Suspended/closed accounts
 * receive nothing.
 */
export async function runDeliverBatch(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DeliverBatchPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (account.value.status === "suspended" || account.value.status === "closed") {
      return err(
        "invalid_transition",
        `cannot deliver a batch on a ${account.value.status} account`,
      );
    }
    const scope = scopeOf(ctx);
    const front = await ctx.repos.fronts.get(scope, payload.frontId);
    if (!front) {
      return err("unknown_front", `unknown front ${payload.frontId}`);
    }
    const author = authorOf(ctx);
    const verified = await verifyBatchInputs(deps, ctx, payload);
    if (!verified.ok) return verified;

    const batch = await ctx.repos.batches.create(scope, {
      frontId: payload.frontId,
      title: payload.title,
      status: "delivered",
      approveByAt: payload.approveByAt,
      deliveredAt: ctx.now,
    });
    const itemIds: string[] = [];
    const versionHashes: string[] = [];
    for (let index = 0; index < payload.items.length; index += 1) {
      const input = payload.items[index]!;
      const versionHash = itemVersionHash({
        output: input.creativeWorkOutputId,
        caption: input.caption,
        destination: input.destinationAccount,
        scheduledFor: input.scheduledFor,
      });
      const item = await ctx.repos.items.create(scope, {
        frontId: payload.frontId,
        batchId: batch.id,
        creativeWorkId: input.creativeWorkId,
        status: "pending_approval",
        scheduledFor: input.scheduledFor,
        deadlineAt: itemDeadlineFor(input.scheduledFor),
        currentVersionHash: versionHash,
      });
      await ctx.repos.itemVersions.create(scope, {
        itemId: item.id,
        versionHash,
        creativeWorkOutputId: input.creativeWorkOutputId,
        caption: input.caption,
        scheduledFor: input.scheduledFor,
        authorRole: author.role,
        authorId: author.id,
        reviewerFindings: input.needsConfirmation ? { needsConfirmation: true } : null,
      });
      await appendEvent(ctx, {
        eventType: ITEM_DELIVERED_EVENT,
        objectType: "item",
        objectId: item.id,
        payload: {
          batchId: batch.id,
          versionHash,
          destinationAccount: input.destinationAccount,
          scheduledFor: input.scheduledFor.toISOString(),
          needsConfirmation: input.needsConfirmation,
        },
      });
      itemIds.push(item.id);
      versionHashes.push(versionHash);
    }
    await appendEvent(ctx, {
      eventType: BATCH_DELIVERED_EVENT,
      objectType: "batch",
      objectId: batch.id,
      payload: { itemCount: itemIds.length, approveByAt: payload.approveByAt.toISOString() },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "batch.delivered",
      detail: { batchId: batch.id, itemCount: itemIds.length },
    });
    return ok({ batchId: batch.id, itemIds, versionHashes });
  });
}

function authorOf(ctx: CommandContext): { role: string; id: string | null } {
  return { role: ctx.actor.kind, id: actorId(ctx.actor) };
}

async function verifyBatchInputs(
  deps: EquipeModuleDeps,
  ctx: CommandContext,
  payload: DeliverBatchPayload,
): Promise<Result<void>> {
  for (const input of payload.items) {
    const work = await deps.gateway.getCreativeWork(input.creativeWorkId);
    if (!work || work.workspaceId !== ctx.workspaceId) {
      return err(
        "unknown_creative_work",
        `creative work ${input.creativeWorkId} is not in workspace ${ctx.workspaceId}`,
      );
    }
    const output = await deps.gateway.getCreativeWorkOutput(input.creativeWorkOutputId);
    if (!output || output.workspaceId !== ctx.workspaceId) {
      return err(
        "unknown_creative_output",
        `creative output ${input.creativeWorkOutputId} is not in workspace ${ctx.workspaceId}`,
      );
    }
    if (output.workId !== input.creativeWorkId) {
      return err(
        "output_work_mismatch",
        `creative output ${input.creativeWorkOutputId} does not belong to work ${input.creativeWorkId}`,
      );
    }
  }
  return ok(undefined);
}
