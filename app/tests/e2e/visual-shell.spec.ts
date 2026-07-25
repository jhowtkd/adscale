import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "visual-foundations@example.test";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");
const EVIDENCE_PATH = path.resolve(
  process.cwd(),
  "../.planning/phases/110-app-shell-and-navigation/110-EVIDENCE.json",
);
const EVIDENCE_109_PATH = path.resolve(
  process.cwd(),
  "../.planning/phases/109-visual-foundations-and-baseline/109-EVIDENCE.json",
);

type ShellCheck = {
  viewport: number;
  route: string;
  mainCount: number;
  nestedMain: boolean;
  contentBelowHeader: boolean;
  mobileNavClear: boolean;
  result: "pass" | "fail";
};

function seedManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000", NODE_OPTIONS: `--conditions=react-server ${process.env.NODE_OPTIONS ?? ""}`.trim() },
      stdio: "inherit",
    });
  }
}

async function login(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "pt-BR", domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.dataset.visualShell = "deterministic-motion";
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  });
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function assertShellGeometry(page: Page, route: string, viewport: number): Promise<ShellCheck> {
  await page.goto(route);
  await expect(page.locator("main#main")).toBeVisible();

  const report = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    const main = document.getElementById("main");
    const nestedMain = Boolean(main?.querySelector("main"));
    const header = document.querySelector("header");
    const heading =
      main?.querySelector("h1, h2, [role='heading']") ??
      main?.querySelector("a, button, input, p") ??
      main?.firstElementChild;
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const contentTop = heading?.getBoundingClientRect().top ?? main?.getBoundingClientRect().top ?? 0;
    const contentBelowHeader = contentTop >= headerBottom - 2;

    const mobileNav = document.querySelector('nav[aria-label="Primary mobile navigation"]');
    let mobileNavClear = true;
    if (mobileNav && main) {
      const navStyle = window.getComputedStyle(mobileNav);
      const navVisible = navStyle.display !== "none" && navStyle.visibility !== "hidden";
      if (navVisible) {
        const paddingBottom = Number.parseFloat(window.getComputedStyle(main).paddingBottom);
        const navHeight = mobileNav.getBoundingClientRect().height;
        mobileNavClear =
          Number.isFinite(paddingBottom) && paddingBottom + 16 >= navHeight;
      }
    }

    return {
      mainCount: mains.length,
      nestedMain,
      contentBelowHeader,
      mobileNavClear,
    };
  });

  const check: ShellCheck = {
    viewport,
    route,
    ...report,
    result:
      report.mainCount === 1 &&
      !report.nestedMain &&
      report.contentBelowHeader &&
      report.mobileNavClear
        ? "pass"
        : "fail",
  };

  expect(check.mainCount, `${route}@${viewport}: main count`).toBe(1);
  expect(check.nestedMain, `${route}@${viewport}: nested main`).toBe(false);
  expect(check.contentBelowHeader, `${route}@${viewport}: content below header`).toBe(true);
  expect(check.mobileNavClear, `${route}@${viewport}: mobile nav clearance`).toBe(true);

  return check;
}

function appendEvidence(check: ShellCheck) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  const current = existsSync(EVIDENCE_PATH)
    ? JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
    : {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        identity: EMAIL,
        checks: [],
        requirements: {
          "SHELL-01": { result: "pending" },
          "SHELL-02": { result: "pending" },
          "SHELL-03": { result: "pending" },
          "SHELL-04": { result: "pending" },
          "SHELL-05": { result: "pending" },
        },
        resolvedDefects: [] as string[],
      };

  const key = `${check.route}@${check.viewport}`;
  current.checks = [...(current.checks ?? []).filter((item: ShellCheck & { key?: string }) => item.key !== key), { ...check, key }];
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

test.describe("visual shell", () => {
  test.beforeAll(() => {
    seedManifest();
  });

  for (const route of ["/", "/campaigns", "/settings"]) {
    test(`authenticated shell geometry at ${route}`, async ({ page }, testInfo) => {
      const width = testInfo.project.use.viewport?.width;
      if (!width) throw new Error("Shell project missing viewport width");
      await login(page);
      const check = await assertShellGeometry(page, route, width);
      appendEvidence(check);
    });
  }

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: ShellCheck[] = evidence.checks ?? [];
    const allPass = checks.length >= 9 && checks.every((check) => check.result === "pass");
    if (!allPass) return;

    for (const id of ["SHELL-01", "SHELL-02", "SHELL-03", "SHELL-04", "SHELL-05"]) {
      evidence.requirements[id] = {
        result: "pass",
        automated: "npx playwright test --config playwright.shell.config.ts",
        browser: checks.map((check) => `${check.route}@${check.viewport}`).join(", "),
      };
    }
    evidence.resolvedDefects = ["DEFECT-LANDMARKS"];
    evidence.verifiedAt = new Date().toISOString();
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

    if (existsSync(EVIDENCE_109_PATH)) {
      const base = JSON.parse(readFileSync(EVIDENCE_109_PATH, "utf8"));
      base.defects = (base.defects ?? []).map((defect: { id: string; observation: string; owner: string }) =>
        defect.id === "DEFECT-LANDMARKS"
          ? { ...defect, status: "resolved", resolvedIn: "110", resolvedAt: evidence.verifiedAt }
          : defect,
      );
      writeFileSync(EVIDENCE_109_PATH, `${JSON.stringify(base, null, 2)}\n`);
    }
  });
});
