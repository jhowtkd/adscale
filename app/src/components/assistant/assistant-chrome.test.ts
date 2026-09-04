import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assistantQuietCommitClass, assistantShellClass } from "./assistant-chrome";

const assistantFiles = [
  "assistant-chrome.ts",
  "AssistantStartComposer.tsx",
  "AssistantChatInput.tsx",
  "AssistantShell.tsx",
  "AssistantTreeSidebar.tsx",
  "ActionCard.tsx",
  "GoalPackageReview.tsx",
  "CreativeAnnotationEditor.tsx",
];

describe("assistant chrome", () => {
  it("keeps chat commit quiet instead of Palco ivory fill", () => {
    expect(assistantQuietCommitClass).not.toContain("action-primary-bg");
    expect(assistantShellClass).toContain("canvas");
  });

  it("does not use Palco primary fill on assistant surfaces", () => {
    const root = path.join(process.cwd(), "src/components/assistant");
    for (const file of assistantFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("action-primary-bg");
      expect(source, file).not.toContain("TalkBox");
      expect(source, file).not.toContain("ShineBorder");
    }
  });
});
