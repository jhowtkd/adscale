import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legalKickerClass, legalTitleClass } from "./legal-chrome";

const legalFiles = [
  "src/components/legal/legal-chrome.ts",
  "src/components/legal/LegalNav.tsx",
  "src/app/(public)/layout.tsx",
  "src/app/(public)/privacy/page.tsx",
  "src/app/(public)/terms/page.tsx",
];

describe("legal chrome", () => {
  it("uses document kickers and product titles, not Palco composer language", () => {
    expect(legalKickerClass).toContain("font-mono");
    expect(legalTitleClass).toContain("product-page-title");
  });

  it("does not use Palco ivory, TalkBox, or raised public bars", () => {
    const root = process.cwd();
    for (const file of legalFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("action-primary-bg");
      expect(source, file).not.toContain("TalkBox");
      expect(source, file).not.toContain("ShineBorder");
      expect(source, file).not.toContain("surface-base");
    }
  });

  it("keeps the legal shell on the studio canvas with the product mark", () => {
    const root = process.cwd();
    const layout = readFileSync(path.join(root, "src/app/(public)/layout.tsx"), "utf8");
    const nav = readFileSync(path.join(root, "src/components/legal/LegalNav.tsx"), "utf8");
    expect(layout).toContain('src="/images/logo.svg"');
    expect(layout).toContain("bg-[var(--canvas)]");
    expect(nav).toContain("/privacy");
    expect(nav).toContain("/terms");
  });
});
