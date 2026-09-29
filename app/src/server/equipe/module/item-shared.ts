// Shared internals of the batch-approval commands (#545): the stored item
// status (identical to the domain ItemStatus), the version hash (output +
// caption + destination account + scheduled time), review-status resolution
// over versions + events, manual/auto mode, and publication-intent voiding.

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
import { equipeItemStatusSchema } from "../data";
import type {
  AccountScope,
  EquipeEvent,
  EquipeItem,
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

// The stored row status IS the domain machine status (same enum, same
// check constraint). This only validates the read: commands store
// `decided.value.state.status` directly, never a translation.
export function storedItemStatusOf(item: EquipeItem): ItemStatus | null {
  const parsed = equipeItemStatusSchema.safeParse(item.status);
  return parsed.success ? parsed.data : null;
}

export type ItemVersionContent = {
  output: string | null;
  caption: string;
  destination: string;
  destinationIgUserId?: string | null;
  scheduledFor: Date | string | null;
};

/** Hash of the canonical version content; approvals bind to the exact hash. */
export function itemVersionHash(content: ItemVersionContent): string {
  return versionHash({ ...content, destinationIgUserId: content.destinationIgUserId ?? null });
}

export function versionContentOf(
  version: Pick<EquipeItemVersion, "creativeWorkOutputId" | "caption" | "scheduledFor" | "destinationIgUserId">,
  destinationAccount: string,
): ItemVersionContent {
  return {
    output: version.creativeWorkOutputId,
    caption: version.caption,
    destination: destinationAccount,
    destinationIgUserId: version.destinationIgUserId,
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
  findings?: Array<{ severity: string; area: string; message: string; suggestion: string | null }>;
  summary?: string;
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
  if (Array.isArray(findings.findings)) out.findings = findings.findings as NonNullable<ItemVersionFindings["findings"]>;
  if (typeof findings.summary === "string") out.summary = findings.summary;
  return out;
}

export function versionFindings(version: EquipeItemVersion | null, events: EquipeEvent[]): ItemVersionFindings {
  const review = events.findLast((event) => event.eventType === "item.reviewed" &&
    (event.payload as { versionHash?: string } | null)?.versionHash === version?.versionHash);
  return { ...parseVersionFindings(version?.reviewerFindings), ...parseVersionFindings(review?.payload) };
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
// confirmation > ready). "Editado por você · em revisão" is a review flag
// here, not a stored lifecycle status: both adjustment requests and caption
// edits store `adjusting`, and the edit is told apart by its caption.edited
// event for the current version. An open escalation blocks via its
// escalation row (item_id link) when present; the escalation.requested event
// stays as the signal until #547 creates the rows.
export function resolveItemReview(input: {
  item: EquipeItem;
  currentVersion: EquipeItemVersion | null;
  itemEvents: EquipeEvent[];
  hasOpenEscalation?: boolean;
}): ItemReview {
  const { item, currentVersion, itemEvents, hasOpenEscalation = false } = input;
  const findings = versionFindings(currentVersion, itemEvents);
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
  const editedCurrent = itemEvents.some(
    (event) =>
      (event.eventType === CAPTION_EDITED_EVENT || event.eventType === "item.version_submitted" ||
          (event.eventType === "item.rescheduled" && (event.payload as { needsReview?: boolean } | null)?.needsReview === true)) &&
      (event.payload as { versionHash?: unknown } | null)?.versionHash === item.currentVersionHash,
  );
  const flags: ItemReviewFlags = {
    blocked:
      escalationOpen ||
      hasOpenEscalation ||
      findings.blocked === true ||
      triage?.path === "block_and_escalate" ||
      triage?.path === "update_catalog_only",
    editedInReview: editedCurrent && (!triage || triage.qualityRecheckPending),
    editWarning:
      ((triage?.warnings.length ?? 0) > 0 || (findings.warnings?.length ?? 0) > 0) &&
      triage?.path !== "block_and_escalate" &&
      triage?.path !== "update_catalog_only",
    needsConfirmation:
      !factConfirmed &&
      (triage?.path === "confirm_as_business_fact" || findings.needsConfirmation === true),
  };
  const status = resolveReviewStatus(flags);
  return { flags, status, batchApprovable: isBatchApprovable(status), triage };
}

/** An escalation row linked to the item blocks while not resolved/closed/merged. */
export async function hasOpenItemEscalation(
  repos: EquipeRepositories,
  scope: AccountScope,
  itemId: string,
): Promise<boolean> {
  const rows = await repos.escalations.list(scope, { itemId });
  return rows.some((row) => row.status !== "resolved" && row.status !== "closed" && row.status !== "merged");
}

export async function loadItemReview(
  repos: EquipeRepositories,
  scope: AccountScope,
  item: EquipeItem,
): Promise<ItemReview> {
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const currentVersion = item.currentVersionHash
    ? await repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash)
    : null;
  const itemEvents = await repos.events.list(scope, { objectType: "item", objectId: item.id });
  const hasOpenEscalation = await hasOpenItemEscalation(repos, scope, item.id);
  return resolveItemReview({ item, currentVersion, itemEvents, hasOpenEscalation });
}

// The destination account is part of the version hash and is stored on the
// item (set at delivery) and on every version row (set on INSERT).
// Version-creating commands hash the stored value — never the event log.
export function storedDestinationOf(
  item: EquipeItem,
  current: EquipeItemVersion | null,
): string | null {
  const destination = current?.destination ?? item.destination ?? null;
  return typeof destination === "string" && destination.length > 0 ? destination : null;
}

export async function loadItemOrError(
  ctx: CommandContext,
  itemId: string,
  forUpdate = false,
): Promise<Result<EquipeItem>> {
  const item = await ctx.repos.items.get(scopeOf(ctx), itemId, { forUpdate });
  if (!item) return err("unknown_item", `unknown item ${itemId}`);
  return ok(item);
}

export function domainStateOf(item: EquipeItem, approvalReceipts: EquipeReceipt[]): Result<ItemState> {
  const status = storedItemStatusOf(item);
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
