import { describe, expect, it } from "vitest";
import {
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
    expect(stepsToHtml(["Open Estúdio", "Generate"])).toContain("<ol");
    expect(stepsToHtml(["Open Estúdio"])).toContain("Open Estúdio");
  });

  it("renders branded layout with cta, greeting, preview, and founder signoff", () => {
    const html = renderTransactionalEmail({
      preview: "Preview line",
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
    expect(html).toContain("#00b34a");
    expect(html).toContain("Preview line");
    expect(html).toContain("https://example.com/action");
    expect(html).toContain("Oi Ana,");
    expect(html).toContain("Jhonatan");
    expect(html).toContain("Founder, ADScale");
    expect(html).toContain("Você recebeu este e-mail porque criou uma conta.");
    expect(html).toContain('lang="pt-BR"');
  });
});
