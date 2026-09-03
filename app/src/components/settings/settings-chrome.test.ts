import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { settingsButtonClass } from "./settings-chrome";

const tabFiles = [
  "ProfileTab.tsx",
  "WorkspaceTab.tsx",
  "TeamTab.tsx",
  "PrivacyTab.tsx",
  "BillingTab.tsx",
  "PlansTab.tsx",
  "CreditHistoryTab.tsx",
  "IntegrationsTab.tsx",
];

describe("settings chrome", () => {
  it("keeps the primary action quiet instead of Palco ivory fill", () => {
    expect(settingsButtonClass).not.toContain("action-primary-bg");
  });

  it("does not use Palco primary fill on settings tabs", () => {
    for (const file of tabFiles) {
      const source = readFileSync(
        path.join(process.cwd(), "src/components/settings", file),
        "utf8",
      );
      expect(source, file).not.toContain("action-primary-bg");
    }
  });
});
