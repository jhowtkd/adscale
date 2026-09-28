// Adjustments and client decisions on items (#545): request_adjustment,
// edit_caption (new immutable version + async revalidation), the agent's
// record_caption_triage applying the domain triageCaptionEdit, plus
// confirm_business_fact, decline_publish and cancel_scheduled. choose_piece
// lives in ./items-choose.

import { z } from "zod";
import {
  actorId,
  cancelScheduledItem,
  declineToPublish,
  editItem,
  err,
  ok,
  requestItemAdjustment,
  triageCaptionEdit,
  type Result,
} from "../domain";
import type { EquipeModuleDeps } from "./ports";
import {
  cancelScheduledPayloadSchema,
  confirmBusinessFactPayloadSchema,
  declinePublishPayloadSchema,
  editCaptionPayloadSchema,
  recordCaptionTriagePayloadSchema,
  requestAdjustmentPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  writeReceipt,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  AGENT_WORK_REQUESTED_EVENT,
  BUSINESS_FACT_CONFIRMED_EVENT,
  CAPTION_EDITED_EVENT,
  CAPTION_TRIAGED_EVENT,
  destinationFromEvents,
  domainStateOf,
  ESCALATION_REQUESTED_EVENT,
  fromDomainItemStatus,
  ITEM_ADJUSTMENT_REQUESTED_EVENT,
  ITEM_CANCELLED_EVENT,
  ITEM_DECLINED_EVENT,
  itemVersionHash,
  loadItemOrError,
  loadItemReview,
  versionContentOf,
  voidIntentForVersion,
} from "./item-shared";

export type RequestAdjustmentPayload = z.infer<typeof requestAdjustmentPayloadSchema>;
export type EditCaptionPayload = z.infer<typeof editCaptionPayloadSchema>;
export type RecordCaptionTriagePayload = z.infer<typeof recordCaptionTriagePayloadSchema>;
export type ConfirmBusinessFactPayload = z.infer<typeof confirmBusinessFactPayloadSchema>;
export type DeclinePublishPayload = z.infer<typeof declinePublishPayloadSchema>;
export type CancelScheduledPayload = z.infer<typeof cancelScheduledPayloadSchema>;

/** Categorized adjustment request → the IA produces a new version. */
export async function runRequestAdjustment(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RequestAdjustmentPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const receipts = await ctx.repos.receipts.listByObject(scopeOf(ctx), "item", payload.itemId);
    const state = domainStateOf(loaded.value, receipts);
    if (!state.ok) return state;
    const decided = requestItemAdjustment(
      state.value,
      payload.note ?? `categoria: ${payload.category}`,
    );
    if (!decided.ok) return decided;
    await ctx.repos.items.update(scopeOf(ctx), payload.itemId, {
      status: fromDomainItemStatus(decided.value.state.status, "in_production"),
    });
    await appendEvent(ctx, {
      eventType: ITEM_ADJUSTMENT_REQUESTED_EVENT,
      objectType: "item",
      objectId: payload.itemId,
      payload: { category: payload.category, note: payload.note ?? null },
    });
    await appendEvent(ctx, {
      eventType: AGENT_WORK_REQUESTED_EVENT,
      objectType: "item",
      objectId: payload.itemId,
      payload: { kind: "adjustment", category: payload.category },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "item.adjustment_requested",
      detail: { itemId: payload.itemId, category: payload.category },
    });
    return ok({ itemId: payload.itemId, category: payload.category });
  });
}

/**
 * The client edits the caption: a new immutable version is born and the
 * item goes to "editado por você · em revisão". Editing a scheduled item
 * supersedes the old approval and voids its intent. Revalidation is async:
 * the edit records an agent-work request; the reviewer AI reports back via
 * record_caption_triage.
 */
export async function runEditCaption(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: EditCaptionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    if (!item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    const current = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
    if (!current) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    if (current.caption === payload.caption) {
      return err("no_change", "the caption is unchanged");
    }
    const itemEvents = await ctx.repos.events.list(scope, { objectType: "item", objectId: item.id });
    const destination = destinationFromEvents(itemEvents);
    if (!destination) {
      return err("invalid_transition", `item ${item.id} has no recorded destination account`);
    }
    const versionHash = itemVersionHash({
      ...versionContentOf(current, destination),
      caption: payload.caption,
    });
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = editItem(state.value, versionHash);
    if (!decided.ok) return decided;
    await ctx.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash,
      creativeWorkOutputId: current.creativeWorkOutputId,
      caption: payload.caption,
      scheduledFor: current.scheduledFor,
      authorRole: "client_person",
      authorId: actorId(ctx.actor),
      reviewerFindings: null,
    });
    await ctx.repos.items.update(scope, item.id, {
      status: fromDomainItemStatus(decided.value.state.status),
      currentVersionHash: versionHash,
    });
    const superseded = state.value.approvedVersion;
    let intentId: string | null = null;
    if (superseded) {
      intentId = (await voidIntentForVersion(ctx, item.id, superseded)).intentId;
    }
    await appendEvent(ctx, {
      eventType: CAPTION_EDITED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: {
        versionHash,
        previousVersionHash: item.currentVersionHash,
        destinationAccount: destination,
        supersededVersion: superseded,
        voidedIntentId: intentId,
      },
    });
    await appendEvent(ctx, {
      eventType: AGENT_WORK_REQUESTED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { kind: "caption_revalidation", versionHash },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "caption.edited",
      detail: { itemId: item.id, versionHash },
    });
    return ok({ itemId: item.id, versionHash, voidedIntentId: intentId });
  });
}

