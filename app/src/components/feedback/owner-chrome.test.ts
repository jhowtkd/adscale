import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ownerButtonClass, ownerNavItemClass } from "./owner-chrome";

const ownerFiles = [
  "src/components/feedback/owner-chrome.ts",
  "src/components/feedback/GuidedFlowFeedbackPanel.tsx",
  "src/app/(dashboard)/feedback/page.tsx",
  "src/components/admin/AdminInspirationsPanel.tsx",
  "src/app/(dashboard)/admin/quality/brands/[clientProfileId]/page.tsx",
];

describe("owner chrome", () => {
  it("keeps owner commit quiet instead of Palco ivory fill", () => {
    expect(ownerButtonClass).not.toContain("action-primary-bg");
    expect(ownerNavItemClass(true)).toContain("bg-white/8");
    expect(ownerNavItemClass(true)).not.toContain("selection-bg");
  });

  it("does not use Palco primary fill or nested owner cards", () => {
    const root = process.cwd();
    for (const file of ownerFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("action-primary-bg");
      expect(source, file).not.toContain("TalkBox");
    }
  });
});
