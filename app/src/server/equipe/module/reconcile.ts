// reconcile_publication (#548): the system lookup for uncertain sends. For
// an item in `verifying`, look up the account's recent media by container
// context + caption + recency: found → `published` with the external media
// id; not found within 1 h → a technical escalation for operations (the #547
// open path) and the item fails so a new time is proposed. For a manual
// `published_declared` item, the same lookup confirms the client's "publiquei"
// (`published_confirmed`) when a read connection exists; absence just means
// "not visible yet" — never an escalation. A failed lookup itself changes
// nothing; the next run tries again.

import { z } from "zod";
import {
  confirmManualPublished,
  confirmPublished,
  err,
  markDispatchFailed,
  ok,
  type Result,
} from "../domain";
import type { EquipeEvent, EquipeItem, EquipePublicationIntent } from "../data";
import type { EquipeModuleDeps, Publisher, RecentMedia } from "./ports";
import { reconcilePublicationPayloadSchema } from "./envelope";
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
import { ITEM_PUBLISHED_EVENT, ITEM_UNCERTAIN_EVENT } from "./dispatch";
import {
  MANUAL_PUBLISH_CONFIRMED_EVENT,
  MANUAL_PUBLISH_DECLARED_EVENT,
} from "./manual-publishing";
import { createEscalationInternal } from "./escalations-shared";

export type ReconcilePublicationPayload = z.infer<typeof reconcilePublicationPayloadSchema>;

/** Unresolved verifying past this age escalates to operations. */
export const RECONCILE_ESCALATION_AFTER_MS = 60 * 60 * 1000;
/** Clock skew tolerated when matching media timestamps. */
const MATCH_SKEW_MS = 5 * 60 * 1000;
/** Manual posts may predate the declaration by up to a day. */
const MANUAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type LookupPlan =
  | {
      kind: "auto";
      item: EquipeItem;
      intent: EquipePublicationIntent;
      caption: string;
      containerId: string | null;
      since: Date;
      uncertainAt: Date;
    }
  | {
      kind: "manual";
      item: EquipeItem;
      caption: string;
      since: Date;
    }
  | { kind: "none"; reason: string };

async function latestEventAt(
  ctx: CommandContext,
  itemId: string,
  eventType: string,
): Promise<Date | null> {
  const events = await ctx.repos.events.list(scopeOf(ctx), {
    objectType: "item",
    objectId: itemId,
  });
  let latest: Date | null = null;
  for (const event of events) {
    if (event.eventType !== eventType) continue;
    if (!latest || event.occurredAt > latest) latest = event.occurredAt;
  }
  return latest;
}

function providerOf(destination: string | null): string | null {
  if (!destination) return null;
  const provider = destination.split(":")[0];
  return provider ? provider : null;
}

async function hasReadConnection(ctx: CommandContext, item: EquipeItem): Promise<boolean> {
  const scope = scopeOf(ctx);
  const version = item.currentVersionHash
    ? await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash)
    : null;
  const destination = version?.destination ?? item.destination ?? null;
  const provider = providerOf(typeof destination === "string" ? destination : null);
  if (!provider) return false;
  const connections = await ctx.repos.connections.list(scope);
  return connections.some((row) => row.provider === provider && row.status === "active");
}

