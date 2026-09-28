// Shared internals of the batch-approval commands (#545): stored/domain
// item-status mapping, the version hash (output + caption + destination
// account + scheduled time), review-status resolution over versions +
// events, manual/auto mode, and publication-intent voiding.

import {
  actorId,
  err,
  isBatchApprovable,
  ok,
  resolveReviewStatus,
  type ClaimNature,
  type ItemReviewFlags,
  type ItemReviewStatus,
  type ItemState,
  type ItemStatus,
  type Result,
  type TriagePath,
} from "../domain";
import type {
  AccountScope,
  EquipeEvent,
  EquipeItem,
  EquipeItemStatus,
  EquipeItemVersion,
  EquipeReceipt,
  EquipeRepositories,
} from "../data";
import { MANUAL_MODE_AGREED_EVENT } from "./onboarding";
import { scopeOf, versionHash, type CommandContext } from "./shared";

export const ITEM_DELIVERED_EVENT = "item.delivered";
export const BATCH_DELIVERED_EVENT = "batch.delivered";
export const ITEM_APPROVED_EVENT = "item.approved";
export const BATCH_APPROVED_EVENT = "batch.approved";
export const ITEM_ADJUSTMENT_REQUESTED_EVENT = "item.adjustment_requested";
export const CAPTION_EDITED_EVENT = "caption.edited";
export const CAPTION_TRIAGED_EVENT = "caption.triaged";
export const BUSINESS_FACT_CONFIRMED_EVENT = "business_fact.confirmed";
export const ITEM_DECLINED_EVENT = "item.declined";
export const ITEM_CANCELLED_EVENT = "item.cancelled";
export const PIECE_CHOSEN_EVENT = "piece.chosen";
export const ITEM_WINDOW_MISSED_EVENT = "item.window_missed";
export const ITEM_RESCHEDULED_EVENT = "item.rescheduled";
export const AGENT_WORK_REQUESTED_EVENT = "agent_work.requested";
export const ESCALATION_REQUESTED_EVENT = "escalation.requested";

/** Approval actions that write the first-wins receipt on an item version. */
export const ITEM_APPROVAL_ACTIONS = ["approve_item", "approve_batch", "choose_piece"] as const;

/** Item limit: each item stays decidable until 2 h before its time. */
export const ITEM_DECISION_LEAD_MS = 2 * 60 * 60 * 1000;

export function itemDeadlineFor(scheduledFor: Date): Date {
  return new Date(scheduledFor.getTime() - ITEM_DECISION_LEAD_MS);
}

// Stored row status → domain machine status. The stored enum has no
// adjusting/do_not_publish/available_for_download/sending/failed/manual tail:
// adjusting reads back from in_production (adjustment running) and in_review
// (edit revalidation running); both decline and cancel land on canceled,
// told apart by their receipt action; available_for_download (manual-mode
// approval, media-package choice) reads back from approved.
export function toDomainItemStatus(status: string): ItemStatus | null {
  switch (status) {
    case "draft":
    case "pending_approval":
      return "awaiting_approval";
    case "in_production":
    case "in_review":
      return "adjusting";
    case "approved":
      return "available_for_download";
    case "scheduled":
      return "scheduled";
    case "held":
      return "held";
    case "verifying":
      return "verifying";
    case "published":
      return "published";
    case "missed_window":
      return "missed_window";
    case "canceled":
      return "cancelled";
    default:
      return null;
  }
}

// Domain machine status → stored row status. request_adjustment stores
// in_production (the IA is producing) while caption edits store in_review
// (revalidation running); both read back as adjusting. sending/failed and
// the manual tail have no stored status yet — dispatch (#551) and manual
// confirmation own those transitions.
export function fromDomainItemStatus(
  status: ItemStatus,
  adjustingAs: "in_production" | "in_review" = "in_review",
): EquipeItemStatus {
  switch (status) {
    case "awaiting_approval":
      return "pending_approval";
    case "adjusting":
      return adjustingAs;
    case "scheduled":
      return "scheduled";
    case "held":
      return "held";
    case "missed_window":
      return "missed_window";
    case "do_not_publish":
    case "cancelled":
      return "canceled";
    case "available_for_download":
      return "approved";
    case "verifying":
      return "verifying";
    case "published":
      return "published";
    case "sending":
    case "failed":
    case "published_declared":
    case "published_confirmed":
      throw new Error(`${status} has no stored item status`);
  }
}

