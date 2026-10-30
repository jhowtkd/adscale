/**
 * Phase 6 Gate 6 UAT (item 50)
 *
 * Blocks:
 *   no-provider: S05 → S04 → S12
 *   provider:    S03 → S11  (+ Inngest for S03 generate)
 *
 * Caminho único: `/` is the conversation and the composer lives at /creative-work/new, so the scenarios that opened
 * the Studio home at `/` (S01 composer, S02 "Novo trabalho", S12's home empty/loading/error, S13 classic mobile
 * navigation, S14 classic Assistant) and S10 (the /templates card gallery, gone: /templates redirects to the composer;
 * template-materialize.spec.ts covers a template entering a draft) are gone; S03 and S04 open the composer where it is.
 *
 * The Campaign page is a grouping now: its stage strip, strategy dialog and pilot gate are gone, and S06, S07, S08, S09
 * and the workspace "generating" + recipe parts of S12 went with them (#793). preview-gate.test.ts,
 * resolve-workspace-produce-surface.test.ts and the strategy-recipe resolve route test keep the server contract.
 *
 * Requires:
 *   - optimized local build on :3000 with E2E_DISABLE_RATE_LIMIT=true and
 *     E2E_CONTROLLED_PROVIDER=true (test config, localhost only)
 *   - inngest-cli dev -u http://localhost:3000/api/inngest (provider block)
 *   - npm run seed:phase6-uat
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Route } from "@playwright/test";
import {
  ScenarioCollectors,
  type ScenarioResult,
  appendResult,
  ensureEvidenceDir,
  evidencePath,
  failureResultFromTest,
  shot,
} from "./support/uat-evidence";
import {
  UAT_EMAIL,
  UAT_VIEWPORT_LABEL,
  dismissOverlays,
  gotoApp,
  loadPhase6Fixture,
  openAuthedPage,
  waitTrabalhosHydrated,
  waitCampaignWorkspace,
} from "./support/phase6-uat-auth";

function record(collectors: ScenarioCollectors, r: ScenarioResult) {
  const gated = collectors.applyHardGates(r);
  appendResult(gated, UAT_EMAIL);
  console.log(
    `[UAT] ${gated.id} ${gated.status.toUpperCase()} — ${gated.title}: ${gated.notes}`
  );
  return gated;
}

test.describe.configure({ mode: "default" });

test.afterEach(async ({}, testInfo) => {
  const failure = failureResultFromTest({
    title: testInfo.title,
    status: testInfo.status,
    errorMessage: testInfo.error?.message,
    projectName: UAT_VIEWPORT_LABEL,
  });
  if (failure) appendResult(failure, UAT_EMAIL);
});

test.describe("Phase 6 Gate 6 UAT no-provider block", () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    if (process.env.PHASE6_UAT_RESET_EVIDENCE !== "true") return;
    ensureEvidenceDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const name of ["RESULTS.json", "RESULTS.md"] as const) {
      const p = evidencePath(name);
      if (fs.existsSync(p)) {
        fs.renameSync(p, evidencePath(`${name}.archive-${stamp}`));
      }
    }
  });

  test("S05 product fixes: Criações title + workStates + clean console", async ({
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
      await expect(page.getByText(fixture.campaignName).last()).toBeVisible({
        timeout: 15_000,
      });

      const h1 = await page.locator("h1.product-page-title").innerText();
      const main = await page.locator("main").innerText();

      // Criações no longer counts in its title (Task 5): it carries the product's own title, never a raw key.
      const hasTitle = /^(todas as criações|all creations)$/i.test(h1.trim());
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
      if (!hasTitle || rawKey) {
        status = "fail";
        notes.push("title missing or raw i18n key");
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
        title: "Criações i18n + canonical states",
        status,
        url: page.url(),
        viewport: UAT_VIEWPORT_LABEL,
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

  test("S04 continue campaign + post workId", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      // --- post workId path (deterministic fixture) ---
      await gotoApp(page, `/?workId=${fixture.workId}`);
      await page.waitForURL(
        (u) =>
          u.searchParams.get("workId") === fixture.workId ||
          u.href.includes(fixture.workId),
        { timeout: 20_000 }
      );
      await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i }))
        .toBeVisible({ timeout: 20_000 });

      // --- campaign continue from the composer's stage (seed: campaign is freshest in-progress) ---
      await gotoApp(page, "/creative-work/new");
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
      await page.waitForURL(/\/campaigns\/[0-9a-f-]{8,}/i, {
        timeout: 20_000,
        waitUntil: "commit",
      });
      await waitCampaignWorkspace(page);
      const landed = page.url();

      const result = record(collectors, {
        id: "S04",
        title: "Continue campaign + post workId",
        status: "pass",
        url: landed,
        viewport: UAT_VIEWPORT_LABEL,
        notes: `post workId composer ok; continueHref=${href} landed=${landed}`,
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

  test("S12 empty + loading + error/retry", async ({ browser }) => {
    test.setTimeout(480_000);
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      const parts: Record<string, boolean> = {};

      // --- Trabalhos: empty ---
      await gotoApp(page, "/campaigns");
      await waitTrabalhosHydrated(page);
      const search = page.locator('input[type="search"]');
      await search.fill(fixture.emptySearch);
      await expect(
        page.getByText(/nenhum trabalho corresponde|no work matches/i).first()
      ).toBeVisible({ timeout: 10_000 });
      parts.worksEmpty = true;
      console.log("[UAT] S12 works empty ok");

      // --- Trabalhos: loading ---
      let releaseWorksLoading!: () => void;
      const worksLoadingGate = new Promise<void>((resolve) => {
        releaseWorksLoading = resolve;
      });
      const worksLoadingRoute = async (route: Route) => {
        await worksLoadingGate;
        await route.continue();
      };
      await page.route("**/api/creative-work**", worksLoadingRoute);
      await gotoApp(page, "/campaigns");
      await expect(page.locator(".animate-pulse").last()).toBeVisible({
        timeout: 10_000,
      });
      parts.worksLoading = true;
      console.log("[UAT] S12 works loading ok");
      const worksLoadingResponse = page.waitForResponse(
        (response) => response.url().includes("/api/creative-work"),
        { timeout: 20_000 }
      );
      releaseWorksLoading();
      await worksLoadingResponse;
      await page.unroute("**/api/creative-work**", worksLoadingRoute);
      await waitTrabalhosHydrated(page);

      // --- Trabalhos: error + retry ---
      const worksErrorRoute = async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "uat_works_error" }),
        });
      };
      await page.route("**/api/creative-work**", worksErrorRoute);
      await gotoApp(page, "/campaigns");
      await expect(
        page.getByText(/erro ao carregar|error loading/i).first()
      ).toBeVisible({ timeout: 15_000 });
      const worksRetry = page.getByRole("button", {
        name: /tentar novamente|retry/i,
      }).first();
      await expect(worksRetry).toBeVisible();
      parts.worksError = true;
      await page.unroute("**/api/creative-work**", worksErrorRoute);
      await worksRetry.click();
      await waitTrabalhosHydrated(page);
      parts.worksRetry = true;
      console.log("[UAT] S12 works error/retry ok");

      // --- Workspace: load error + retry ---
      const errorDerivationsPattern = `**/api/campaigns/${fixture.campaignId}/derivations`;
      const workspaceErrorRoute = async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "uat_workspace_error" }),
        });
      };
      await page.route(errorDerivationsPattern, workspaceErrorRoute);
      await gotoApp(page, `/campaigns/${fixture.campaignId}`);
      const workspaceAlert = page
        .locator('[role="alert"]')
        .filter({ hasText: /não foi possível|erro|failed|error/i });
      await expect(workspaceAlert.first()).toBeVisible({ timeout: 90_000 });
      const workspaceRetry = workspaceAlert.getByRole("button", {
        name: /tentar novamente|retry/i,
      });
      await expect(workspaceRetry).toBeVisible();
      parts.workspaceError = true;
      console.log("[UAT] S12 workspace error visible");
      await page.unrouteAll({ behavior: "wait" });
      console.log("[UAT] S12 workspace error route removed");
      await workspaceRetry.evaluate((button: HTMLButtonElement) => button.click());
      console.log("[UAT] S12 workspace retry clicked");
      await expect(workspaceAlert.first()).toBeHidden({ timeout: 60_000 });
      await waitCampaignWorkspace(page);
      parts.workspaceRetry = true;
      console.log("[UAT] S12 workspace error/retry ok");

      const ok = Object.values(parts).every(Boolean);
      appendResult(
        {
          id: "S12",
          title: "Empty / loading / error / retry matrix",
          status: ok ? "pass" : "fail",
          url: page.url(),
          viewport: UAT_VIEWPORT_LABEL,
          notes: JSON.stringify(parts),
          screenshot: await shot(page, "uat-50-S12-matrix"),
          consoleErrors: collectors
            .unexpectedConsole()
            .filter((line) => !/500|uat_(works|workspace)_error|Failed to load resource/i.test(line)),
          networkErrors: [],
        },
        UAT_EMAIL
      );
      console.log(
        `[UAT] S12 ${ok ? "PASS" : "FAIL"} — ${JSON.stringify(parts)}`
      );
      expect(ok, JSON.stringify(parts)).toBe(true);
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Provider block: S03 → S11
// ---------------------------------------------------------------------------

