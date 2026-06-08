import { describe, expect, it } from "vitest";
import { escapeHtml, renderTransactionalEmail } from "./email-template";

describe("email-template", () => {
  it("escapes unsafe html in user-facing strings", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("renders branded layout with cta and preview text", () => {
    const html = renderTransactionalEmail({
      preview: "Preview line",
      title: "Hello",
      bodyHtml: "Body copy",
      cta: { label: "Go", url: "https://example.com/action" },
      footerFallback: "Fallback",
      footerIgnore: "Ignore",
      footerSignature: "ADScale",
    });

    expect(html).toContain("ADScale");
    expect(html).toContain("#00b34a");
    expect(html).toContain("Preview line");
    expect(html).toContain("https://example.com/action");
  });
});
