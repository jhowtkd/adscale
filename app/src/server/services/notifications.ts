import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, workspaceMembers } from "@/server/db/schema";
import { sendEmail } from "@/server/services/email";
import { getTranslations } from "next-intl/server";

export async function shouldSendToUser(userId: string) {
  const result = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const u = result[0];
  if (!u) return { send: false, email: null };
  return {
    send: u.emailVerified,
    email: u.email,
  };
}

export async function getUserLocale(userId: string): Promise<string> {
  const result = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return result[0]?.locale ?? "pt-BR";
}

export async function getWorkspaceNotificationRecipients(workspaceId: string) {
  const members = await db
    .select({
      userId: workspaceMembers.userId,
      email: user.email,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
      emailVerified: user.emailVerified,
      locale: user.locale,
      lowCreditsNotifiedAt: user.lowCreditsNotifiedAt,
      trialExpiringNotifiedAt: user.trialExpiringNotifiedAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return members.filter((m) => m.emailNotificationsEnabled && m.emailVerified);
}

async function getNotificationTranslations(locale: string) {
  return getTranslations({ locale, namespace: "notifications" });
}

export async function sendDerivationCompleteEmail({
  to,
  campaignName,
  derivationCount,
  locale = "pt-BR",
}: {
  to: string;
  campaignName: string;
  derivationCount: number;
  locale?: string;
}) {
  const t = await getNotificationTranslations(locale);
  const subject = t("derivationCompleteSubject");
  const text = t("derivationCompleteBody", { campaignName, derivationCount });

  await sendEmail({
    to,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  });
}

export async function sendPlanReadyEmail({
  to,
  campaignName,
  locale = "pt-BR",
}: {
  to: string;
  campaignName: string;
  locale?: string;
}) {
  const t = await getNotificationTranslations(locale);
  const subject = t("planReadySubject");
  const text = t("planReadyBody", { campaignName });

  await sendEmail({
    to,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  });
}

export async function sendLowCreditsEmail({
  to,
  creditBalance,
  locale = "pt-BR",
}: {
  to: string;
  creditBalance: number;
  locale?: string;
}) {
  const t = await getNotificationTranslations(locale);
  const subject = t("lowCreditsSubject");
  const text = t("lowCreditsBody", { creditBalance });

  await sendEmail({
    to,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  });
}

export async function sendTrialExpiringEmail({
  to,
  daysLeft,
  locale = "pt-BR",
}: {
  to: string;
  daysLeft: number;
  locale?: string;
}) {
  const t = await getNotificationTranslations(locale);
  const subject = t("trialExpiringSubject");
  const text = t("trialExpiringBody", { daysLeft });

  await sendEmail({
    to,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  });
}
