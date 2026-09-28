// Notification outbox, module side (#549): the read of pending
// `notification.requested` events and the system command recording each
// delivery. Delivery itself (in-app row + email) runs in the jobs layer
// AFTER the requesting command committed, so a send failure never undoes
// the command; the record makes re-runs skip delivered events.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type {
  AccountScope,
  EquipeEvent,
  EquipeRepositories,
} from "../data";
import type { EquipeModuleDeps } from "./ports";
import { recordNotificationDeliveredPayloadSchema } from "./envelope";
import {
  loadAccountOrError,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type RecordNotificationDeliveredPayload = z.infer<
  typeof recordNotificationDeliveredPayloadSchema
>;

export const NOTIFICATION_REQUESTED_EVENT = "notification.requested";

export type OutboxEntry = {
  event: EquipeEvent;
  /** Channels already delivered for this event (possibly none). */
  deliveredChannels: string[];
};

/**
 * Every `notification.requested` event of the account with its recorded
 * channels, oldest first. Plain read — the jobs layer resolves recipients
 * and delivers what the record does not cover yet.
 */
export async function listNotificationOutbox(
  repos: EquipeRepositories,
  scope: AccountScope,
): Promise<OutboxEntry[]> {
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const events = await repos.events.list(scope, { eventType: NOTIFICATION_REQUESTED_EVENT });
  const deliveries = await repos.deliveries.list(scope);
  const byEvent = new Map(deliveries.map((row) => [row.eventId, row.channels as string[]]));
  return events
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((event) => ({ event, deliveredChannels: byEvent.get(event.id) ?? [] }));
}

/**
 * Record channels delivered for one `notification.requested` event.
 * Idempotent per event: channels union with any previous record, so a
 * retried run only delivers what is still missing.
 */
export async function runRecordNotificationDelivered(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RecordNotificationDeliveredPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const event = await ctx.repos.events.get(scopeOf(ctx), payload.eventId);
    if (!event) {
      return err("unknown_event", `unknown event ${payload.eventId}`);
    }
    if (event.eventType !== NOTIFICATION_REQUESTED_EVENT) {
      return err("not_a_notification", `event ${payload.eventId} is ${event.eventType}`);
    }
    const recorded = await ctx.repos.deliveries.record(scopeOf(ctx), {
      eventId: event.id,
      channels: [...new Set(payload.channels)],
      deliveredAt: ctx.now,
    });
    return ok({ eventId: event.id, channels: recorded.channels });
  });
}
