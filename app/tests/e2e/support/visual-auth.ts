import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const VISUAL_EMAIL = "visual-foundations@example.test";
export const VISUAL_PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
export const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");

export type VisualManifest = {
  identity: { email: string; name: string };
  fixtureIds: { userId: string; workspaceId: string; campaignIds: string[]; derivationId: string };
  labels: { workspace: string; clients: string[] };
  routes: {
    dashboard: string;
    campaignList: string;
    workspace: string;
    settingsProfile: string;
    settingsBilling: string;
  };
  states: Record<string, string[]>;
};

export function seedVisualManifest(force = false): VisualManifest {
  if (force || !existsSync(MANIFEST_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as VisualManifest;
}

export async function loginVisualFoundation(
  page: Page,
  locale: "pt-BR" | "en" = "pt-BR",
  theme: "light" | "dark" = "light",
) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: locale, domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
    const style = document.createElement("style");
    style.dataset.visualRelease = "deterministic-motion";
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  }, theme);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator("#email").fill(VISUAL_EMAIL);
      await page.locator("#login-password").fill(VISUAL_PASSWORD);
      await page.locator("form:has(#email) button[type=submit]").click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1_500);
    }
  }
}

export const RELEASE_VIEWPORTS = [390, 768, 1024, 1280, 1440, 1920] as const;

export function releaseLocaleTheme(width: number): { locale: "pt-BR" | "en"; theme: "light" | "dark" } {
  const variants = {
    390: { locale: "pt-BR", theme: "light" },
    768: { locale: "en", theme: "dark" },
    1024: { locale: "pt-BR", theme: "dark" },
    1280: { locale: "en", theme: "light" },
    1440: { locale: "pt-BR", theme: "light" },
    1920: { locale: "en", theme: "dark" },
  } as const;
  return variants[width as keyof typeof variants];
}
