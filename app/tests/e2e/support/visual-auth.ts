import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const VISUAL_EMAIL = "visual-foundations@example.test";
export const VISUAL_PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
export const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");

export type VisualManifest = {
  identity: { email: string; name: string };
  roleMatrix: {
    platformOwner: { email: string; role: "platform-owner" };
    workspaceAdmin: { email: string; role: "admin" };
    workspaceMember: { email: string; role: "member" };
  };
  fixtureIds: { userId: string; workspaceId: string; campaignIds: string[]; derivationId: string };
  labels: { workspace: string; clients: string[] };
  variationSources: { name: string; width: number; height: number }[];
  routes: {
    creativeWork: string;
    dashboard: string;
    campaignList: string;
    library: string;
    workspace: string;
    variationWorkspace: string;
    settingsProfile: string;
    settingsBilling: string;
  };
  states: Record<string, string[]>;
};

export function seedVisualManifest(force = false): VisualManifest {
  const current = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Partial<VisualManifest>
    : null;
  if (force || !current?.routes?.variationWorkspace || current.variationSources?.length !== 3 || !current.roleMatrix) {
    execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000", NODE_OPTIONS: `--conditions=react-server ${process.env.NODE_OPTIONS ?? ""}`.trim() },
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as VisualManifest;
}

export async function loginVisualIdentity(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.locator("#email:visible").fill(email);
  await page.locator("#login-password:visible").fill(VISUAL_PASSWORD);
  const signInResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.locator("form:has(#email:visible) button[type=submit]").click();
  const response = await signInResponse;
  if (!response.ok()) {
    throw new Error(`Synthetic sign-in failed (${response.status()}): ${await response.text()}`);
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.waitForTimeout(250);
}

export async function loginVisualFoundation(
  page: Page,
  locale: "pt-BR" | "en" = "pt-BR",
  theme: "light" | "dark" = "light",
) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const response = await page.context().request.post(`${baseURL}/api/auth/sign-in/email`, {
    data: { email: VISUAL_EMAIL, password: VISUAL_PASSWORD },
    headers: { Origin: baseURL },
  });
  if (!response.ok()) {
    throw new Error(`Synthetic sign-in failed (${response.status()}): ${await response.text()}`);
  }
  await page.context().addCookies([
    { name: "locale", value: locale, url: baseURL },
  ]);
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
    localStorage.setItem("adscale_cookie_consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    const style = document.createElement("style");
    style.dataset.visualRelease = "deterministic-motion";
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  }, theme);
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
