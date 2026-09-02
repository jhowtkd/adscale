import { env } from "@/server/validation/env";
import { TRIAL_CREDIT_GRANT } from "@/lib/billing/credit-units";
import { getTransactionalEmailTranslations } from "./email-i18n";
import {
  escapeHtml,
  firstNameFromDisplayName,
  paragraphsToHtml,
  renderTransactionalEmail,
  stepsToHtml,
  type EmailSignoff,
} from "./email-template";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput) {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("re_test")) {
    console.warn("[email] Skipping email send — no RESEND_API_KEY configured:", input.to, input.subject);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}

function signoffFrom(t: (key: string) => string): EmailSignoff {
  return {
    close: t("signoffClose"),
    name: t("signoffName"),
    role: t("signoffRole"),
  };
}

async function sendActionEmail(input: {
  to: string;
  url: string;
  locale?: string | null;
  copy: {
    subject: string;
    preview: string;
    title: string;
    body: string;
    cta: string;
    text: string;
  };
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);

  await sendEmail({
    to: input.to,
    subject: input.copy.subject,
    text: input.copy.text,
    html: renderTransactionalEmail({
      preview: input.copy.preview,
      title: input.copy.title,
      bodyHtml: paragraphsToHtml([input.copy.body]),
      cta: { label: input.copy.cta, url: input.url },
      signoff: signoffFrom(t),
      footerFallback: t("footerFallback"),
      footerIgnore: t("footerIgnore"),
      footerSignature: t("footerSignature"),
    }),
  });
}

export async function sendVerificationEmail(input: {
  to: string;
  url: string;
  locale?: string | null;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);

  return sendActionEmail({
    to: input.to,
    url: input.url,
    locale: input.locale,
    copy: {
      subject: t("verification.subject"),
      preview: t("verification.preview"),
      title: t("verification.title"),
      body: t("verification.body"),
      cta: t("verification.cta"),
      text: t("verification.text", { url: input.url }),
    },
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  url: string;
  locale?: string | null;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);

  return sendActionEmail({
    to: input.to,
    url: input.url,
    locale: input.locale,
    copy: {
      subject: t("reset.subject"),
      preview: t("reset.preview"),
      title: t("reset.title"),
      body: t("reset.body"),
      cta: t("reset.cta"),
      text: t("reset.text", { url: input.url }),
    },
  });
}

export async function sendMagicLinkEmail(input: {
  to: string;
  url: string;
  locale?: string | null;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);

  return sendActionEmail({
    to: input.to,
    url: input.url,
    locale: input.locale,
    copy: {
      subject: t("magicLink.subject"),
      preview: t("magicLink.preview"),
      title: t("magicLink.title"),
      body: t("magicLink.body"),
      cta: t("magicLink.cta"),
      text: t("magicLink.text", { url: input.url }),
    },
  });
}

export async function sendWaitlistConfirmationEmail(input: {
  to: string;
  locale?: string | null;
  firstName?: string | null;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);
  const firstName = firstNameFromDisplayName(input.firstName);
  const greeting = firstName
    ? t("waitlist.greeting", { firstName })
    : t("waitlist.greetingAnonymous");

  await sendEmail({
    to: input.to,
    subject: t("waitlist.subject"),
    text: t("waitlist.text", { firstName: firstName ?? "" }),
    html: renderTransactionalEmail({
      preview: t("waitlist.preview"),
      title: t("waitlist.title"),
      greeting,
      bodyHtml: paragraphsToHtml([t("waitlist.body")]),
      signoff: signoffFrom(t),
      footerFallback: t("footerFallback"),
      footerIgnore: t("footerIgnore"),
      footerSignature: t("footerSignature"),
      footerReason: t("waitlist.reason"),
    }),
  });
}

export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  token: string;
  locale?: string | null;
}) {
  const url = `${env.APP_URL}/invite?token=${input.token}`;
  const { t } = await getTransactionalEmailTranslations(input.locale);
  const safeWorkspace = escapeHtml(input.workspaceName);

  await sendEmail({
    to: input.to,
    subject: t("invite.subject", { workspaceName: input.workspaceName }),
    text: t("invite.text", { workspaceName: input.workspaceName, url }),
    html: renderTransactionalEmail({
      preview: t("invite.preview", { workspaceName: input.workspaceName }),
      title: t("invite.title"),
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(t("invite.bodyPrefix"))} <strong style="color:#0a0a0a">${safeWorkspace}</strong> ${escapeHtml(t("invite.bodySuffix"))}</p>`,
      cta: { label: t("invite.cta"), url },
      signoff: signoffFrom(t),
      footerFallback: t("footerFallback"),
      footerIgnore: t("footerIgnore"),
      footerSignature: t("footerSignature"),
    }),
  });
}

export async function sendWelcomeEmail(input: {
  to: string;
  locale?: string | null;
  firstName?: string | null;
}) {
  const { t } = await getTransactionalEmailTranslations(input.locale);
  const firstName = firstNameFromDisplayName(input.firstName);
  const greeting = firstName
    ? t("welcome.greeting", { firstName })
    : t("welcome.greetingAnonymous");
  const credits = String(TRIAL_CREDIT_GRANT);
  const url = env.APP_URL;

  await sendEmail({
    to: input.to,
    subject: t("welcome.subject"),
    text: t("welcome.text", { firstName: firstName ?? "", credits, url }),
    html: renderTransactionalEmail({
      preview: t("welcome.preview", { credits }),
      title: t("welcome.title"),
      greeting,
      bodyHtml: [
        paragraphsToHtml([t("welcome.intro", { credits })]),
        stepsToHtml([t("welcome.step1"), t("welcome.step2"), t("welcome.step3")]),
        paragraphsToHtml([t("welcome.close")]),
      ].join(""),
      cta: { label: t("welcome.cta"), url },
      signoff: signoffFrom(t),
      footerFallback: t("footerFallback"),
      footerIgnore: t("footerIgnore"),
      footerSignature: t("footerSignature"),
      footerReason: t("welcome.reason"),
    }),
  });
}
