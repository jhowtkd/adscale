import path from "node:path";
import { expect, test } from "@playwright/test";
import { dismissCookieBanner, hasHorizontalOverflow } from "./support/guest-home";

const axePath = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");

test("home pública permite começar sem consultar dados privados", async ({ page }) => {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/(client-profiles|creative-work|campaigns|billing)(\/|$)/.test(pathname))
      forbidden.push(pathname);
  });
  await page.goto("/hi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sua marca");
  await page.getByLabel("Descreva o que você precisa criar").fill("Anúncio de lançamento");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#ag-dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar e continuar" })).toBeVisible();
  expect(forbidden).toEqual([]);
});

test("não cria rolagem horizontal na largura mínima", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/hi");
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("larguras 390–1920 sem overflow e com CTA alcançável", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/hi");
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await expect(page.locator('[data-action="continue"]').first()).toBeVisible();
  }
});

test("exemplo com formulário vazio preenche sem inventar", async ({ page }) => {
  await page.goto("/hi");
  await page.locator('[data-action="use-example"]').first().click();
  const value = await page.getByLabel("Descreva o que você precisa criar").inputValue();
  expect(value.length).toBeGreaterThan(20);
  await expect(page.locator("#ag-dialog")).toBeHidden();
});

test("exemplo com pedido escrito pede confirmação antes de substituir", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill("Meu pedido original");
  await page.locator('[data-action="use-example"]').first().click();
  await expect(page.locator("#ag-dialog")).toContainText("Trocar o texto do seu pedido?");
  await page.getByRole("button", { name: "Manter meu pedido" }).click();
  await expect(page.getByLabel("Descreva o que você precisa criar")).toHaveValue("Meu pedido original");
});

test("HTML no pedido é mostrado como texto, sem execução", async ({ page }) => {
  await page.goto("/hi");
  await page.getByLabel("Descreva o que você precisa criar").fill('<img src=x onerror="alert(1)">');
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#ag-dialog")).toBeVisible();
  expect(await page.locator("img[src='x']").count()).toBe(0);
});

test("teclado: foco, Escape e retorno de foco íntegros", async ({ page }, testInfo) => {
  await page.goto("/hi");
  const composer = page.getByLabel("Descreva o que você precisa criar");
  await composer.fill("Pedido pelo teclado");
  await composer.click();
  // Safari tabs through text fields only; Option+Tab covers every control.
  const advance = testInfo.project.name.includes("webkit") ? "Alt+Tab" : "Tab";
  for (let step = 0; step < 12; step += 1) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-action"));
    if (focused === "continue") break;
    await page.keyboard.press(advance);
  }
  await expect(page.locator("[data-action='continue']:focus").first()).toBeAttached();
  await page.keyboard.press("Enter");
  const dialog = page.locator("#ag-dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-action='continue']:focus").first()).toBeAttached();
});

test("zoom 200% e movimento reduzido mantêm a ação principal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/hi");
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  await expect(page.locator('[data-action="continue"]').first()).toBeVisible();
  await page.getByLabel("Descreva o que você precisa criar").fill("Pedido com zoom");
  await page.locator('[data-action="continue"]').first().click();
  await expect(page.locator("#ag-dialog")).toBeVisible();
});

test("axe: zero violações críticas ou sérias", async ({ page }) => {
  await page.goto("/hi");
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    // @ts-expect-error injected by axe-core
    return window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  });
  const serious = (results.violations as { impact?: string }[]).filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );
  expect(serious).toEqual([]);
});

test("banner de cookies não cobre o CTA no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hi");
  await dismissCookieBanner(page);
  const cta = page.locator('[data-action="continue"]').first();
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest('[data-action="continue"]') != null;
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  expect(hit).toBe(true);
});
