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
    for (const protocol of ["Peça única", "Variações", "Adaptar formato"]) {
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
    await expect(page.getByRole("button", { name: /anexar/i })).toHaveCount(0);
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
});
