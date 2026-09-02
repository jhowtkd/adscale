export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function firstNameFromDisplayName(name?: string | null): string | undefined {
  const token = name?.trim().split(/\s+/)[0];
  return token || undefined;
}

export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export function stepsToHtml(steps: string[]): string {
  if (steps.length === 0) return "";
  const items = steps
    .map((step) => step.trim())
    .filter(Boolean)
    .map(
      (step) =>
        `<li style="margin:0 0 10px;padding:0">${escapeHtml(step).replace(/\n/g, "<br>")}</li>`
    )
    .join("");
  return `<ol style="margin:0 0 16px;padding-left:20px">${items}</ol>`;
}

export type EmailSignoff = {
  close: string;
  name: string;
  role: string;
};

export type TransactionalEmailLayout = {
  preview?: string;
  title: string;
  greeting?: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  signoff?: EmailSignoff;
  footerFallback: string;
  footerIgnore: string;
  footerSignature: string;
  footerReason?: string;
};

const BRAND = {
  green: "#00b34a",
  ink: "#0a0a0a",
  muted: "#525252",
  faint: "#737373",
  canvas: "#f4f4f5",
  card: "#ffffff",
  border: "#e4e4e7",
} as const;

export function renderTransactionalEmail(layout: TransactionalEmailLayout): string {
  const safeTitle = escapeHtml(layout.title);
  const safePreview = layout.preview ? escapeHtml(layout.preview) : safeTitle;
  const ctaUrl = layout.cta?.url ?? "";
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeCtaLabel = layout.cta ? escapeHtml(layout.cta.label) : "";
  const safeFallback = escapeHtml(layout.footerFallback);
  const safeIgnore = escapeHtml(layout.footerIgnore);
  const safeSignature = escapeHtml(layout.footerSignature);
  const safeReason = layout.footerReason ? escapeHtml(layout.footerReason) : "";
  const safeGreeting = layout.greeting ? escapeHtml(layout.greeting) : "";

  const greetingBlock = layout.greeting
    ? `
                <tr>
                  <td style="padding:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.muted}">
                    ${safeGreeting}
                  </td>
                </tr>`
    : "";

  const ctaBlock = layout.cta
    ? `
      <tr>
        <td style="padding:8px 0 28px">
          <a href="${safeCtaUrl}" style="display:inline-block;background:${BRAND.green};color:${BRAND.ink};font-size:15px;font-weight:600;line-height:1;padding:14px 24px;text-decoration:none;border-radius:8px">
            ${safeCtaLabel}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 8px;font-size:13px;line-height:1.5;color:${BRAND.faint}">
          ${safeFallback}
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 24px;font-size:12px;line-height:1.5;color:${BRAND.muted};word-break:break-all">
          <a href="${safeCtaUrl}" style="color:${BRAND.muted};text-decoration:underline">${safeCtaUrl}</a>
        </td>
      </tr>`
    : "";

  const signoffBlock = layout.signoff
    ? `
                <tr>
                  <td style="padding:8px 0 24px;font-size:16px;line-height:1.6;color:${BRAND.muted}">
                    ${escapeHtml(layout.signoff.close)}<br />
                    ${escapeHtml(layout.signoff.name)}<br />
                    <span style="color:${BRAND.faint}">${escapeHtml(layout.signoff.role)}</span>
                  </td>
                </tr>`
    : "";

  const reasonBlock = layout.footerReason
    ? `
          <tr>
            <td style="padding:8px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:${BRAND.faint}">
              ${safeReason}
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.canvas};padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
          <tr>
            <td style="padding:0 0 20px;text-align:center">
              <span style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:${BRAND.ink}">AD</span><span style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:${BRAND.green}">Scale</span>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;padding:32px 28px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.ink}">
                    ${safeTitle}
                  </td>
                </tr>
                ${greetingBlock}
                <tr>
                  <td style="padding:0;font-size:16px;line-height:1.6;color:${BRAND.muted}">
                    ${layout.bodyHtml}
                  </td>
                </tr>
                ${ctaBlock}
                ${signoffBlock}
                <tr>
                  <td style="padding:0;font-size:13px;line-height:1.5;color:${BRAND.faint};border-top:1px solid ${BRAND.border};padding-top:20px">
                    ${safeIgnore}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${reasonBlock}
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:${BRAND.faint}">
              ${safeSignature}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