function isCalibrating(front: { status: string } | null): boolean {
  return front?.status === "calibrating";
}

/**
 * The agent reports what the edited caption asserts; the domain routes each
 * commercial nature to its single path: permanent fact → "confirmar como
 * fato do negócio"; commercial condition → blocked with a pointer to the
 * offer catalog; regulated claim → blocked + escalation request for
 * quality. During calibration the version also needs the quality re-check
 * again before it can go back to decision.
 */
export async function runRecordCaptionTriage(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RecordCaptionTriagePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    if (item.status !== "in_review" || !item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} is not awaiting caption triage`);
    }
    const front = await ctx.repos.fronts.get(scope, item.frontId);
    const triage = triageCaptionEdit(payload.natures);
    const needsRecheck = isCalibrating(front) && !payload.qualityRecheckPassed;
    const backToDecision = !needsRecheck;
    if (backToDecision) {
      await ctx.repos.items.update(scope, item.id, { status: "pending_approval" });
    }
    const detail: Record<string, unknown> = {
      versionHash: item.currentVersionHash,
      natures: payload.natures,
      path: triage.path,
      matched: triage.matched,
      warnings: payload.warnings,
    };
    if (triage.path === "update_catalog_only") {
      detail.catalogPointer = { kind: "offer_catalog" };
    }
    if (needsRecheck) {
      detail.qualityRecheck = "pending";
    }
    await appendEvent(ctx, {
      eventType: CAPTION_TRIAGED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: detail,
    });
    if (triage.path === "block_and_escalate") {
      await appendEvent(ctx, {
        eventType: ESCALATION_REQUESTED_EVENT,
        objectType: "item",
        objectId: item.id,
        payload: {
          reason: "regulated_claim",
          severity: "high",
          ownerRole: "quality",
          versionHash: item.currentVersionHash,
        },
      });
    }
    await requestNotification(ctx, {
      recipientRole: needsRecheck ? "quality" : "approver",
      templateKey: needsRecheck ? "caption.recheck_requested" : "caption.triaged",
      detail: { itemId: item.id, path: triage.path },
    });
    return ok({ itemId: item.id, path: triage.path, matched: triage.matched, backToDecision });
  });
}

/** The client confirms an asserted permanent fact as business fact (receipt). */
export async function runConfirmBusinessFact(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ConfirmBusinessFactPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    if (item.status !== "pending_approval" || !item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} is not awaiting a decision`);
    }
    if (payload.expectedVersionHash !== item.currentVersionHash) {
      return err("version_mismatch", "mudou desde que você abriu, revise de novo");
    }
    const existing = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const already = existing.find(
      (r) => r.action === "confirm_business_fact" && r.objectVersion === item.currentVersionHash,
    );
    if (already) {
      return ok({ alreadyConfirmed: true, receiptId: already.id });
    }
    const review = await loadItemReview(ctx.repos, scope, item);
    if (review.status !== "needs_confirmation") {
      return err("nothing_to_confirm", `item ${item.id} is not asking for fact confirmation`);
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "item",
      objectId: item.id,
      objectVersion: item.currentVersionHash,
      action: "confirm_business_fact",
      detail: { source: review.triage ? "caption_triage" : "delivery" },
    });
    await appendEvent(ctx, {
      eventType: BUSINESS_FACT_CONFIRMED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { versionHash: item.currentVersionHash, declaredBy: actorId(ctx.actor) },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "business_fact.confirmed",
      detail: { itemId: item.id, versionHash: item.currentVersionHash },
    });
    return ok({ itemId: item.id, receiptId: receipt.id });
  });
}

/** The client drops the item from the calendar with a reason (receipt). */
export async function runDeclinePublish(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DeclinePublishPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = declineToPublish(state.value, payload.reason);
    if (!decided.ok) return decided;
    const receipt = await writeReceipt(ctx, {
      objectType: "item",
      objectId: item.id,
      objectVersion: state.value.currentVersion,
      action: "decline_publish",
      detail: { reason: payload.reason },
    });
    await ctx.repos.items.update(scope, item.id, {
      status: fromDomainItemStatus(decided.value.state.status),
    });
    await appendEvent(ctx, {
      eventType: ITEM_DECLINED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { reason: payload.reason, receiptId: receipt.id },
    });
    await appendEvent(ctx, {
      eventType: AGENT_WORK_REQUESTED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { kind: "replacement_proposal" },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "item.declined",
      detail: { itemId: item.id, reason: payload.reason },
    });
    return ok({ itemId: item.id, receiptId: receipt.id });
  });
}

/** The client cancels a scheduled item before dispatch (receipt, voids intent). */
export async function runCancelScheduled(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: CancelScheduledPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = cancelScheduledItem(state.value);
    if (!decided.ok) return decided;
    const receipt = await writeReceipt(ctx, {
      objectType: "item",
      objectId: item.id,
      objectVersion: state.value.currentVersion,
      action: "cancel_scheduled",
    });
    await ctx.repos.items.update(scope, item.id, {
      status: fromDomainItemStatus(decided.value.state.status),
    });
    const { voided, intentId } = state.value.approvedVersion
      ? await voidIntentForVersion(ctx, item.id, state.value.approvedVersion)
      : { voided: false, intentId: null };
    await appendEvent(ctx, {
      eventType: ITEM_CANCELLED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { receiptId: receipt.id, voidedIntentId: voided ? intentId : null },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "item.cancelled",
      detail: { itemId: item.id },
    });
    return ok({ itemId: item.id, receiptId: receipt.id, voidedIntentId: voided ? intentId : null });
  });
}