export type ItemVersionContent = {
  output: string | null;
  caption: string;
  destination: string;
  scheduledFor: Date | string | null;
};

/** Hash of the canonical version content; approvals bind to the exact hash. */
export function itemVersionHash(content: ItemVersionContent): string {
  return versionHash(content);
}

export function versionContentOf(
  version: Pick<EquipeItemVersion, "creativeWorkOutputId" | "caption" | "scheduledFor">,
  destinationAccount: string,
): ItemVersionContent {
  return {
    output: version.creativeWorkOutputId,
    caption: version.caption,
    destination: destinationAccount,
    scheduledFor: version.scheduledFor,
  };
}

// Reviewer/revalidation findings kept on the immutable version row.
// Versions cannot be updated, so later signals (triage, fact confirmation,
// escalation) live on events and are joined at read time.
export type ItemVersionFindings = {
  needsConfirmation?: boolean;
  blocked?: boolean;
  warnings?: string[];
};

export function parseVersionFindings(value: unknown): ItemVersionFindings {
  if (typeof value !== "object" || value === null) return {};
  const findings = value as Record<string, unknown>;
  const out: ItemVersionFindings = {};
  if (typeof findings.needsConfirmation === "boolean") out.needsConfirmation = findings.needsConfirmation;
  if (typeof findings.blocked === "boolean") out.blocked = findings.blocked;
  if (Array.isArray(findings.warnings)) {
    out.warnings = findings.warnings.filter((w): w is string => typeof w === "string");
  }
  return out;
}

export type CaptionTriageRecord = {
  versionHash: string;
  natures: ClaimNature[];
  path: TriagePath;
  warnings: string[];
  qualityRecheckPending: boolean;
};

function isClaimNature(value: unknown): value is ClaimNature {
  return (
    value === "permanent_fact" ||
    value === "commercial_condition" ||
    value === "regulated_claim" ||
    value === "none"
  );
}

function isTriagePath(value: unknown): value is TriagePath {
  return (
    value === "confirm_as_business_fact" ||
    value === "update_catalog_only" ||
    value === "block_and_escalate" ||
    value === "revalidate_only"
  );
}

export function parseTriageEvent(event: EquipeEvent): CaptionTriageRecord | null {
  if (event.eventType !== CAPTION_TRIAGED_EVENT) return null;
  const payload = event.payload as Record<string, unknown> | null;
  if (typeof payload !== "object" || payload === null) return null;
  if (typeof payload.versionHash !== "string" || !isTriagePath(payload.path)) return null;
  const natures = Array.isArray(payload.natures)
    ? (payload.natures as unknown[]).filter(isClaimNature)
    : [];
  const warnings = Array.isArray(payload.warnings)
    ? (payload.warnings as unknown[]).filter((w): w is string => typeof w === "string")
    : [];
  return {
    versionHash: payload.versionHash,
    natures,
    path: payload.path,
    warnings,
    qualityRecheckPending: payload.qualityRecheck === "pending",
  };
}

export type ItemReview = {
  flags: ItemReviewFlags;
  status: ItemReviewStatus;
  batchApprovable: boolean;
  triage: CaptionTriageRecord | null;
};

// Resolve the single review state of an item from its stored row, current
// version, item events and open-escalation signal, using the domain
// precedence (blocked > edited in review > edit with warning > needs
// confirmation > ready). Escalation rows carry no item link yet, so an open
// item escalation is read from escalation.requested/opened events without a
// later resolution until #548 owns the escalation link.
export function resolveItemReview(input: {
  item: EquipeItem;
  currentVersion: EquipeItemVersion | null;
  itemEvents: EquipeEvent[];
}): ItemReview {
  const { item, currentVersion, itemEvents } = input;
  const findings = parseVersionFindings(currentVersion?.reviewerFindings);
  let triage: CaptionTriageRecord | null = null;
  for (const event of itemEvents) {
    const record = parseTriageEvent(event);
    if (record && record.versionHash === item.currentVersionHash) triage = record;
  }
  const factConfirmed = itemEvents.some(
    (event) =>
      event.eventType === BUSINESS_FACT_CONFIRMED_EVENT &&
      (event.payload as { versionHash?: unknown } | null)?.versionHash === item.currentVersionHash,
  );
  let escalationOpen = false;
  for (const event of itemEvents) {
    if (event.eventType === ESCALATION_REQUESTED_EVENT || event.eventType === "escalation.opened") {
      escalationOpen = true;
    }
    if (event.eventType === "escalation.resolved" || event.eventType === "escalation.closed") {
      escalationOpen = false;
    }
  }
  const flags: ItemReviewFlags = {
    blocked:
      escalationOpen ||
      findings.blocked === true ||
      triage?.path === "block_and_escalate" ||
      triage?.path === "update_catalog_only",
    editedInReview:
      item.status === "in_review" && (!triage || triage.qualityRecheckPending),
    editWarning:
      triage !== null &&
      triage.warnings.length > 0 &&
      triage.path !== "block_and_escalate" &&
      triage.path !== "update_catalog_only",
    needsConfirmation:
      !factConfirmed &&
      (triage?.path === "confirm_as_business_fact" || findings.needsConfirmation === true),
  };
  const status = resolveReviewStatus(flags);
  return { flags, status, batchApprovable: isBatchApprovable(status), triage };
}

