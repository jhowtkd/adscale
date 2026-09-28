// Notification channel delivery (#549): one outbox entry to in-app rows
// plus email, honoring the existing preferences (verified + opted in).
//
// Delivery is at-least-once but idempotent per event: the delivery record
// (migration 0123) tells re-runs which channels already went out. A
// channel failure records the channels that did complete and rethrows, so
// the retry only delivers what is missing — never a silent loss, never a
// duplicate send of a completed channel.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { createNotification } from "@/server/repositories/notification";
import { sendEmail } from "@/server/services/email";
import { escapeHtml } from "@/server/services/email-template";
import type { AccountScope } from "../data";
import type { OutboxEntry } from "../module/jobs-delivery";
import { notificationTypeFor, templateFor } from "./notification-templates";
import {
  EQUIPE_NOTIFICATIONS_ID,
  resolveNotificationRecipients,
  type NotificationRecipient,
  type NotificationRecipientStores,
} from "./notification-recipients";

export type NotificationUser = {
  email: string;
  emailVerified: boolean;
  emailNotificationsEnabled: boolean;
};

export type NotificationDeliveryAdapters = {
  users: {
    get(userId: string): Promise<NotificationUser | null>;
  };
  inbox: {
    insert(input: {
      userId: string;
      workspaceId: string;
      type: string;
      title: string;
      message: string;
    }): Promise<void>;
  };
  mailer: {
    send(input: { to: string; subject: string; title: string; body: string }): Promise<void>;
  };
};

function equipeEmailHtml(title: string, body: string): string {
  return (
    `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">` +
    `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>` +
    `<p style="font-size:15px;line-height:1.5;margin:0;">${escapeHtml(body)}</p>` +
    `</div>`
  );
}

export function createProdDeliveryAdapters(): NotificationDeliveryAdapters {
  return {
    users: {
      async get(userId) {
        const rows = await db
          .select({
            email: user.email,
            emailVerified: user.emailVerified,
            emailNotificationsEnabled: user.emailNotificationsEnabled,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        return rows[0] ?? null;
      },
    },
    inbox: {
      async insert(input) {
        await createNotification({
          userId: input.userId,
          workspaceId: input.workspaceId,
          type: input.type,
          title: input.title,
          message: input.message,
        });
      },
    },
    mailer: {
      async send(input) {
        await sendEmail({
          to: input.to,
          subject: input.subject,
          text: input.body,
          html: equipeEmailHtml(input.title, input.body),
        });
      },
    },
  };
}

const requestedPayloadSchema = z.object({
  recipientRole: z.string().min(1),
  templateKey: z.string().min(1),
});

export type DeliverOutboxEntryInput = {
  stores: NotificationRecipientStores;
  adapters: NotificationDeliveryAdapters;
  scope: AccountScope;
  entry: OutboxEntry;
  /** Persist channels through the module command (never inline SQL). */
  record: (eventId: string, channels: string[]) => Promise<void>;
};

export type DeliverOutboxEntryResult = {
  eventId: string;
  channels: string[];
  delivered: boolean;
};

/**
 * Deliver one outbox entry: resolve recipients, send the missing channels,
 * record what went out. A channel failure records the channels that did
 * complete and rethrows, so the retry only delivers what is missing —
 * at-least-once per channel, never a silent loss.
 */
export async function deliverOutboxEntry(
  input: DeliverOutboxEntryInput,
): Promise<DeliverOutboxEntryResult> {
  const { stores, adapters, scope, entry } = input;
  const eventId = entry.event.id;
  const parsed = requestedPayloadSchema.safeParse(entry.event.payload);
  if (!parsed.success) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] malformed notification payload, skipping`, {
      eventId,
    });
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const { recipientRole, templateKey } = parsed.data;
  const { template, known } = templateFor(templateKey);
  if (!known) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] unknown template, using fallback`, {
      eventId,
      templateKey,
    });
  }
  const resolved = await resolveNotificationRecipients(stores, scope, recipientRole, {
    users: adapters.users,
  });
  if ("internal" in resolved) {
    const channels = [...new Set([...entry.deliveredChannels, "internal"])];
    await input.record(eventId, channels);
    return { eventId, channels, delivered: false };
  }
  if ("unknown" in resolved) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] unknown recipient role, skipping`, {
      eventId,
      recipientRole,
    });
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const userIds = [...new Set(resolved.map((r) => r.userId).filter((id): id is string => !!id))];
  const emails = await deliverableEmails(adapters, resolved);
  if (userIds.length === 0 && emails.length === 0) {
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const completed = [...entry.deliveredChannels];
  const missingInapp = userIds.length > 0 && !completed.includes("inapp");
  const missingEmail = emails.length > 0 && !completed.includes("email");
  if (!missingInapp && !missingEmail) {
    return { eventId, channels: completed, delivered: false };
  }
  const type = notificationTypeFor(templateKey);
  try {
    if (missingInapp) {
      for (const userId of userIds) {
        await adapters.inbox.insert({
          userId,
          workspaceId: scope.workspaceId,
          type,
          title: template.title,
          message: template.message,
        });
      }
      completed.push("inapp");
    }
    if (missingEmail) {
      for (const to of emails) {
        await adapters.mailer.send({
          to,
          subject: template.title,
          title: template.title,
          body: template.message,
        });
      }
      completed.push("email");
    }
  } catch (error) {
    // Partial progress is still recorded: the retry only delivers what is
    // missing instead of duplicating what went out.
    if (completed.length > entry.deliveredChannels.length) {
      await input.record(eventId, completed);
    }
    throw error;
  }
  await input.record(eventId, completed);
  return { eventId, channels: completed, delivered: true };
}

/**
 * Emails that may actually receive this notification: user-linked contacts
 * honor the existing preferences (verified + opted in); bare client
 * contact emails have no preference row and always receive.
 */
async function deliverableEmails(
  adapters: NotificationDeliveryAdapters,
  recipients: NotificationRecipient[],
): Promise<string[]> {
  const emails = new Set<string>();
  for (const recipient of recipients) {
    if (recipient.userId) {
      const account = await adapters.users.get(recipient.userId);
      if (account && account.emailVerified && account.emailNotificationsEnabled) {
        emails.add(account.email);
      } else if (!account && recipient.email) {
        emails.add(recipient.email);
      }
      continue;
    }
    if (recipient.email) emails.add(recipient.email);
  }
  return [...emails];
}
