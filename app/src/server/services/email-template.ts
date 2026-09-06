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
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.body}">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export function stepsToHtml(steps: string[]): string {
  if (steps.length === 0) return "";
  const items = steps
    .map((step) => step.trim())
    .filter(Boolean)
    .map((step, index) => {
      const n = String(index + 1).padStart(2, "0");
      return `<tr>
                  <td style="padding:0 14px 14px 0;vertical-align:top;width:36px;font-family:${FONTS.mono};font-size:12px;line-height:1.7;letter-spacing:0.08em;color:${BRAND.green};font-weight:700">${n}</td>
                  <td style="padding:0 0 14px;font-size:15px;line-height:1.7;color:${BRAND.body}">${escapeHtml(step).replace(/\n/g, "<br>")}</td>
                </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 8px">${items}</table>`;
}

export type EmailSignoff = {
  close: string;
  name: string;
  role: string;
};

export type TransactionalEmailLayout = {
  lang?: string;
  preview?: string;
  eyebrow?: string;
  logoUrl?: string;
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
  body: "#444444",
  muted: "#525252",
  faint: "#737373",
  canvas: "#fafafa",
  card: "#ffffff",
  border: "#e4e4e7",
  white: "#ffffff",
} as const;

const FONTS = {
  sans: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  mono: "'Space Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const;

export const EMAIL_CTA_MARK = 'data-cta="primary"';

export function emailLogoUrl(appUrl: string) {
  return `${appUrl.replace(/\/$/, "")}/images/logo-email.png`;
}

export function renderTransactionalEmail(layout: TransactionalEmailLayout): string {
  const lang = escapeHtml(layout.lang ?? "pt-BR");
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
  const safeEyebrow = layout.eyebrow ? escapeHtml(layout.eyebrow) : "";
  const safeLogoUrl = layout.logoUrl ? escapeHtml(layout.logoUrl) : "";

  const logoBlock = layout.logoUrl
    ? `<img src="${safeLogoUrl}" alt="ADScale" width="162" height="28" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none" />`
    : `<span style="font-size:18px;font-weight:800;letter-spacing:0.12em;color:${BRAND.ink};font-family:${FONTS.sans}">ADSCALE</span>`;

  const eyebrowBlock = layout.eyebrow
    ? `
                <tr>
                  <td style="padding:0 0 10px;font-family:${FONTS.mono};font-size:10px;line-height:1.4;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.green}">
                    ${safeEyebrow}
                  </td>
                </tr>`
    : "";

  const greetingBlock = layout.greeting
    ? `
                <tr>
                  <td style="padding:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.body}">
                    ${safeGreeting}
                  </td>
                </tr>`
    : "";

  const ctaBlock = layout.cta
    ? `
                <tr>
                  <td style="padding:8px 0 20px">
                    <a href="${safeCtaUrl}" ${EMAIL_CTA_MARK} style="display:inline-block;background:${BRAND.ink};color:${BRAND.white};font-size:14px;font-weight:600;line-height:1;padding:12px 20px;text-decoration:none;border-radius:4px;font-family:${FONTS.sans}">
                      ${safeCtaLabel}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 6px;font-size:12px;line-height:1.5;color:${BRAND.faint}">
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
                  <td style="padding:8px 0 24px;font-size:15px;line-height:1.7;color:${BRAND.body}">
                    ${escapeHtml(layout.signoff.close)}<br />
                    ${escapeHtml(layout.signoff.name)}<br />
                    <span style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.faint}">${escapeHtml(layout.signoff.role)}</span>
                  </td>
                </tr>`
    : "";

  const reasonBlock = layout.footerReason
    ? `
          <tr>
            <td style="padding:12px 8px 0;text-align:center;font-size:11px;line-height:1.5;color:${BRAND.faint}">
              ${safeReason}
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:${FONTS.sans}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.canvas};background-image:radial-gradient(#d4d4d8 1px, transparent 1px);background-size:18px 18px;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="height:3px;line-height:3px;font-size:0;background:${BRAND.green}">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 24px">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:0 0 24px;text-align:center">
                          ${logoBlock}
                        </td>
                      </tr>
                      ${eyebrowBlock}
                      <tr>
                        <td style="padding:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${BRAND.ink}">
                          ${safeTitle}
                        </td>
                      </tr>
                      ${greetingBlock}
                      <tr>
                        <td style="padding:0;font-size:15px;line-height:1.7;color:${BRAND.body}">
                          ${layout.bodyHtml}
                        </td>
                      </tr>
                      ${ctaBlock}
                      ${signoffBlock}
                      <tr>
                        <td style="padding:0;font-size:12px;line-height:1.5;color:${BRAND.faint};border-top:1px solid ${BRAND.border};padding-top:20px">
                          ${safeIgnore}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${reasonBlock}
          <tr>
            <td style="padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.5;letter-spacing:0.04em;color:${BRAND.faint}">
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