export async function loadItemReview(
  repos: EquipeRepositories,
  scope: AccountScope,
  item: EquipeItem,
): Promise<ItemReview> {
  const currentVersion = item.currentVersionHash
    ? await repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash)
    : null;
  const itemEvents = await repos.events.list(scope, { objectType: "item", objectId: item.id });
  return resolveItemReview({ item, currentVersion, itemEvents });
}

// The destination account is part of the version hash but has no version
// column, so every version-creating command records it on its event and the
// next version recovers it from the latest one.
export function destinationFromEvents(itemEvents: EquipeEvent[]): string | null {
  const creating = new Set([
    ITEM_DELIVERED_EVENT,
    CAPTION_EDITED_EVENT,
    ITEM_RESCHEDULED_EVENT,
    PIECE_CHOSEN_EVENT,
  ]);
  let found: string | null = null;
  for (const event of itemEvents) {
    if (!creating.has(event.eventType)) continue;
    const destination = (event.payload as { destinationAccount?: unknown } | null)?.destinationAccount;
    if (typeof destination === "string" && destination.length > 0) found = destination;
  }
  return found;
}

export async function loadItemOrError(
  ctx: CommandContext,
  itemId: string,
): Promise<Result<EquipeItem>> {
  const item = await ctx.repos.items.get(scopeOf(ctx), itemId);
  if (!item) return err("unknown_item", `unknown item ${itemId}`);
  return ok(item);
}

export function domainStateOf(item: EquipeItem, approvalReceipts: EquipeReceipt[]): Result<ItemState> {
  const status = toDomainItemStatus(item.status);
  if (!status || !item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no decidable state`);
  }
  const approvedVersion =
    approvalReceipts.find((r) => r.objectVersion === item.currentVersionHash)?.objectVersion ?? null;
  return ok({ status, currentVersion: item.currentVersionHash, approvedVersion });
}

export async function approvalReceiptFor(
  ctx: CommandContext,
  itemId: string,
  versionHash: string,
): Promise<EquipeReceipt | null> {
  const receipts = await ctx.repos.receipts.listByObject(scopeOf(ctx), "item", itemId);
  return (
    receipts.find(
      (receipt) =>
        receipt.objectVersion === versionHash &&
        (ITEM_APPROVAL_ACTIONS as readonly string[]).includes(receipt.action),
    ) ?? null
  );
}

/** Manual mode was agreed on this account → approvals download, never dispatch. */
export async function isManualMode(ctx: CommandContext): Promise<boolean> {
  const events = await ctx.repos.events.list(scopeOf(ctx), { eventType: MANUAL_MODE_AGREED_EVENT });
  return events.length > 0;
}

export function approvedByOf(ctx: CommandContext): string {
  return actorId(ctx.actor);
}

// Void the publication intent of a superseded/cancelled approval. A
// published intent is never voided; callers only reach this from
// scheduled/held, so in practice the intent is pending.
export async function voidIntentForVersion(
  ctx: CommandContext,
  itemId: string,
  versionHash: string,
): Promise<{ voided: boolean; intentId: string | null }> {
  const scope = scopeOf(ctx);
  const intent = await ctx.repos.intents.getByItemVersion(scope, itemId, versionHash);
  if (!intent) return { voided: false, intentId: null };
  if (intent.status === "published") return { voided: false, intentId: intent.id };
  if (intent.status === "canceled") return { voided: false, intentId: intent.id };
  await ctx.repos.intents.update(scope, intent.id, { status: "canceled" });
  return { voided: true, intentId: intent.id };
}
