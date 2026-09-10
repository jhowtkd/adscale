import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authPrimaryButtonClass } from "./auth-chrome";

const authFiles = [
  "src/components/auth/auth-chrome.ts",
  "src/components/auth/AuthCard.tsx",
  "src/components/auth/AuthPageShell.tsx",
  "src/app/login/LoginContent.tsx",
  "src/app/signup/SignupContent.tsx",
  "src/app/forgot-password/ForgotPasswordContent.tsx",
  "src/app/reset-password/ResetPasswordContent.tsx",
  "src/app/invite/InviteContent.tsx",
  "src/app/invite/page.tsx",
  "src/app/reset-password/page.tsx",
];

describe("auth chrome", () => {
  it("keeps the page commit quiet instead of Palco ivory fill", () => {
    expect(authPrimaryButtonClass).not.toContain("action-primary-bg");
  });

  it("does not use Palco primary fill on auth surfaces", () => {
    const root = process.cwd();
    for (const file of authFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("action-primary-bg");
    }
  });

  it("stages auth on studio occupancy without TalkBox chrome", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/auth/AuthPageShell.tsx"), "utf8");
    expect(source).toContain("ImageCursorTrail");
    expect(source).toContain("auth-occupancy");
    expect(source).toContain("/images/auth/");
    expect(source).not.toContain("/manual/screenshots/");
    expect(source).not.toContain("TalkBox");
    expect(source).not.toContain("ShineBorder");
  });
});
