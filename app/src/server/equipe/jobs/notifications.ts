// Notification outbox delivery (#549): the `equipe-notifications` job.
//
// Commands record `notification.requested` events in their own transaction;
// this job delivers them AFTER commit, so a send failure never undoes the
// command. Delivery is at-least-once but idempotent per event: the
// delivery record (migration 0123) tells re-runs which channels already
// went out.
//
// Channels per event:
// - client/staff recipients → in-app row in `notifications` (new `eq_*`
//   types) + email via Resend, honoring `emailNotificationsEnabled` and
//   `emailVerified`;
// - `strategist` → `internal` no-op (the agent loop reads the events
//   directly; nothing to send);
// - unknown role, malformed payload or zero reachable recipients → recorded
//   `skipped`, never retried forever.
//
// Split: notification-templates (copy catalog), notification-recipients
// (role resolution), notification-delivery (channel senders). This module
// keeps the job wiring and re-exports their public surface.

import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import { listNotificationOutbox } from "../module/jobs-delivery";
import {
  createProdJobDeps,
  listEnabledAccounts,
  moduleDepsFor,
  systemJobActor,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";
import {
  createProdDeliveryAdapters,
  deliverOutboxEntry,
  type NotificationDeliveryAdapters,
} from "./notification-delivery";
import { EQUIPE_NOTIFICATIONS_ID } from "./notification-recipients";

export const EQUIPE_NOTIFICATIONS_CRON = "*/5 * * * *";

export {
  EQUIPE_NOTIFICATION_TYPE_MAX,
  EQUIPE_NOTIFICATION_TYPE_PREFIX,
  knownTemplateKeys,
  notificationTypeFor,
} from "./notification-templates";
export {
  EQUIPE_NOTIFICATIONS_ID,
  resolveNotificationRecipients,
  type FounderResolution,
  type NotificationRecipient,
  type NotificationRecipientStores,
} from "./notification-recipients";
export {
  createProdDeliveryAdapters,
  deliverOutboxEntry,
  type DeliverOutboxEntryInput,
  type DeliverOutboxEntryResult,
  type NotificationDeliveryAdapters,
  type NotificationUser,
} from "./notification-delivery";

export type EquipeNotificationsResult = {
  accounts: number;
  delivered: string[];
  failed: Array<{ eventId: string; code: string; message: string }>;
};

export type NotificationsJobDeps = EquipeJobDeps & {
  delivery: NotificationDeliveryAdapters;
};

export function createNotificationsHandler(deps: NotificationsJobDeps) {
  return async function equipeNotificationsHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeNotificationsResult> {
    const accounts = await step.run("list-enabled-accounts", async () => {
      const paid = await listEnabledAccounts(deps);
      const free = await deps.uow.internal.listFreeAccountsWithPendingNotifications();
      return [...paid, ...free.filter((account) => deps.isEnabledForWorkspace(account.workspaceId))
        .map((account) => ({ workspaceId: account.workspaceId, accountId: account.id, status: account.status }))];
    });
    const delivered: string[] = [];
    const failed: Array<{ eventId: string; code: string; message: string }> = [];
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const outbox = await listNotificationOutbox(deps.uow.repos, scope);
      for (const entry of outbox) {
        try {
          const outcome = await step.run(`deliver-${entry.event.id}`, () =>
            deliverOutboxEntry({
              stores: { repos: deps.uow.repos, internal: deps.uow.internal },
              adapters: deps.delivery,
              scope,
              entry,
              markCompleted: account.status === "free",
              record: async (eventId, channels) => {
                const recorded = await executeCommand(
                  moduleDepsFor(deps, account.workspaceId),
                  { actor: systemJobActor(EQUIPE_NOTIFICATIONS_ID), ...scope },
                  { type: "record_notification_delivered", payload: { eventId, channels } },
                );
                if (!recorded.ok) {
                  throw new Error(`record failed: ${recorded.error.code} ${recorded.error.message}`);
                }
              },
            }),
          );
          if (outcome.delivered) delivered.push(entry.event.id);
        } catch (error) {
          logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] delivery failed`, {
            ...scope,
            eventId: entry.event.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          failed.push({
            eventId: entry.event.id,
            code: "threw",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }
    return { accounts: accounts.length, delivered, failed };
  };
}

export function buildEquipeNotificationsJob(client: typeof inngest, deps: NotificationsJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_NOTIFICATIONS_ID,
      triggers: [{ cron: EQUIPE_NOTIFICATIONS_CRON }],
      // Delivery records make redelivery a no-op per event, so overlapping
      // runs only repeat quiet skips.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createNotificationsHandler(deps),
  );
}

export function createProdNotificationsDeps(): NotificationsJobDeps {
  return { ...createProdJobDeps(), delivery: createProdDeliveryAdapters() };
}

export const equipeNotificationsJob = buildEquipeNotificationsJob(inngest, createProdNotificationsDeps());