async function planLookup(
  ctx: CommandContext,
  itemId: string,
): Promise<Result<{ plan: LookupPlan; events: EquipeEvent[] }>> {
  const scope = scopeOf(ctx);
  const item = await ctx.repos.items.get(scope, itemId);
  if (!item) return err("unknown_item", `unknown item ${itemId}`);
  if (item.status !== "verifying" && item.status !== "published_declared") {
    return ok({ plan: { kind: "none", reason: item.status }, events: ctx.events });
  }
  if (!item.currentVersionHash) {
    return err("invalid_transition", `item ${item.id} has no current version`);
  }
  const version = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
  if (!version) return err("unknown_version", `item ${item.id} has no current version row`);
  if (item.status === "published_declared") {
    if (!(await hasReadConnection(ctx, item))) {
      return ok({ plan: { kind: "none", reason: "no_read_connection" }, events: ctx.events });
    }
    const declaredAt =
      (await latestEventAt(ctx, item.id, MANUAL_PUBLISH_DECLARED_EVENT)) ?? item.updatedAt;
    return ok({
      plan: {
        kind: "manual",
        item,
        caption: version.caption,
        since: new Date(declaredAt.getTime() - MANUAL_LOOKBACK_MS),
      },
      events: ctx.events,
    });
  }
  const intent = await ctx.repos.intents.getByItemVersion(scope, item.id, item.currentVersionHash);
  if (!intent) return err("unknown_intent", `item ${item.id} is verifying without an intent`);
  const uncertainAt = (await latestEventAt(ctx, item.id, ITEM_UNCERTAIN_EVENT)) ?? intent.updatedAt;
  return ok({
    plan: {
      kind: "auto",
      item,
      intent,
      caption: version.caption,
      containerId: intent.containerId,
      since: new Date(uncertainAt.getTime() - MATCH_SKEW_MS),
      uncertainAt,
    },
    events: ctx.events,
  });
}

/**
 * Match by exact caption + recency. Published media objects do not carry
 * the creation container id, so the stored container only scopes the
 * lookup (and the audit trail) — the caption + timestamp prove the post.
 */
export function matchRecentMedia(
  rows: RecentMedia[],
  input: { caption: string; since: Date },
): RecentMedia | null {
  for (const row of rows) {
    if (row.caption !== input.caption) continue;
    if (!row.takenAt || row.takenAt < input.since) continue;
    return row;
  }
  return null;
}

/**
 * Reconcile one item: look the media up and apply the outcome. Lookup
 * failures (auth, network) change nothing — the item stays `verifying`
 * (or declared) until a later run or the 1 h escalation on empty lookups.
 */
