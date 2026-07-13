/**
 * Phase 6 Gate 6 UAT — no-provider block:
 * S05 → S02 → S04 → S06 → S10 → S12
 *
 * Requires: app :3000 with E2E_DISABLE_RATE_LIMIT=true, `npm run seed:phase6-uat`
 * Evidence rewritten each run; item 50 stays open (no final evidence commit here).
 */
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  ScenarioCollectors,
  type ScenarioResult,
  appendResult,
  ensureEvidenceDir,
  evidencePath,
  shot,
} from "./support/uat-evidence";
import {
  UAT_EMAIL,
  gotoApp,
  loadPhase6Fixture,
  openAuthedPage,
  waitTrabalhosHydrated,
  waitWorkspaceStages,
} from "./support/phase6-uat-auth";

function record(collectors: ScenarioCollectors, r: ScenarioResult) {
  const gated = collectors.applyHardGates(r);
  appendResult(gated, UAT_EMAIL);
  // eslint-disable-next-line no-console
  console.log(
    `[UAT] ${gated.id} ${gated.status.toUpperCase()} — ${gated.title}: ${gated.notes}`
  );
  return gated;
}

test.describe.configure({ mode: "default" });

test.describe("Phase 6 Gate 6 UAT no-provider block", () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    ensureEvidenceDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const name of ["RESULTS.json", "RESULTS.md"] as const) {
      const p = evidencePath(name);
      if (fs.existsSync(p)) {
        fs.renameSync(p, evidencePath(`${name}.archive-${stamp}`));
      }
    }
  });

  test("S05 product fixes: count title + workStates + clean console", async ({
    browser,
  }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/campaigns");
      await waitTrabalhosHydrated(page);
      await expect(page.getByText(fixture.campaignName).first()).toBeVisible({
        timeout: 15_000,
      });

      const h1 = await page.locator("h1.product-page-title").innerText();
      const main = await page.locator("main").innerText();

      const hasCount = /\d+\s+(trabalhos|works)/i.test(h1);
      const rawKey = /campaign\.v6\.worksTitle|\{count\}/i.test(h1 + main);
      // Status badges only — do not scan campaign names for English tokens
      const badgeLabels = await page
        .locator("main")
        .locator('[class*="badge"], [data-variant]')
        .allTextContents()
        .catch(() => [] as string[]);
      const badgeBlob = badgeLabels.join(" | ");
      const rawFunnel = badgeLabels.some((label) =>
        /^(intending|reviewing|briefing|generating|approved|delivered|abandoned|failed)$/i.test(
          label.trim()
        )
      );
      const translated =
        /em briefing|briefing pronto|em revisão|gerando|in briefing|brief ready|in review/i.test(
          main
        ) ||
        /em briefing|em revisão|gerando|in briefing|in review/i.test(badgeBlob);
      void badgeBlob;

      let status: ScenarioResult["status"] = "pass";
      const notes: string[] = [`h1=${JSON.stringify(h1)}`];
      if (!hasCount || rawKey) {
        status = "fail";
        notes.push("title missing count or raw i18n key");
      }
      if (rawFunnel) {
        status = "fail";
        notes.push("raw funnel state token");
      }
      if (!translated) {
        status = "fail";
        notes.push("translated workStates not visible");
      }

      const result = record(collectors, {
        id: "S05",
        title: "Trabalhos i18n + canonical states",
        status,
        url: page.url(),
        viewport: "1440x900",
        notes: notes.join("; "),
        screenshot: await shot(page, "uat-50-S05-desktop"),
        consoleErrors: [],
        networkErrors: [],
      });
      expect(result.status, result.notes).toBe("pass");
    } finally {
      await context.close();
    }
  });

  test("S02 create campaign → workspace → list", async ({ browser }) => {
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      // Intent path: home → Novo trabalho → Campanha
      await gotoApp(page, "/");
      // Wait for client data (continue target) so React handlers are attached
      await page
        .getByText(/continuar de onde parei|continue where/i)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
      const newWork = page.getByRole("button", {
        name: /novo trabalho|new work/i,
      });
      await expect(newWork).toBeVisible({ timeout: 15_000 });
      await newWork.click();
      // Intent panel heading proves setIntentOpen(true) took effect
      await expect(
        page.getByRole("heading", {
          name: /o que você quer fazer|what do you want/i,
        })
      ).toBeVisible({ timeout: 10_000 });
      const campaignIntent = page.locator('a[href="/campaigns?new=1"]');
      await expect(campaignIntent).toBeVisible({ timeout: 10_000 });
      await campaignIntent.click();
      await page.waitForURL(/new=1/, { timeout: 20_000 });

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      const name = `UAT S02 ${Date.now()}`;
      await dialog.locator("#campaign-name").fill(name);
      await dialog.locator("#campaign-client").fill("UAT Client S02");

      const [res] = await Promise.all([
        page.waitForResponse(
          (r) =>
            (r.url().includes("/api/campaigns") ||
              r.url().includes("/api/templates/")) &&
            r.request().method() === "POST",
          { timeout: 30_000 }
        ),
        dialog.getByRole("button", { name: /criar|create/i }).click(),
      ]);
      expect(res.ok(), `create/materialize HTTP ${res.status()}`).toBeTruthy();

      await page.waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, { timeout: 30_000 });
      const m = page.url().match(/\/campaigns\/([0-9a-f-]{8,})/i);
      expect(m, `expected workspace redirect, got ${page.url()}`).toBeTruthy();
      const campaignId = m![1];

      await waitWorkspaceStages(page);

      await gotoApp(page, "/campaigns");
      await waitTrabalhosHydrated(page);
      await expect(page.getByText(name).first()).toBeVisible({
        timeout: 15_000,
      });

      const result = record(collectors, {
        id: "S02",
        title: "New campaign create + redirect + list",
        status: "pass",
        url: page.url(),
        viewport: "1440x900",
        notes: `campaignId=${campaignId} name=${name}`,
        screenshot: await shot(page, "uat-50-S02-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { campaignId, name },
      });
      expect(result.status).toBe("pass");
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("S04 continue campaign + post workId", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      // --- post workId path (deterministic fixture) ---
      await gotoApp(page, fixture.workResumeHref);
      await page.waitForURL(
        (u) =>
          u.searchParams.get("workId") === fixture.workId ||
          u.href.includes(fixture.workId),
        { timeout: 20_000 }
      );
      const wizard = page
        .getByTestId("create-post-wizard")
        .or(page.getByRole("heading", { name: /criar post|create post/i }));
      await expect(wizard.first()).toBeVisible({ timeout: 20_000 });

      // --- campaign continue from home (seed: campaign is freshest in-progress) ---
      await gotoApp(page, "/");
      const continueLink = page
        .locator('a[href*="/campaigns/"], a[href*="workId="]')
        .filter({ hasText: /continuar de onde parei|continue where/i });
      await expect(continueLink.first()).toBeVisible({ timeout: 20_000 });
      const href = (await continueLink.first().getAttribute("href")) ?? "";
      expect(
        href,
        `Continuar must target campaign, got ${href}`
      ).toMatch(/\/campaigns\/[0-9a-f-]{8,}/i);
      await continueLink.first().click({ force: true });
      await page.waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, { timeout: 20_000 });
      await waitWorkspaceStages(page);
      const landed = page.url();

      const result = record(collectors, {
        id: "S04",
        title: "Continue campaign + post workId",
        status: "pass",
        url: landed,
        viewport: "1440x900",
        notes: `post workId wizard ok; continueHref=${href} landed=${landed}`,
        screenshot: await shot(page, "uat-50-S04-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: {
          workId: fixture.workId,
          campaignId: fixture.campaignId,
        },
      });
      expect(result.status, result.notes).toBe("pass");
    } finally {
      await context.close();
    }
  });

  test("S06 four stages + distinct deep links", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, `/campaigns/${fixture.campaignId}`);
      await waitWorkspaceStages(page);

      const briefing = page.getByRole("button", { name: /briefing/i }).first();
      const produce = page
        .getByRole("button", { name: /produzir|produce/i })
        .first();
      const review = page
        .getByRole("button", { name: /revisar|review/i })
        .first();
      const deliver = page
        .getByRole("button", { name: /entregar|deliver/i })
        .first();

      await expect(briefing).toBeVisible();
      await expect(produce).toBeVisible();
      await expect(review).toBeVisible();
      await expect(deliver).toBeVisible();

      await review.click({ force: true });
      await expect(page.locator("#mission-review")).toBeVisible({
        timeout: 10_000,
      });
      await deliver.click({ force: true });
      await expect(page.locator("#mission-share")).toBeVisible({
        timeout: 10_000,
      });
      // Distinct anchors — export must not nest under review
      const nested = await page.locator("#mission-review #mission-export").count();
      const reviewBox = await page.locator("#mission-review").boundingBox();
      const shareBox = await page.locator("#mission-share").boundingBox();
      const distinct =
        nested === 0 &&
        reviewBox != null &&
        shareBox != null &&
        reviewBox.y !== shareBox.y;

      const result = record(collectors, {
        id: "S06",
        title: "Workspace stages + deep links",
        status: distinct ? "pass" : "fail",
        url: page.url(),
        viewport: "1440x900",
        notes: `nestedExport=${nested} distinctY=${distinct} campaign=${fixture.campaignId}`,
        screenshot: await shot(page, "uat-50-S06-desktop"),
        consoleErrors: [],
        networkErrors: [],
      });
      expect(result.status, result.notes).toBe("pass");
    } finally {
      await context.close();
    }
  });

  test("S10 materialize via UI + list + double-submit guard", async ({
    browser,
  }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/templates");
      const card = page.getByTestId(`template-card-${fixture.templateId}`);
      await expect(card).toBeAttached({ timeout: 15_000 });
      await expect(card.getByText(fixture.templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Product path: Usar template → /campaigns?new=1&templateId= → materialize on submit
      const useBtn = card.getByRole("button", {
        name: /usar template|use template/i,
      });
      await expect(useBtn).toBeVisible({ timeout: 10_000 });
      await useBtn.click();
      // Product navigates to /campaigns?new=1&templateId=… then opens modal after fetch
      await page.waitForURL(
        (u) =>
          u.pathname.startsWith("/campaigns") &&
          (u.searchParams.get("templateId") === fixture.templateId ||
            u.search.includes(fixture.templateId)),
        { timeout: 20_000 }
      );
      // Prefer dialog role; #campaign-name alone can strict-mode dual-match with dialog
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.locator("#campaign-name")).toBeVisible({
        timeout: 15_000,
      });
      const submit = dialog.getByRole("button", { name: /criar|create/i });
      await expect(submit).toBeEnabled({ timeout: 30_000 });

      const name = `UAT S10 ${Date.now()}`;
      await dialog.locator("#campaign-name").fill(name);
      await dialog.locator("#campaign-client").fill("UAT Materialize Client");

      let postCount = 0;
      page.on("request", (req) => {
        if (
          req.method() === "POST" &&
          req.url().includes("/materialize")
        ) {
          postCount += 1;
        }
      });

      // Double-submit: second click must be ignored by createInFlightRef
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/materialize") && r.request().method() === "POST",
          { timeout: 30_000 }
        ),
        (async () => {
          await submit.click();
          await submit.click({ force: true }).catch(() => undefined);
        })(),
      ]);

      await page.waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, { timeout: 30_000 });
      const m = page.url().match(/\/campaigns\/([0-9a-f-]{8,})/i);
      expect(m, `materialize redirect failed: ${page.url()}`).toBeTruthy();
      const campaignId = m![1];
      expect(
        postCount,
        `double-submit should issue one materialize POST, got ${postCount}`
      ).toBe(1);

      await gotoApp(page, "/campaigns");
      await waitTrabalhosHydrated(page);
      await expect(page.getByText(name).first()).toBeVisible({
        timeout: 15_000,
      });

      const result = record(collectors, {
        id: "S10",
        title: "Template materialize UI",
        status: "pass",
        url: page.url(),
        viewport: "1440x900",
        notes: `templateId=${fixture.templateId} campaignId=${campaignId} name=${name} materializePosts=${postCount}`,
        screenshot: await shot(page, "uat-50-S10-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { campaignId, name },
      });
      expect(result.status).toBe("pass");
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("S12 empty + loading + error/retry", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);

    // Home continue first (before error path reloads)
    await gotoApp(page, "/");
    // Wait for canonical works to resolve continue/empty block
    await page
      .getByText(/continuar de onde parei|continue where/i)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    const homeContinue = true;

    // --- empty (deterministic search on hydrated list) ---
    await gotoApp(page, "/campaigns");
    await waitTrabalhosHydrated(page);
    collectors.mark();
    const search = page.locator('input[type="search"]');
    await search.fill(fixture.emptySearch);
    await expect(
      page.getByText(/nenhuma campanha corresponde|no campaigns match/i).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", {
        name: /limpar todos os filtros|clear all filters/i,
      })
    ).toBeVisible({ timeout: 5_000 });
    const emptyOk = true;

    // --- loading (delay GET creative-work) ---
    collectors.mark();
    let loadingOk = false;
    await page.route("**/api/creative-work**", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((r) => setTimeout(r, 1200));
      }
      await route.continue();
    });
    const loadWait = page
      .locator("h1.product-page-title .animate-pulse, .animate-pulse")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await gotoApp(page, "/campaigns");
    loadingOk = await loadWait;
    await page.unroute("**/api/creative-work**").catch(() => undefined);
    await waitTrabalhosHydrated(page);

    // --- error + retry ---
    collectors.mark();
    await page.route("**/api/creative-work**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "uat_forced_error" }),
        });
        return;
      }
      await route.continue();
    });
    await gotoApp(page, "/campaigns");
    await expect(
      page.getByText(/erro ao carregar|error loading/i).first()
    ).toBeVisible({ timeout: 15_000 });
    const retryBtn = page.getByRole("button", {
      name: /tentar novamente|retry/i,
    });
    await expect(retryBtn.first()).toBeVisible({ timeout: 5_000 });
    // Unroute before retry so reload can succeed
    await page.unroute("**/api/creative-work**").catch(() => undefined);
    await retryBtn.first().click();
    await page.waitForURL(/\/campaigns/, { timeout: 20_000 }).catch(() => undefined);
    await waitTrabalhosHydrated(page);
    const retryVisible = true;

    const parts = {
      empty: emptyOk,
      loading: loadingOk,
      error: true,
      retry: retryVisible,
      homeContinue,
    };
    // retry button required by roteiro for error surface
    const ok =
      parts.empty &&
      parts.loading &&
      parts.error &&
      parts.retry &&
      parts.homeContinue;

    appendResult(
      {
        id: "S12",
        title: "Empty / loading / error / retry",
        status: ok ? "pass" : "fail",
        url: page.url(),
        viewport: "1440x900",
        notes: JSON.stringify(parts),
        screenshot: await shot(page, "uat-50-S12-desktop"),
        consoleErrors: collectors
          .unexpectedConsole()
          .filter((l) => !/500|uat_forced|Failed to load resource/i.test(l)),
        networkErrors: [],
      },
      UAT_EMAIL
    );
    // eslint-disable-next-line no-console
    console.log(
      `[UAT] S12 ${ok ? "PASS" : "FAIL"} — ${JSON.stringify(parts)}`
    );
    expect(ok, JSON.stringify(parts)).toBe(true);
    await context.close();
  });
});
