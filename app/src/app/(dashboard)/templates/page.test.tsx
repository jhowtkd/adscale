import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("template composer CTA", () => {
  it("keeps the template CTA literal visible to the convergence inventory", () => {
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    const href = "router.push(`/?templateId=${encodeURIComponent(template.id)}&compose=1`)";
    expect(source.match(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")))
      .toHaveLength(1);
  });

  it("uses role tokens for template actions, utility icons, and validation", () => {
    const page = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    const card = readFileSync("src/components/templates/TemplateCard.tsx", "utf8");
    const modal = readFileSync("src/components/templates/SaveTemplateModal.tsx", "utf8");

    expect(page).toContain("bg-[var(--action-primary-bg)]");
    expect(card).toContain('variant="neutral"');
    expect(card).toContain("ContextualHelp");
    expect(card).toContain('tTemplate("modeHelpLabel"');
    expect(card).toContain("modes.artVariation.description");
    expect(card).toContain("text-[var(--utility-icon)]");
    expect(card).toContain("bg-[var(--action-primary-bg)]");
    expect(card).toContain("hover:text-[var(--danger-text)]");
    expect(modal).toContain('aria-required="true"');
    expect(modal).toContain('aria-invalid={Boolean(error)}');
    expect(modal).toContain('role="alert"');
    expect(modal).toContain("border-[var(--danger-border)]");
    expect(modal).toContain("bg-[var(--action-primary-bg)]");
    expect(`${card}\n${modal}`).not.toMatch(/--accent-(?:green|blue|rose)/);
  });
});