export async function runReconcilePublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReconcilePublicationPayload,
): Promise<Result<CommandSuccess>> {
  const publisher: Publisher | undefined = deps.publisher;
  if (!publisher) {
    return err("publisher_missing", "reconcile needs a publisher");
  }
  const planned = await transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const planned = await planLookup(ctx, payload.itemId);
    if (!planned.ok) return planned;
    if (planned.value.plan.kind === "none") {
      return ok({ reconciled: false, reason: planned.value.plan.reason });
    }
    const plan = planned.value.plan;
    return ok({
      lookup: true,
      kind: plan.kind,
      itemId: plan.item.id,
      caption: plan.caption,
      containerId: plan.kind === "auto" ? plan.containerId : null,
      since: plan.since.toISOString(),
      uncertainAt: plan.kind === "auto" ? plan.uncertainAt.toISOString() : null,
    });
  });
  if (!planned.ok) return planned;
  const data = planned.value.data as Record<string, unknown>;
  if (!data.lookup) {
    return planned;
  }
  const itemId = data.itemId as string;
  let rows: RecentMedia[];
  try {
    rows = await publisher.findRecentMedia({
      workspaceId: base.workspaceId,
      accountId: base.accountId,
      containerId: (data.containerId as string | null) ?? undefined,
      caption: data.caption as string,
      since: new Date(data.since as string),
    });
  } catch {
    return ok({
      accountId: planned.value.accountId,
      events: planned.value.events,
      data: { reconciled: false, reason: "lookup_failed", itemId },
    });
  }
  const match = matchRecentMedia(rows, {
    caption: data.caption as string,
    since: new Date(data.since as string),
  });
  const applied = await transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const item = await ctx.repos.items.get(scope, itemId);
    if (!item) return err("unknown_item", `unknown item ${itemId}`);
    if (data.kind === "manual") {
      if (item.status !== "published_declared") {
        return ok({ reconciled: false, reason: item.status, itemId });
      }
      if (!match || !item.currentVersionHash) {
        return ok({ reconciled: false, reason: "not_found_yet", itemId });
      }
      const decided = confirmManualPublished({
        status: "published_declared",
        currentVersion: item.currentVersionHash,
        approvedVersion: null,
      });
      if (!decided.ok) return decided;
      await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
      await appendEvent(ctx, {
        eventType: MANUAL_PUBLISH_CONFIRMED_EVENT,
        objectType: "item",
        objectId: item.id,
        payload: { externalId: match.externalId, permalink: match.permalink },
      });
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "manual.confirmed",
        detail: { itemId: item.id, externalId: match.externalId },
      });
      return ok({ reconciled: true, externalId: match.externalId, itemId });
    }
    // Automatic send in verifying.
    if (item.status !== "verifying" || !item.currentVersionHash) {
      return ok({ reconciled: false, reason: item.status, itemId });
    }
    const intent = await ctx.repos.intents.getByItemVersion(scope, item.id, item.currentVersionHash);
    if (!intent) return err("unknown_intent", `item ${item.id} is verifying without an intent`);
    if (match) {
      const decided = confirmPublished(
        { status: "verifying", currentVersion: item.currentVersionHash, approvedVersion: null },
        match.externalId,
      );
      if (!decided.ok) return decided;
      await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
      await ctx.repos.intents.update(scope, intent.id, {
        status: "published",
        externalId: match.externalId,
        publishedAt: ctx.now,
      });
      const receipt = await writeReceipt(ctx, {
        objectType: "item",
        objectId: item.id,
        objectVersion: item.currentVersionHash,
        action: "dispatch_publication",
        detail: {
          externalId: match.externalId,
          containerId: intent.containerId,
          permalink: match.permalink,
          via: "reconcile",
        },
      });
      await appendEvent(ctx, {
        eventType: ITEM_PUBLISHED_EVENT,
        objectType: "item",
        objectId: item.id,
        payload: {
          externalId: match.externalId,
          containerId: intent.containerId,
          permalink: match.permalink,
          receiptId: receipt.id,
          via: "reconcile",
        },
      });
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "item.published",
        detail: { itemId: item.id, externalId: match.externalId },
      });
      return ok({ reconciled: true, externalId: match.externalId, itemId });
    }
    const uncertainAt = new Date(data.uncertainAt as string);
    if (ctx.now.getTime() - uncertainAt.getTime() < RECONCILE_ESCALATION_AFTER_MS) {
      await ctx.repos.intents.update(scope, intent.id, {
        nextAttemptAt: new Date(ctx.now.getTime() + 10 * 60 * 1000),
      });
      return ok({ reconciled: false, reason: "still_verifying", itemId });
    }
    // Not found within 1 h: technical escalation for operations, and the
    // item fails so the strategist proposes a new time for it.
    const escalation = await createEscalationInternal(ctx, {
      kind: "technical",
      severity: "normal",
      itemId: item.id,
      reason:
        `publicação não confirmada no Instagram em 1 h ` +
        `(container ${intent.containerId ?? "desconhecido"})`,
      origin: "auto",
    });
    if (!escalation.ok) return escalation;
    const failed = markDispatchFailed(
      { status: "verifying", currentVersion: item.currentVersionHash, approvedVersion: null },
      "reconcile_not_found",
    );
    if (!failed.ok) return failed;
    await ctx.repos.items.update(scope, item.id, { status: failed.value.state.status });
    await ctx.repos.intents.update(scope, intent.id, {
      status: "failed",
      lastError: "publicação não encontrada no Instagram em 1 h",
    });
    return ok({
      reconciled: false,
      reason: "escalated",
      escalationId: escalation.value.escalation.id,
      itemId,
    });
  });
  if (!applied.ok) return applied;
  return ok({
    accountId: applied.value.accountId,
    events: [...planned.value.events, ...applied.value.events],
    data: applied.value.data,
  });
}
