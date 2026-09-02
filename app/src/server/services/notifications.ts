import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, workspaceMembers } from "@/server/db/schema";
import { sendEmail } from "@/server/services/email";
import { getTransactionalEmailTranslations } from "@/server/services/email-i18n";
import {
  paragraphsToHtml,
  renderTransactionalEmail,
} from "@/server/services/email-template";
import { getTranslations } from "next-intl/server";
import { env } from "@/server/validation/env";

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

async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  title: string;
  body: string;
  locale?: string;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);

  await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.body,
    html: renderTransactionalEmail({
      preview: input.subject,
      title: input.title,
      bodyHtml: paragraphsToHtml([input.body]),
      cta: { label: t("openApp"), url: env.APP_URL },
      signoff: {
        close: t("signoffClose"),
        name: t("signoffName"),
        role: t("signoffRole"),
      },
      footerFallback: t("footerFallback"),
      footerIgnore: t("footerIgnore"),
      footerSignature: t("footerSignature"),
    }),
  });
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
  const body = t("derivationCompleteBody", { campaignName, derivationCount });

  await sendNotificationEmail({ to, subject, title: subject, body, locale });
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
  const body = t("planReadyBody", { campaignName });

  await sendNotificationEmail({ to, subject, title: subject, body, locale });
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
  const body = t("lowCreditsBody", { creditBalance });

  await sendNotificationEmail({ to, subject, title: subject, body, locale });
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
  const body = t("trialExpiringBody", { daysLeft });

  await sendNotificationEmail({ to, subject, title: subject, body, locale });
}
