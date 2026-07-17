import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("template composer CTA", () => {
  it("keeps the template CTA literal visible to the convergence inventory", () => {
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    const href = "router.push(`/?templateId=${encodeURIComponent(template.id)}&compose=1`)";
    expect(source.match(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")))
      .toHaveLength(1);
  });
});
