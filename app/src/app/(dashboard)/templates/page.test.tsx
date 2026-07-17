import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { templateComposerHref } from "./page";

describe("templateComposerHref", () => {
  it("opens the template directly in the focused home composer", () => {
    expect(
      templateComposerHref("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    ).toBe(
      "/?templateId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&compose=1"
    );
  });

  it("keeps the template CTA literal visible to the convergence inventory", () => {
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    expect(source).toContain(
      "router.push(`/?templateId=${encodeURIComponent(template.id)}&compose=1`)"
    );
  });
});
