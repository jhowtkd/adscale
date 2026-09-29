// Uncertain sends never become retryable. Confirmation requires provider ids
// plus the pinned destination; caption/time coincidences are not receipts.
import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps, RecentMedia } from "./ports";
import { reconcilePublicationPayloadSchema } from "./envelope";
import {
  appendEvent, loadAccountOrError, requestNotification, scopeOf, transact,
  type CommandSuccess, type TxBase,
} from "./shared";
import { ITEM_UNCERTAIN_EVENT, writePublishedOutcome } from "./dispatch-outcomes";
import { createEscalationInternal } from "./escalations-shared";

export type ReconcilePublicationPayload = z.infer<typeof reconcilePublicationPayloadSchema>;
export const RECONCILE_ESCALATION_AFTER_MS = 60 * 60 * 1000;
export const RECONCILE_ESCALATED_EVENT = "item.reconcile_escalated";

/** Never infer a container association from a listing, caption or timestamp. */
export function matchRecentMedia(
  rows: RecentMedia[],
  input: { destinationIgUserId: string | null; externalId?: string | null; containerId?: string | null },
): RecentMedia | null {
  if (!input.destinationIgUserId) return null;
  const matches = rows.filter((row) => row.igUserId === input.destinationIgUserId && (
    input.externalId ? row.externalId === input.externalId :
      Boolean(input.containerId && row.containerId === input.containerId)
  ));
  return matches.length === 1 ? matches[0]! : null;
}

export async function runReconcilePublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReconcilePublicationPayload,
): Promise<Result<CommandSuccess>> {
  const publisher = deps.publisher;
  if (!publisher) return err("publisher_missing", "reconcile needs a publisher");
  const planned = await transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const item = await ctx.repos.items.get(scope, payload.itemId, { forUpdate: true });
    if (!item) return err("unknown_item", `unknown item ${payload.itemId}`);
    if (item.status === "published_declared") {
      // Manual declarations have no provider acknowledgement from our send.
      // Keep the declaration honest and request human verification once.
      const eventType = "item.manual_verification_required";
      const prior = await ctx.repos.events.list(scope, { eventType, objectId: item.id });
      if (!prior.length) {
        await appendEvent(ctx, { eventType, objectType: "item", objectId: item.id });
        await requestNotification(ctx, {
          recipientRole: "operations", templateKey: "manual.declared",
          detail: { itemId: item.id, reason: "publication_proof_missing" },
        });
      }
      return ok({ reconciled: false, reason: "human_verification_required", itemId: item.id });
    }
    if (item.status !== "verifying") return ok({ reconciled: false, reason: item.status });
    if (!item.currentVersionHash) return err("unknown_version", "item sem versão");
    const version = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
    const intent = await ctx.repos.intents.getByItemVersion(scope, item.id, item.currentVersionHash);
    if (!version || !intent) return err("unknown_intent", "item verificando sem versão/intenção");
    const events = await ctx.repos.events.list(scope, { eventType: ITEM_UNCERTAIN_EVENT, objectId: item.id });
    // updatedAt moves on every failed lookup. Even legacy rows without the
    // uncertainty event need a fixed origin so the 1 h deadline cannot slide.
    const uncertainAt = events.at(-1)?.occurredAt ?? intent.createdAt;
    return ok({
      lookup: true, itemId: item.id, intentId: intent.id, versionHash: version.versionHash,
      caption: version.caption, containerId: intent.containerId, externalId: intent.externalId,
      destinationIgUserId: version.destinationIgUserId === intent.destinationIgUserId ? intent.destinationIgUserId : null,
      uncertainAt: uncertainAt.toISOString(),
    });
  });
  if (!planned.ok || !planned.value.data.lookup) return planned;
  const data = planned.value.data as {
    itemId: string; intentId: string; versionHash: string; caption: string;
    containerId: string | null; externalId: string | null; destinationIgUserId: string | null;
    uncertainAt: string;
  };
  let rows: RecentMedia[] = [];
  let cause = "publication_proof_missing";
  try {
    rows = await publisher.findRecentMedia({
      workspaceId: base.workspaceId, accountId: base.accountId,
      containerId: data.containerId, externalId: data.externalId,
      destinationIgUserId: data.destinationIgUserId, caption: data.caption,
    });
  } catch {
    // Record a bounded cause, never a provider error containing credentials.
    cause = "lookup_failed";
  }
  const match = matchRecentMedia(rows, data);
  const applied = await transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    // Serializes receipt/escalation creation even if two jobs looked up together.
    // Same lock order as dispatch and client decisions: item, then intent.
    const item = await ctx.repos.items.get(scope, data.itemId, { forUpdate: true });
    const intent = await ctx.repos.intents.getForUpdate(scope, data.intentId);
    if (!intent || !item) return err("unknown_intent", "item/intenção ausente");
    if (item.status !== "verifying" || intent.status !== "verifying" ||
        item.currentVersionHash !== data.versionHash) {
      return ok({ reconciled: false, reason: item.status, itemId: item.id });
    }
    if (match) {
      const written = await writePublishedOutcome(ctx, item, intent, {
        externalId: match.externalId, permalink: match.permalink ?? undefined,
        containerId: intent.containerId, versionHash: data.versionHash, via: "reconcile",
      });
      if (!written.ok) return written;
      return ok({ reconciled: true, externalId: match.externalId, itemId: item.id });
    }
    await ctx.repos.intents.update(scope, intent.id, {
      lastError: cause,
      nextAttemptAt: new Date(ctx.now.getTime() + 10 * 60 * 1000),
    });
    await appendEvent(ctx, {
      eventType: "item.reconcile_unresolved", objectType: "item", objectId: item.id,
      payload: { intentId: intent.id, cause, containerId: intent.containerId },
    });
    if (ctx.now.getTime() - new Date(data.uncertainAt).getTime() < RECONCILE_ESCALATION_AFTER_MS) {
      return ok({ reconciled: false, reason: cause === "lookup_failed" ? cause : "still_verifying", itemId: item.id });
    }
    const previous = await ctx.repos.events.list(scope, {
      eventType: RECONCILE_ESCALATED_EVENT, objectId: intent.id,
    });
    let escalationId = (previous[0]?.payload as { escalationId?: string } | undefined)?.escalationId;
    if (!escalationId) {
      const escalation = await createEscalationInternal(ctx, {
        kind: "technical", severity: "normal", itemId: item.id, origin: "auto",
        reason: `Publicação incerta há 1 h (${cause}; container ${intent.containerId ?? "desconhecido"}). Conferir manualmente no perfil aprovado; não reenviar.`,
      });
      if (!escalation.ok) return escalation;
      escalationId = escalation.value.escalation.id;
      await appendEvent(ctx, {
        eventType: RECONCILE_ESCALATED_EVENT, objectType: "publication_intent", objectId: intent.id,
        payload: { escalationId, itemId: item.id, cause },
      });
    }
    return ok({ reconciled: false, reason: "escalated", cause, escalationId, itemId: item.id });
  });
  if (!applied.ok) return applied;
  return ok({
    accountId: applied.value.accountId,
    events: [...planned.value.events, ...applied.value.events], data: applied.value.data,
  });
}
