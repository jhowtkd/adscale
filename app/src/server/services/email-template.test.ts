import { describe, expect, it } from "vitest";
import {
  EMAIL_CTA_MARK,
  emailLogoUrl,
  escapeHtml,
  firstNameFromDisplayName,
  paragraphsToHtml,
  renderTransactionalEmail,
  stepsToHtml,
} from "./email-template";

describe("email-template", () => {
  it("escapes unsafe html in user-facing strings", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("takes only the first token of a display name", () => {
    expect(firstNameFromDisplayName("Ana Silva")).toBe("Ana");
    expect(firstNameFromDisplayName("  ")).toBeUndefined();
    expect(firstNameFromDisplayName(null)).toBeUndefined();
  });

  it("renders escaped paragraphs and numbered steps", () => {
    expect(paragraphsToHtml(["Hello <b>x</b>", "Second"])).toContain("Hello &lt;b&gt;x&lt;/b&gt;");
    const steps = stepsToHtml(["Open Estúdio", "Generate"]);
    expect(steps).toContain("01");
    expect(steps).toContain("02");
    expect(steps).toContain("Open Estúdio");
    expect(steps).not.toContain("<ol");
    expect(steps).toContain("#00b34a");
  });

  it("builds the hosted wordmark url from APP_URL", () => {
    expect(emailLogoUrl("https://app.example.com/")).toBe(
      "https://app.example.com/images/logo-email.png"
    );
  });

  it("renders branded layout with ink cta, wordmark, eyebrow, and founder signoff", () => {
    const html = renderTransactionalEmail({
      preview: "Preview line",
      eyebrow: "ESTÚDIO",
      logoUrl: "https://app.example.com/images/logo-email.png",
      title: "Hello",
      greeting: "Oi Ana,",
      bodyHtml: "Body copy",
      cta: { label: "Go", url: "https://example.com/action" },
      signoff: { close: "Abraço,", name: "Jhonatan", role: "Founder, ADScale" },
      footerFallback: "Fallback",
      footerIgnore: "Ignore",
      footerSignature: "ADScale",
      footerReason: "Você recebeu este e-mail porque criou uma conta.",
    });

    expect(html).toContain("ADScale");
    expect(html).toContain("/images/logo-email.png");
    expect(html).toContain("ESTÚDIO");
    expect(html).toContain("Space Mono");
    expect(html).toContain("#fafafa");
    expect(html).toContain("#00b34a");
    expect(html).toContain("background:#0a0a0a");
    expect(html).toContain("color:#ffffff");
    expect(html).toContain("border-radius:4px");
    expect(html).toContain(EMAIL_CTA_MARK);
    expect(html).toContain("Preview line");
    expect(html).toContain("https://example.com/action");
    expect(html).toContain("Oi Ana,");
    expect(html).toContain("Jhonatan");
    expect(html).toContain("Founder, ADScale");
    expect(html).toContain("Você recebeu este e-mail porque criou uma conta.");
    expect(html).toContain('lang="pt-BR"');
  });

  it("omits the primary cta mark when there is no button", () => {
    const html = renderTransactionalEmail({
      title: "No button",
      bodyHtml: "Body",
      footerFallback: "Fallback",
      footerIgnore: "Ignore",
      footerSignature: "ADScale",
    });

    expect(html).not.toContain(EMAIL_CTA_MARK);
    expect(html).toContain("#00b34a");
  });
});
