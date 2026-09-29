// approve_item / approve_batch: the approver/substitute approves the exact
// version they saw. approve_batch takes a CLOSED LIST of { itemId,
// versionHash } and reports a per-item result: only "pronto" items are
// batch-approved; anything else is rejected per item, never silently.
// Silence never approves: there is no timeout path here. The first receipt
// wins: a second approval of the same version is a no-op result.
//
// On approval, same transaction: auto mode → scheduled + a publication
// intent (idempotency key itemId+versionHash); manual mode →
// available_for_download, no intent.

import { z } from "zod";
import { approveItem, err, ok, type Clock, type ItemReviewStatus, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { approveBatchPayloadSchema, approveItemPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  approvalReceiptFor,
  approvalModeFor,
  approvedByOf,
  BATCH_APPROVED_EVENT,
  domainStateOf,
  hasApprovedItemStatus,
  ITEM_APPROVED_EVENT,
  loadItemOrError,
  loadItemReview,
  requireItemApprovalWindow,
} from "./item-shared";
import { conferencePendingMessage, isItemConferring } from "./calibration-conference";

export type ApproveItemPayload = z.infer<typeof approveItemPayloadSchema>;
export type ApproveBatchPayload = z.infer<typeof approveBatchPayloadSchema>;

export type BatchItemOutcome =
  | "approved"
  | "changed_since_opened"
  | "not_ready"
  | "already_decided"
  | "unknown_item";

export type BatchItemResult = {
  itemId: string;
  outcome: BatchItemOutcome;
  receiptId?: string;
  reviewStatus?: ItemReviewStatus;
  /** Set when not_ready means "still in calibration conference". */
  conferencePending?: true;
  code?: "invalid_transition" | "item_limit_passed";
};

async function approveOne(
  ctx: CommandContext,
  action: "approve_item" | "approve_batch",
  itemId: string,
  versionHash: string,
  accountStatus: string,
  clock: Clock,
): Promise<BatchItemResult> {
  const scope = scopeOf(ctx);
  const loaded = await loadItemOrError(ctx, itemId);
  if (!loaded.ok) return { itemId, outcome: "unknown_item" };
  const item = loaded.value;
  // Calibration conference: un-conferred items are per-item "not_ready".
  if (await isItemConferring(ctx.repos, scope, accountStatus, item)) {
    return { itemId, outcome: "not_ready", conferencePending: true };
  }
  if (versionHash !== item.currentVersionHash) {
    return { itemId, outcome: "changed_since_opened" };
  }
  const first = await approvalReceiptFor(ctx, itemId, versionHash);
  if (first) {
    return hasApprovedItemStatus(item)
      ? { itemId, outcome: "already_decided", receiptId: first.id }
      : { itemId, outcome: "not_ready", code: "invalid_transition" };
  }
  const receipts = await ctx.repos.receipts.listByObject(scope, "item", itemId);
  const state = domainStateOf(item, receipts);
  if (!state.ok) return { itemId, outcome: "not_ready" };
  if (state.value.status !== "awaiting_approval") {
    return { itemId, outcome: "not_ready", code: "invalid_transition" };
  }
  const review = await loadItemReview(ctx.repos, scope, item);
  const individuallyApprovable =
    action === "approve_item"
      ? review.status === "ready" || review.status === "needs_confirmation"
      : review.batchApprovable;
  if (!individuallyApprovable) {
    return { itemId, outcome: "not_ready", reviewStatus: review.status };
  }
  const mode = await approvalModeFor(ctx, item);
  if (mode === "auto" && !item.scheduledFor) {
    return { itemId, outcome: "not_ready", reviewStatus: review.status };
  }
  const decided = approveItem(state.value, {
    version: versionHash,
    approvedBy: approvedByOf(ctx),
    mode,
  });
  if (!decided.ok) {
    return { itemId, outcome: "not_ready", reviewStatus: review.status };
  }
  // A request may have waited for a concurrent decision past the deadline.
  ctx.now = clock.now();
  if (!requireItemApprovalWindow(item, ctx.now).ok) {
    return { itemId, outcome: "not_ready", code: "item_limit_passed" };
  }
  const receipt = await writeReceipt(ctx, {
    objectType: "item",
    objectId: item.id,
    objectVersion: versionHash,
    action,
    detail: { mode, reviewStatus: review.status },
  });
  await ctx.repos.items.update(scope, item.id, {
    status: decided.value.state.status,
  });
  let intentId: string | null = null;
  if (mode === "auto" && item.scheduledFor) {
    const version = await ctx.repos.itemVersions.getByHash(scope, item.id, versionHash);
    const { intent } = await ctx.repos.intents.insertOrGet(scope, {
      itemId: item.id,
      versionHash,
      destinationIgUserId: version?.destinationIgUserId ?? null,
      status: "pending",
      scheduledFor: item.scheduledFor,
    });
    intentId = intent.id;
  }
  await appendEvent(ctx, {
    eventType: ITEM_APPROVED_EVENT,
    objectType: "item",
    objectId: item.id,
    payload: { versionHash, mode, receiptId: receipt.id, intentId },
  });
  return { itemId, outcome: "approved", receiptId: receipt.id };
}

/** Approve one item at the exact version hash — stale means "review again". */
export async function runApproveItem(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApproveItemPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const result = await approveOne(
      ctx,
      "approve_item",
      payload.itemId,
      payload.expectedVersionHash,
      account.value.status,
      deps.clock,
    );
    if (result.outcome === "unknown_item") {
      return err("unknown_item", `unknown item ${payload.itemId}`);
    }
    if (result.outcome === "changed_since_opened") {
      return err("version_mismatch", "mudou desde que você abriu, revise de novo");
    }
    if (result.outcome === "not_ready") {
      if (result.code === "item_limit_passed") {
        return err(result.code, "o prazo de aprovação passou; aguarde uma nova proposta de horário");
      }
      if (result.code === "invalid_transition") {
        return err(result.code, "o item já recebeu outra decisão; revise de novo");
      }
      if (result.conferencePending) {
        return err("conference_pending", conferencePendingMessage(payload.itemId));
      }
      return err(
        "item_not_ready",
        `item ${payload.itemId} is not ready for approval (${result.reviewStatus ?? "undecidable"})`,
      );
    }
    if (result.outcome === "already_decided") {
      return ok({ alreadyApproved: true, receiptId: result.receiptId });
    }
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "item.approved",
      detail: { itemId: payload.itemId, receiptId: result.receiptId },
    });
    return ok({ receiptId: result.receiptId });
  });
}

/**
 * Approve a closed list of { itemId, versionHash } with a per-item result.
 * Stale, not-ready and foreign items are rejected per item; only "pronto"
 * items are approved.
 */
export async function runApproveBatch(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApproveBatchPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const results: BatchItemResult[] = [];
    // Lock in a stable order across batches; keep the response in request order.
    const ordered = payload.items.map((entry, index) => ({ entry, index }))
      .sort((a, b) => a.entry.itemId.localeCompare(b.entry.itemId));
    for (const { entry, index } of ordered) {
      results[index] = await approveOne(ctx, "approve_batch", entry.itemId, entry.versionHash, account.value.status, deps.clock);
    }
    const approved = results.filter((r) => r.outcome === "approved").length;
    await appendEvent(ctx, {
      eventType: BATCH_APPROVED_EVENT,
      payload: {
        requested: results.length,
        approved,
        results: results.map((r) => ({ itemId: r.itemId, outcome: r.outcome })),
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "batch.approved",
      detail: { requested: results.length, approved },
    });
    return ok({ results });
  });
}
