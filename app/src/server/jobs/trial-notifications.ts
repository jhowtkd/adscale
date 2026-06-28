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
  {
    id: "trial-expiring-notification",
    triggers: [{ cron: "0 9 * * *" }],
    retries: 3,
    onFailure: async ({ error }) => {
      logger.error("[trialNotificationJob] failed after retries", { error });
    },
  },
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

    const processed = await step.run("notify-trials", async () => {
      let notified = 0;
      for (const sub of expiringTrials) {
        const endDate = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        const daysLeft = endDate
          ? Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        const recipients = await getWorkspaceNotificationRecipients(sub.workspaceId);
        await Promise.all(
          recipients.map(async (recipient) => {
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
              notified += 1;
            }
          })
        );
      }
      return notified;
    });

    return { processed };
  }
);