test.describe("Phase 6 Gate 6 UAT provider block", () => {
  // The first provider scenario compiles several App Router handlers under
  // Next dev before dispatching three controlled jobs.
  test.setTimeout(360_000);

  test("S03 create post → generate → list (Inngest lifecycle)", async ({
    browser,
  }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      const profilesResponse = await context.request.get("/api/client-profiles");
      expect(profilesResponse.ok()).toBe(true);
      const profilesPayload = (await profilesResponse.json()) as {
        profiles?: Array<{ id?: string }>;
      };
      expect(
        profilesPayload.profiles?.some(
          (profile) => profile.id === fixture.clientProfileId
        )
      ).toBe(true);
      await page.addInitScript((activeClientProfileId) => {
        localStorage.setItem("adscale-storage", JSON.stringify({
          state: { sidebarCollapsed: false, activeClientProfileId }, version: 0,
        }));
      }, fixture.clientProfileId);
      const billBefore = await context.request.get("/api/billing/status");
      const creditsBefore = billBefore.ok()
        ? ((await billBefore.json()) as {
            billing?: { creditBalance?: number; access?: { kind?: string } };
          })
        : null;

      await gotoApp(page, "/creative-work/new");
      await page.waitForLoadState("domcontentloaded");
      // The active brand is the rail's (desktop) or the top bar's (phone): the visible switcher is titled with its name.
      await expect(page.locator('[data-testid="rail-brand-switcher"]:visible'))
        .toHaveAttribute("title", "Phase6 UAT Brand", { timeout: 30_000 });
      const workName = `UAT S03 ${Date.now()}`;
      const requestText = `${workName}: engajamento para SMB com trial`;
      const box = page.getByTestId("studio-talk-box");
      const composer = page.getByRole("textbox", {
        name: /pedido criativo|creative request/i,
      });
      // Pick the protocol first (picking it later clears the request): the picker is a radio group, revealed by focusing
      // the request or opening the controls.
      const variations = box.getByRole("radio", { name: /^(variações|variations)$/i });
      if (!(await variations.isVisible().catch(() => false))) await composer.focus();
      if (!(await variations.isVisible().catch(() => false))) {
        await box.getByRole("button", { name: /abrir controles|open controls/i }).click();
      }
      await variations.click();
      await composer.fill(requestText);
      await expect(composer).toHaveValue(requestText);
      // The progressive Studio keeps the entry as a local draft until a reference is attached: variations needs one.
      await expect
        .poll(() => new URL(page.url()).searchParams.get("workId"))
        .toBeNull();
      await box.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, "../fixtures/base.png"));
      await expect
        .poll(
          () => new URL(page.url()).searchParams.get("workId"),
          { timeout: 60_000, intervals: [250, 500, 1_000] }
        )
        .toBeTruthy();
      const workId = new URL(page.url()).searchParams.get("workId");
      expect(workId, `expected workId in URL ${page.url()}`).toBeTruthy();
      // The reference is read before the plan can be prepared.
      const source = page.locator("article").filter({ hasText: "base.png" });
      await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i, { timeout: 60_000 });
      const generateBtn = box.locator(".talk-generate");
      await expect(generateBtn).toBeEnabled({ timeout: 60_000 });
      await generateBtn.click();
      await expect(page.getByRole("heading", { name: /revise seu plano|review your plan/i })).toBeVisible();
      const genWait = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/creative-work/${workId}/generate`) &&
          r.request().method() === "POST",
        { timeout: 30_000 }
      );
      await page.getByRole("button", { name: /confirmar e gerar|confirm and generate/i }).click();
      const genRes = await genWait;
      const genBody = await genRes.text().catch(() => "");
      expect([200, 201, 202].includes(genRes.status()), `generate HTTP ${genRes.status()} ${genBody.slice(0, 200)}`).toBeTruthy();
      await expect
        .poll(
          async () => {
            const r = await context.request.get(
              `/api/creative-work/${workId}`
            );
            if (!r.ok()) return "request_failed";
            const j = (await r.json()) as {
              outputs?: Array<{ status?: string }>;
            };
            if (!Array.isArray(j.outputs)) return "missing_outputs";
            return j.outputs
              .map((output) => output.status ?? "unknown")
              .sort()
              .join(",");
          },
          { timeout: 120_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBe("completed,completed,completed");

      const billAfter = await context.request.get("/api/billing/status");
      const creditsAfter = billAfter.ok()
        ? ((await billAfter.json()) as {
            billing?: { creditBalance?: number; access?: { kind?: string } };
          })
        : null;

      await gotoApp(page, "/campaigns");
      await waitTrabalhosHydrated(page);
      // The list names a work by its title or theme, not by the request: find the piece by its own link.
      const listed = await page
        .locator(`main a[href="/creative-work/${workId}"]`)
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      const genStatus = genRes.status();
      const result = record(collectors, {
        id: "S03",
        title: "Create post generate + list",
        status: workId && listed ? "pass" : "fail",
        url: page.url(),
        viewport: UAT_VIEWPORT_LABEL,
        notes: `workId=${workId} name=${workName} gen=${genStatus} listed=${listed} before=${creditsBefore?.billing?.creditBalance} after=${creditsAfter?.billing?.creditBalance} kind=${creditsBefore?.billing?.access?.kind}`,
        screenshot: await shot(page, "uat-50-S03-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: { workId: workId! },
      });
      expect(result.status, result.notes).toBe("pass");
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("S11 completed post is already saved in library", async ({ browser }) => {
    const fixture = loadPhase6Fixture();
    const collectors = new ScenarioCollectors();
    const { context, page } = await openAuthedPage(browser);
    collectors.attach(page);
    collectors.mark();
    try {
      await gotoApp(page, `/?workId=${fixture.libraryWorkId}`);
      await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i }))
        .toBeVisible({ timeout: 20_000 });

      const resultCard = page
        .getByTestId("proposal-level")
        .filter({ has: page.locator('[data-testid="proposal-level-name"]', { hasText: /conservative|conservadora/i }) });
      await expect(resultCard.getByRole("button", { name: /aprovar|approve/i })).toBeVisible({ timeout: 30_000 });
      await gotoApp(page, "/library");
      // Product title is h1 "Biblioteca" (role name may differ by a11y tree)
      await expect(
        page.locator("h1").filter({ hasText: /biblioteca|library/i })
      ).toBeVisible({ timeout: 20_000 });
      const assetsResponse = await context.request.get(
        "/api/workspace/assets?source=creative_work&limit=200"
      );
      expect(assetsResponse.ok()).toBe(true);
      const assetsBody = (await assetsResponse.json()) as {
        assets?: Array<{ id: string; key: string; url: string; name: string }>;
      };
      // The work payload does not expose storage keys: the seed names them after the work.
      const savedAsset = assetsBody.assets?.find((asset) =>
        asset.key.startsWith(`uat/phase6/${fixture.libraryWorkId}-out-`)
      );
      expect(savedAsset, "saved output must be registered in library").toBeTruthy();
      expect(savedAsset?.url).toBe(
        `/api/workspace/assets/${savedAsset?.id}/file`
      );

      const proxyResponse = await context.request.get(savedAsset!.url);
      expect(proxyResponse.ok(), `asset proxy ${proxyResponse.status()}`).toBe(
        true
      );
      expect(proxyResponse.headers()["content-type"]).toMatch(/^image\//);
      // The library pages its images, so reach the saved one by name.
      const findSavedAsset = async () => {
        await expect(async () => {
          await page.getByRole("searchbox").fill(savedAsset!.name);
          await expect(page.locator(`img[src$="${savedAsset!.url}"]`).first()).toBeVisible({
            timeout: 5_000,
          });
        }).toPass({ timeout: 30_000 });
      };
      await findSavedAsset();

      await page.reload({ waitUntil: "commit" });
      await dismissOverlays(page);
      await expect(
        page.locator("h1").filter({ hasText: /biblioteca|library/i })
      ).toBeVisible({ timeout: 20_000 });
      await findSavedAsset();
      const stillLib = page.url().includes("/library");

      const result = record(collectors, {
        id: "S11",
        title: "Completed post auto-saved in library",
        status: stillLib ? "pass" : "fail",
        url: page.url(),
        viewport: UAT_VIEWPORT_LABEL,
        notes: `libraryWorkId=${fixture.libraryWorkId} outputId=${fixture.libraryOutputId} autoSaved=true assetId=${savedAsset?.id} proxy=${proxyResponse.status()} reloadImage=true`,
        screenshot: await shot(page, "uat-50-S11-desktop"),
        consoleErrors: [],
        networkErrors: [],
        createdIds: {
          workId: fixture.libraryWorkId,
          outputId: fixture.libraryOutputId,
        },
      });
      expect(result.status, result.notes).toBe("pass");
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
