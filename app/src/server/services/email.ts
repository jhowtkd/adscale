import { env } from "@/server/validation/env";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput) {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function authEmailHtml(values: { title: string; body: string; cta: string; url: string }) {
  const safeTitle = escapeHtml(values.title);
  const safeBody = escapeHtml(values.body);
  const safeCta = escapeHtml(values.cta);
  const safeUrl = escapeHtml(values.url);

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h1 style="font-size:20px;margin:0 0 16px">${safeTitle}</h1>
      <p style="margin:0 0 20px">${safeBody}</p>
      <p style="margin:0 0 24px">
        <a href="${safeUrl}" style="background:#111827;color:#ffffff;padding:10px 16px;text-decoration:none;border-radius:6px">${safeCta}</a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin:0">If the button does not work, copy and paste this URL into your browser:</p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all;margin:4px 0 0">${safeUrl}</p>
    </div>
  `;
}

export function sendVerificationEmail(input: { to: string; url: string }) {
  return sendEmail({
    to: input.to,
    subject: "Verify your ADScale email",
    text: `Verify your ADScale email by opening this link: ${input.url}`,
    html: authEmailHtml({
      title: "Verify your ADScale email",
      body: "Confirm this email address to finish securing your ADScale account.",
      cta: "Verify email",
      url: input.url,
    }),
  });
}

export function sendPasswordResetEmail(input: { to: string; url: string }) {
  return sendEmail({
    to: input.to,
    subject: "Reset your ADScale password",
    text: `Reset your ADScale password by opening this link: ${input.url}`,
    html: authEmailHtml({
      title: "Reset your ADScale password",
      body: "Use this secure link to choose a new password for your ADScale account.",
      cta: "Reset password",
      url: input.url,
    }),
  });
}

export function sendMagicLinkEmail(input: { to: string; url: string }) {
  return sendEmail({
    to: input.to,
    subject: "Sign in to ADScale",
    text: `Sign in to ADScale by opening this link: ${input.url}`,
    html: authEmailHtml({
      title: "Sign in to ADScale",
      body: "Click the button below to sign in to your ADScale account. This link will expire in 5 minutes.",
      cta: "Sign in",
      url: input.url,
    }),
  });
}

export function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  token: string;
}) {
  const url = `${env.APP_URL}/invite?token=${input.token}`;
  return sendEmail({
    to: input.to,
    subject: `You've been invited to join ${input.workspaceName} on ADScale`,
    text: `You've been invited to join ${input.workspaceName} on ADScale. Accept the invite by opening this link: ${url}`,
    html: authEmailHtml({
      title: "Workspace Invite",
      body: `You've been invited to join <strong>${escapeHtml(input.workspaceName)}</strong> on ADScale.`,
      cta: "Accept Invite",
      url,
    }),
  });
}
