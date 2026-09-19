import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Visitor island proof (#440): request form, protocol picker, examples,
 * immutable local drafts with resume, and honestly-disabled attachments.
 *
 * The island renders only when the server runs with the public-home flags
 * on (PUBLIC_STUDIO_HOME_ENABLED + IMPORT). Against a default-flags server
 * these tests detect the fallback and skip with a reason instead of failing;
 * #446 boots the home-enabled server in the dedicated guest-home project.
 * Real browser storage (IndexedDB + localStorage) is exercised — never
 * in-memory fakes.
 */

async function islandOrSkip(page: Page): Promise<boolean> {
  await page.goto("/hi", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  if (await page.locator('[data-public-home-mode="fallback"]').count()) {
    test.skip(true, "server runs with home flags off (fallback renders)");
    return false;
  }
  await expect(page.getByRole("main")).toHaveAttribute("id", "main");
  return true;
}

test.describe("visitor island (#440)", () => {
  test("renders composer, protocols and examples", async ({ page }) => {
    if (!(await islandOrSkip(page))) return;
    await expect(
      page.getByRole("heading", { name: /o que vamos criar/i }),
    ).toBeVisible();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toBeVisible();
    // The group buttons carry the full labels; the short names render in
    // the gallery items and the prepared summary (#446).
    for (const protocol of ["Criar uma peça", "Criar variações", "Adaptar um formato"]) {
      await expect(
        page.getByRole("group", { name: /tipo de criação/i }).getByText(protocol, { exact: false }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /usar este exemplo/i }).first(),
    ).toBeVisible();
  });

  test("empty request takes the example; existing text asks before replacing", async ({
    page,
  }) => {
    if (!(await islandOrSkip(page))) return;
    const composer = page.getByLabel(/descreva o que você precisa criar/i);
    await page
      .getByRole("button", { name: /usar este exemplo|criar minhas variações|adaptar minha criação/i })
      .first()
      .click();
    await expect(composer).not.toBeEmpty();
    await composer.fill("meu texto próprio");
    await page.getByRole("button", { name: /ver mais exemplos/i }).click();
    await page.locator(".ag-gallery-item").first().click();
    await page
      .getByRole("button", { name: /usar como ponto de partida/i })
      .click();
    await expect(page.locator("#ag-dialog-title")).toContainText(
      "Trocar o texto",
    );
    await expect(composer).toHaveValue("meu texto próprio");
    await page.getByRole("button", { name: /usar o exemplo/i }).click();
    await expect(composer).not.toHaveValue("meu texto próprio");
  });

  test("attachments stay off with guidance, even programmatically", async ({
    page,
  }) => {
    if (!(await islandOrSkip(page))) return;
    if (await page.getByRole("button", { name: /anexar/i }).count()) {
      test.skip(true, "server runs with attachments on (journey B)");
      return;
    }
    await expect(
      page.getByText(/adicione referências depois, no estúdio/i),
    ).toBeVisible();
    const accepted = await page.evaluate(() => {
      const composer = document.querySelector(
        "#ag-composer",
      ) as HTMLElement | null;
      if (!composer) return "no-composer";
      const file = new File([new Uint8Array(10)], "prog.png", {
        type: "image/png",
      });
      const drop = new Event("drop", { bubbles: true }) as Event & {
        dataTransfer: DataTransfer | null;
      };
      Object.defineProperty(drop, "dataTransfer", {
        value: { files: [file] },
      });
      composer.dispatchEvent(drop);
      return document.querySelectorAll("#ag-files .ag-file-chip").length;
    });
    expect(accepted).toBe(0);
  });

  test("continue commits locally first; same-profile return offers resume", async ({
    page,
  }) => {
    if (!(await islandOrSkip(page))) return;
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("Pedido de retomada local");
    await page.getByRole("button", { name: /continuar/i }).first().click();
    await page.getByRole("button", { name: /entrar e continuar/i }).click();
    await page.waitForURL((url) => url.pathname !== "/hi", {
      timeout: 30_000,
    });
    const resumeUrl = page.url();
    expect(resumeUrl).toContain("guestDraft");
    expect(resumeUrl).not.toContain("Pedido");
    await page.goto("/hi", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expect(page.locator("#ag-resume-banner")).toBeVisible();
    await expect(page.locator("#ag-resume-banner")).toContainText(
      /pedido salvo neste navegador/i,
    );
  });

  test("fresh profile gets an honest empty state, never a fabricated restore", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/hi", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    if (await page.locator('[data-public-home-mode="fallback"]').count()) {
      test.skip(true, "server runs with home flags off (fallback renders)");
      await context.close();
      return;
    }
    await expect(page.locator("#ag-resume-banner")).toBeHidden();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toBeEmpty();
    await context.close();
  });

  test("visitor markup renders as literal text", async ({ page }) => {
    if (!(await islandOrSkip(page))) return;
    const payload = "<img src=x onerror=alert(1)>";
    await page.getByLabel(/descreva o que você precisa criar/i).fill(payload);
    await page.getByRole("button", { name: /continuar/i }).first().click();
    const dialog = page.locator("#ag-dialog");
    await expect(dialog.locator(".ag-summary p")).toHaveText(payload);
    expect(await dialog.locator("img").count()).toBe(0);
  });

  test("home pública permite começar sem consultar dados privados", async ({ page }) => {
    const forbidden: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (/^\/api\/(client-profiles|creative-work|campaigns|billing)(\/|$)/.test(pathname))
        forbidden.push(pathname);
    });
    if (!(await islandOrSkip(page))) return;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("sua marca");
    await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("#ag-dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar e continuar" })).toBeVisible();
    expect(forbidden).toEqual([]);
  });

  test("não cria rolagem horizontal na largura mínima", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    if (!(await islandOrSkip(page))) return;
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("visit issues zero private-data requests", async ({ page }) => {
    const privateHits: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/brands|trabalhos|works|campaigns|campanhas|billing|cobran|checkout|trial/i.test(url)) {
        privateHits.push(url);
      }
    });
    if (!(await islandOrSkip(page))) return;
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("navegação sem dados privados");
    await page.getByRole("button", { name: /continuar/i }).first().click();
    await page.getByRole("button", { name: /continuar explorando/i }).click();
    expect(privateHits).toEqual([]);
  });

  test("360–1920px sem overflow, corte ou CTA coberto", async ({
    page,
  }) => {
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      if (!(await islandOrSkip(page))) return;
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
      const cta = page.locator('[data-action="continue"]');
      await expect(cta, `CTA visible at ${width}px`).toBeVisible();
      // The CTA must be clickable, not covered by banner, toast, or menu.
      const box = await cta.boundingBox();
      expect(box, `CTA box at ${width}px`).not.toBeNull();
      const covered = await page.evaluate(({ x, y }) => {
        const top = document.elementFromPoint(x, y);
        if (!top) return "no-hit";
        if (top.closest('[data-action="continue"]')) return null;
        return (
          top.closest("[id],[role]")?.outerHTML.slice(0, 120) ?? "unknown"
        );
      }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
      expect(covered, `CTA covered at ${width}px`).toBeNull();
    }
  });

  test("keyboard, Escape and focus survive the dialog", async ({ page }, testInfo) => {
    if (!(await islandOrSkip(page))) return;
    const composer = page.getByLabel(/descreva o que você precisa criar/i);
    await composer.fill("Pedido navegável por teclado");
    await composer.focus();
    // Tab order reaches the primary action without a keyboard trap; with
    // attachments on, the Anexar button comes first (#446). WebKit follows
    // the Safari default where bare Tab skips buttons, so use the platform
    // full-keyboard-navigation modifier there.
    const tabKey = testInfo.project.name.includes("webkit") ? "Alt+Tab" : "Tab";
    const primary = page.locator('[data-action="continue"]');
    for (let tab = 0; tab < 4; tab++) {
      if (await primary.evaluate((el) => document.activeElement === el)) break;
      await page.keyboard.press(tabKey);
    }
    await expect(primary).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.locator("#ag-dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Native dialog close returns focus to the opener (#446).
    await expect(primary).toBeFocused();
  });

  test("zoom 200% keeps the flow usable", async ({ page }) => {
    if (!(await islandOrSkip(page))) return;
    await page.evaluate(() => {
      document.body.style.zoom = "200%";
    });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.locator('[data-action="continue"]')).toBeVisible();
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("Pedido com zoom");
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("#ag-dialog")).toBeVisible();
  });

  test("reduced motion still completes the flow", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    if (!(await islandOrSkip(page))) {
      await context.close();
      return;
    }
    const reduced = await page.evaluate(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reduced).toBe(true);
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("Pedido com movimento reduzido");
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("#ag-dialog")).toBeVisible();
    await context.close();
  });

  test("axe reports zero critical or serious violations", async ({
    page,
  }) => {
    if (!(await islandOrSkip(page))) return;
    const home = await new AxeBuilder({ page }).analyze();
    const homeBlocking = home.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(
      homeBlocking,
      JSON.stringify(homeBlocking.map((violation) => violation.id)),
    ).toEqual([]);
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("Pedido auditado");
    await page.locator('[data-action="continue"]').click();
    const dialog = page.locator("#ag-dialog");
    await expect(dialog).toBeVisible();
    const dialogResults = await new AxeBuilder({ page })
      .include("#ag-dialog")
      .analyze();
    const dialogBlocking = dialogResults.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(
      dialogBlocking,
      JSON.stringify(dialogBlocking.map((violation) => violation.id)),
    ).toEqual([]);
  });

  test("gallery neither hijacks scroll nor covers the composer", async ({
    page,
  }) => {
    if (!(await islandOrSkip(page))) return;
    // The topbar search opens the gallery; the section and dialog carry the
    // same action (#446).
    await page.locator('[data-action="gallery"][aria-label="Pesquisar exemplos"]').click();
    const dialog = page.locator("#ag-dialog");
    await expect(dialog).toBeVisible();
    const scrolled = await page.evaluate(() => window.scrollY);
    // Opening the gallery keeps the page position; images load with size.
    expect(scrolled).toBe(0);
    const images = dialog.locator("img");
    expect(await images.count()).toBeGreaterThan(0);
    for (let index = 0; index < (await images.count()); index += 1) {
      const size = await images.nth(index).evaluate((img: HTMLImageElement) => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }));
      expect(size.complete).toBe(true);
      expect(size.naturalWidth).toBeGreaterThan(0);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toBeVisible();
  });

  test("island works with the old marketing host blocked", async ({
    page,
  }) => {
    const oldHostHits: string[] = [];
    await page.route(
      (routeUrl) => routeUrl.hostname === "adscale-marketing.onrender.com",
      async (route) => {
        oldHostHits.push(route.request().url());
        await route.abort();
      },
    );
    if (!(await islandOrSkip(page))) return;
    await page
      .getByLabel(/descreva o que você precisa criar/i)
      .fill("Pedido sem o serviço antigo");
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("#ag-dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar e continuar" }),
    ).toBeVisible();
    // Fallback rehearsal with pending-draft drain (#447): the old host
    // stays blocked while the draft saves through the same service and
    // resumes after a reload — the pending request survives.
    await page.getByRole("button", { name: "Entrar e continuar" }).click();
    await page.waitForURL((url) => url.pathname !== "/hi", {
      timeout: 30_000,
    });
    await page.goto("/hi", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const banner = page.locator("#ag-resume-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: /retomar/i }).click();
    await expect(
      page.getByLabel(/descreva o que você precisa criar/i),
    ).toHaveValue("Pedido sem o serviço antigo");
    expect(oldHostHits).toEqual([]);
  });
});
