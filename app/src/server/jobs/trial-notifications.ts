import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { subscriptions, user } from "@/server/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  getWorkspaceNotificationRecipients,
  sendTrialExpiringEmail,
} from "@/server/services/notifications";

export const trialNotificationJob = inngest.createFunction(
  { id: "trial-expiring-notification", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const expiringTrials = await step.run("find-expiring-trials", async () => {
      return db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, "trialing"),
            gte(subscriptions.currentPeriodEnd, twoDaysFromNow),
            lte(subscriptions.currentPeriodEnd, threeDaysFromNow)
          )
        );
    });

    logger.info(`[trialNotificationJob] found ${expiringTrials.length} trials expiring in ~3 days`);

    for (const sub of expiringTrials) {
      await step.run(`notify-trial-${sub.id}`, async () => {
        const endDate = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        const daysLeft = endDate
          ? Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : 0;

        try {
          const recipients = await getWorkspaceNotificationRecipients(sub.workspaceId);
          for (const recipient of recipients) {
            if (!recipient.trialExpiringNotifiedAt || recipient.trialExpiringNotifiedAt < twoDaysFromNow) {
              await sendTrialExpiringEmail({
                to: recipient.email,
                daysLeft,
                locale: recipient.locale,
              });
              await db
                .update(user)
                .set({ trialExpiringNotifiedAt: new Date() })
                .where(eq(user.id, recipient.userId));
            }
          }
        } catch (err) {
          logger.warn(`[trialNotificationJob] failed to notify for subscription=${sub.id}`, err);
        }
      });
    }

    return { processed: expiringTrials.length };
  }
);
