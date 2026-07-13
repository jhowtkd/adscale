/**
 * Phase 6 Gate 6 UAT — live browser.
 * Requires: app :3000, `npm run seed:phase6-uat`, seed-dev-admin.
 * Fresh evidence only (no smoke reuse).
 */
import fs from "node:fs";
import { test } from "@playwright/test";
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
} from "./support/phase6-uat-auth";

function record(collectors: ScenarioCollectors, r: ScenarioResult) {
  const gated = collectors.applyHardGates(r);
  appendResult(gated, UAT_EMAIL);
  // eslint-disable-next-line no-console
  console.log(
    `[UAT] ${gated.id} ${gated.status.toUpperCase()} — ${gated.title}: ${gated.notes}`
  );
}

test.describe.configure({ mode: "default" });

test.describe("Phase 6 Gate 6 UAT", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    // Fresh report for this run
    ensureEvidenceDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prev = evidencePath("RESULTS.json");
    if (fs.existsSync(prev)) {
      fs.renameSync(prev, evidencePath(`RESULTS-archive-${stamp}.json`));
    }
    const prevMd = evidencePath("RESULTS.md");
    if (fs.existsSync(prevMd)) {
      fs.renameSync(prevMd, evidencePath(`RESULTS-archive-${stamp}.md`));
    }
  });

  test("S05 product fixes: count title + workStates + no IntlError", async ({
    browser,
  }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/campaigns");
      await page
        .getByText(fixture.campaignName)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => undefined);

      // Prefer product title (not any sr-only landmark)
      const h1 = await page
        .locator("h1.product-page-title")
        .first()
        .innerText({ timeout: 15_000 })
        .catch(() => "");
      const main = await page.locator("main").innerText().catch(() => "");

      const hasCount = /\d+\s+(trabalhos|works)/i.test(h1);
      const rawKey =
        /campaign\.v6\.worksTitle|\{count\}/i.test(h1) ||
        /campaign\.v6\.worksTitle/i.test(main);
      const rawIntending = /\bintending\b/i.test(main);
      const rawReviewing =
        /\breviewing\b/i.test(main) && !/em revisão|in review/i.test(main);
      const translated =
        /em briefing|briefing pronto|em revisão|gerando|in briefing|brief ready|in review/i.test(
          main
        );

      const intlInConsole = collectors
        .unexpectedConsole()
        .some((l) => /IntlError|FORMATTING_ERROR|count/i.test(l));

      let status: ScenarioResult["status"] = "pass";
      const notes: string[] = [`h1=${JSON.stringify(h1)}`];
      if (!hasCount || rawKey) {
        status = "fail";
        notes.push("title count/i18n broken");
      }
      if (rawIntending || rawReviewing) {
        status = "fail";
        notes.push("raw funnel state visible");
      }
      if (!translated) {
        status = "fail";
        notes.push("no translated work state labels found");
      }
      if (intlInConsole) {
        status = "fail";
        notes.push("IntlError still in console");
      }

      record(collectors, {
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
    } finally {
      await context.close();
    }
  });

  test("S02 create campaign full path", async ({ browser }) => {
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/");
      const newWork = page.getByRole("button", {
        name: /novo trabalho|new work/i,
      });
      await newWork.click();
      await page.locator('a[href="/campaigns?new=1"]').click();
      await page.waitForURL(/\/campaigns/, { timeout: 20_000 });

      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible", timeout: 15_000 });
      const name = `UAT S02 ${Date.now()}`;
      await dialog.locator("#campaign-name").fill(name);
      await dialog.locator("#campaign-client").fill("UAT Client");
      await dialog
        .getByRole("button", { name: /criar|create|salvar|save|continuar/i })
        .first()
        .click();

      await page
        .waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, { timeout: 45_000 })
        .catch(() => undefined);
      const m = page.url().match(/\/campaigns\/([0-9a-f-]{8,})/i);
      if (!m) {
        record(collectors, {
          id: "S02",
          title: "New campaign create + redirect",
          status: "fail",
          url: page.url(),
          viewport: "1440x900",
          notes: "no redirect to /campaigns/{id}",
          screenshot: await shot(page, "uat-50-S02-desktop"),
          consoleErrors: [],
          networkErrors: [],
        });
        return;
      }
      await gotoApp(page, "/campaigns");
      const listed = await page
        .getByText(name)
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
      record(collectors, {
        id: "S02",
        title: "New campaign create + redirect",
        status: listed ? "pass" : "fail",
        url: page.url(),
        viewport: "1440x900",
        notes: listed
          ? `campaignId=${m[1]} name=${name} listed`
          : `created ${m[1]} not listed`,
        screenshot: await shot(page, "uat-50-S02-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { campaignId: m[1], name },
      });
    } finally {
      await context.close();
    }
  });

  test("S04 continue campaign + post workId", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      // Prefer direct post resume proof (deterministic workId)
      await gotoApp(page, fixture.workResumeHref);
      const postOk =
        page.url().includes("workId=") &&
        page.url().includes(fixture.workId);
      const wizard = await page
        .getByTestId("create-post-wizard")
        .or(page.getByRole("heading", { name: /criar post|create post/i }))
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      // Campaign continue from home
      await gotoApp(page, "/");
      const continueLink = page
        .locator('a[href*="/campaigns/"], a[href*="workId"]')
        .filter({ hasText: /continuar de onde parei|continue where/i });
      const hasContinue = await continueLink
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      let continueHref = "";
      let continueLanded = "";
      if (hasContinue) {
        continueHref = (await continueLink.first().getAttribute("href")) ?? "";
        await continueLink.first().click({ force: true });
        await page.waitForTimeout(1500);
        continueLanded = page.url();
      }

      const campaignContinue =
        continueLanded.includes("/campaigns/") ||
        continueHref.includes("/campaigns/");
      const postContinue =
        continueHref.includes("workId") ||
        continueLanded.includes("workId") ||
        (postOk && wizard);

      let status: ScenarioResult["status"] = "fail";
      if (postOk && wizard && (campaignContinue || hasContinue)) {
        status = "pass";
      } else if (postOk && wizard) {
        status = "fail";
        // post path proven via fixture; continue may prefer campaign
        if (campaignContinue) status = "pass";
      }

      // If post wizard works via workId and continue exists for campaign, pass
      if (postOk && wizard && campaignContinue) status = "pass";
      else if (postOk && wizard && !hasContinue) status = "fail";
      else if (!postOk || !wizard) status = "fail";
      else if (postOk && wizard && hasContinue) status = "pass";

      record(collectors, {
        id: "S04",
        title: "Continue campaign + post workId",
        status,
        url: page.url(),
        viewport: "1440x900",
        notes: `postWorkId=${postOk} wizard=${wizard} continueHref=${continueHref} continueLanded=${continueLanded}`,
        screenshot: await shot(page, "uat-50-S04-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { workId: fixture.workId, campaignId: fixture.campaignId },
      });
    } finally {
      await context.close();
    }
  });

  test("S10 template materialize", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/templates");
      // Prefer card for seeded template
      const card = page.getByText(fixture.templateName).first();
      await card.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
      const useBtn = page
        .getByRole("button", {
          name: /materializ|usar|use template|criar campanha|use/i,
        })
        .first();
      // Try click on template then materialize, or direct button near name
      if (await card.isVisible().catch(() => false)) {
        await card.click({ force: true }).catch(() => undefined);
      }
      const btnVisible = await useBtn
        .isVisible({ timeout: 8_000 })
        .catch(() => false);
      if (!btnVisible) {
        // API materialize fallback is NOT UI path — mark fail for missing UI
        record(collectors, {
          id: "S10",
          title: "Template materialize",
          status: "fail",
          url: page.url(),
          viewport: "1440x900",
          notes: `template ${fixture.templateName} not actionable in UI`,
          screenshot: await shot(page, "uat-50-S10-desktop"),
          consoleErrors: [],
          networkErrors: [],
        });
        return;
      }
      await useBtn.click({ force: true });
      await page
        .waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, { timeout: 45_000 })
        .catch(() => undefined);
      const m = page.url().match(/\/campaigns\/([0-9a-f-]{8,})/i);
      if (!m) {
        record(collectors, {
          id: "S10",
          title: "Template materialize",
          status: "fail",
          url: page.url(),
          viewport: "1440x900",
          notes: "materialize click without campaign redirect",
          screenshot: await shot(page, "uat-50-S10-desktop"),
          consoleErrors: [],
          networkErrors: [],
        });
        return;
      }
      await gotoApp(page, "/campaigns");
      const listed = await page
        .locator(`a[href*="${m[1]}"]`)
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
      record(collectors, {
        id: "S10",
        title: "Template materialize",
        status: listed ? "pass" : "fail",
        url: page.url(),
        viewport: "1440x900",
        notes: listed
          ? `materialized ${m[1]} listed`
          : `materialized ${m[1]} missing from list`,
        screenshot: await shot(page, "uat-50-S10-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { campaignId: m[1] },
      });
    } finally {
      await context.close();
    }
  });

  test("S12 empty + loading + error/retry (home + trabalhos)", async ({
    browser,
  }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);

    // --- empty via deterministic search ---
    collectors.mark();
    await gotoApp(page, "/campaigns");
    const search = page.getByRole("searchbox").or(
      page.locator('input[type="search"]')
    );
    await search.first().fill(fixture.emptySearch);
    await page.waitForTimeout(800);
    const emptyVisible = await page
      .getByText(/nenhum|no works|sem resultados|empty|não encontr/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    // clear filters control
    const clear = page.getByRole("button", {
      name: /limpar|clear|reset/i,
    });
    const hasClear = await clear.first().isVisible().catch(() => false);

    // --- loading via route delay ---
    collectors.mark();
    let sawLoading = false;
    await page.route("**/api/**/canonical-works**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.route("**/api/campaigns**", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((r) => setTimeout(r, 1200));
      }
      await route.continue();
    });
    const loadingPromise = page
      .locator(".animate-pulse, [aria-busy=true]")
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    await gotoApp(page, "/campaigns");
    sawLoading = await loadingPromise;
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);

    // --- error + retry ---
    collectors.mark();
    await page.route("**/api/**/canonical-works**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "uat_forced_error" }),
      })
    );
    await page.route("**/api/campaigns?**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "uat_forced_error" }),
        });
      }
      return route.continue();
    });
    await gotoApp(page, "/campaigns");
    const errorVisible = await page
      .getByText(/erro|error|falha|failed|não foi possível|try again|tentar/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const retry = page.getByRole("button", {
      name: /tentar|retry|recarregar|reload/i,
    });
    const hasRetry = await retry.first().isVisible().catch(() => false);
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);

    // Home continue empty-ish: search doesn't apply; check continue block exists
    await gotoApp(page, "/");
    const continueBlock = await page
      .getByText(/continuar de onde parei|continue where/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    const parts = {
      empty: emptyVisible || hasClear,
      loading: sawLoading,
      error: errorVisible,
      retry: hasRetry,
      homeContinue: continueBlock,
    };
    const ok =
      parts.empty &&
      parts.loading &&
      parts.error &&
      parts.retry &&
      parts.homeContinue;

    // Forced 500s are intentional for this scenario — do not hard-gate on them
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
          .filter((l) => !/500|uat_forced/i.test(l)),
        networkErrors: [],
      },
      UAT_EMAIL
    );
    // eslint-disable-next-line no-console
    console.log(
      `[UAT] S12 ${ok ? "PASS" : "FAIL"} — Empty/loading/error/retry: ${JSON.stringify(parts)}`
    );
    await context.close();
  });

  test("S13 mobile nav", async ({ browser }) => {
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, "/");
      const nav = page.getByRole("navigation", {
        name: /primary mobile navigation/i,
      });
      const ok =
        (await nav.isVisible().catch(() => false)) &&
        (await nav.locator('a[href="/"]').isVisible().catch(() => false)) &&
        (await nav.locator('a[href="/campaigns"]').isVisible().catch(() => false)) &&
        (await nav.locator('a[href="/library"]').isVisible().catch(() => false)) &&
        (await nav.locator('a[href="/brand-kit"]').isVisible().catch(() => false));
      await nav.getByRole("button").first().click({ force: true });
      await page.waitForTimeout(400);
      const settingsMore = await page
        .getByRole("dialog")
        .locator('a[href="/settings"]')
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      record(collectors, {
        id: "S13",
        title: "Mobile nav",
        status: ok && settingsMore ? "pass" : "fail",
        url: page.url(),
        viewport: "390x844",
        notes: `primary=${ok} settingsMore=${settingsMore}`,
        screenshot: await shot(page, "uat-50-S13-mobile"),
        consoleErrors: [],
        networkErrors: [],
      });
    } finally {
      await context.close();
    }
  });

  test("S06 stages on seeded campaign", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, `/campaigns/${fixture.campaignId}`);
      await page
        .getByRole("button", { name: /briefing/i })
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .catch(() => undefined);
      const has =
        (await page.getByRole("button", { name: /briefing/i }).first().isVisible().catch(() => false)) &&
        (await page.getByRole("button", { name: /produzir|produce/i }).first().isVisible().catch(() => false)) &&
        (await page.getByRole("button", { name: /revisar|review/i }).first().isVisible().catch(() => false)) &&
        (await page.getByRole("button", { name: /entregar|deliver/i }).first().isVisible().catch(() => false));
      if (has) {
        await page.getByRole("button", { name: /revisar|review/i }).first().click({ force: true });
        await page.waitForTimeout(400);
        const rev = await page.locator("#mission-review").isVisible().catch(() => false);
        await page.getByRole("button", { name: /entregar|deliver/i }).first().click({ force: true });
        await page.waitForTimeout(400);
        const share = await page.locator("#mission-share").isVisible().catch(() => false);
        record(collectors, {
          id: "S06",
          title: "Workspace stages",
          status: rev && share ? "pass" : "fail",
          url: page.url(),
          viewport: "1440x900",
          notes: `review=${rev} share=${share}`,
          screenshot: await shot(page, "uat-50-S06-desktop"),
          consoleErrors: [],
          networkErrors: [],
        });
      } else {
        record(collectors, {
          id: "S06",
          title: "Workspace stages",
          status: "fail",
          url: page.url(),
          viewport: "1440x900",
          notes: "stage buttons missing",
          screenshot: await shot(page, "uat-50-S06-desktop"),
          consoleErrors: [],
          networkErrors: [],
        });
      }
    } finally {
      await context.close();
    }
  });
});
