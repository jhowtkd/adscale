import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import {
  dismissCookieBanner, ensureIdentity, loginAs, openPilotHome, pilotContext, PILOT_EMAIL, stageWithScript, withDb,
  type PilotContext,
} from "./support/pilot-home";

/**
 * Ticket 13, D-12 and T1 of the screen review: an account whose free credit ended before the diagnosis comes back to the conversation (the product
 * invites it: "Você pode sair: aviso quando estiver pronto"). The mesa of the Library phase mounts after the first scroll and pushes the card down; the
 * conversation has to follow, so "Falar com uma pessoa" and its line of support are IN VIEW on arrival, whole, in the windows people really have.
 *
 * The state is the real one: the brand is confirmed with the real "É isso" and the failure is recorded by the module's own command
 * (scripts/pilot-diagnosis-fail.ts, for the pilot's account). Runs against a local server like the other pilot specs (E2E_BASE_URL and
 * TEST_DATABASE_URL; the recipe is in docs/design/verification/fluxo0-09/README.md), as the pilot's free identity. Everything it reads or
 * clears in the database is that account's, so another identity in the same database is left alone.
 */
const WINDOWS = [
  ["1440×900", 1440, 900], ["1280×800", 1280, 800], ["1536×864", 1536, 864], ["1440×820", 1440, 820], ["430×932", 430, 932],
  // Where it was already fine, so a fix cannot trade one window for another.
  ["1920×1080", 1920, 1080], ["768×1024", 768, 1024], ["390×844", 390, 844],
] as const;

test.beforeAll(async () => { await ensureIdentity(PILOT_EMAIL, "Piloto E2E"); });

/** The pilot's account at the summary step, confirmed with the real "É isso", and its diagnosis failing for lack of credit. */
async function toCreditEnded(page: Page): Promise<PilotContext> {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The first open creates the free account; the script then stages the step it asks for.
  await openPilotHome(page);
  const ctx = await withDb(pilotContext);
  await confirmBrandAndFailDiagnosis(page, ctx);
  return ctx;
}

async function confirmBrandAndFailDiagnosis(page: Page, ctx: PilotContext) {
  await withDb((db) => db.query("delete from adscale_equipe.equipe_exceptions where account_id = $1", [ctx.accountId]));
  stageWithScript("summary");
  await openPilotHome(page);
  await dismissCookieBanner(page);
  await page.getByTestId("handoff-card").last().getByRole("button", { name: /^É isso/ }).click();
  await expect.poll(
    () => withDb(async (db) => (await db.query("select step from adscale_equipe.equipe_brand_handoffs where account_id = $1", [ctx.accountId])).rows[0]?.step),
    { timeout: 30_000 },
  ).toBe("done");
  execFileSync("npx", ["tsx", "scripts/pilot-diagnosis-fail.ts", "budget_exceeded", PILOT_EMAIL], { cwd: process.cwd(), env: { ...process.env, NODE_OPTIONS: "--conditions=react-server" }, stdio: "pipe" });
}

/** How much of the exit is below the bottom of the conversation's region (0 = whole in view), and above its top. */
async function exitOutsideTheRegion(page: Page) {
  return page.getByTestId("assistant-chat-scroll-region").evaluate((region) => {
    const bounds = region.getBoundingClientRect();
    const exit = document.querySelector("[data-testid=diagnosis-budget-exit]");
    const part = (element: Element | null | undefined) => {
      const box = element?.getBoundingClientRect();
      return box ? { below: Math.max(0, Math.round(box.bottom - bounds.bottom)), above: Math.max(0, Math.round(bounds.top - box.top)), height: Math.round(box.height) } : null;
    };
    return { button: part(exit?.querySelector("button")), hint: part(exit?.querySelector("[role=status]")), scrollTop: Math.round(region.scrollTop), max: Math.round(region.scrollHeight - region.clientHeight) };
  });
}

test.describe("credit ended before the diagnosis: arriving at the conversation", () => {
  test("'Falar com uma pessoa' and its line are whole in view on arrival, in every window", async ({ page }) => {
    test.setTimeout(420_000);
    await loginAs(page, PILOT_EMAIL, "pt-BR", "dark");
    await toCreditEnded(page);
    const arrivals: string[] = [];
    for (const [name, width, height] of WINDOWS) {
      await page.setViewportSize({ width, height });
      // Three arrivals per window: the mesa's photos load in an order that is not always the same.
      for (let arrival = 1; arrival <= 3; arrival += 1) {
        await openPilotHome(page);
        await expect(page.getByTestId("diagnosis-budget-exit")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("mesa")).toBeVisible();
        // The arrival is settled: the mesa's photos are in and nothing grows any more.
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(1200);
        const outside = await exitOutsideTheRegion(page);
        arrivals.push(`${name} #${arrival} ${JSON.stringify(outside)}`);
        expect(outside.button, `${name}: the button`).not.toBeNull();
        expect(outside.button!.below, `${name} #${arrival}: the button is cut at the bottom (${JSON.stringify(outside)})`).toBe(0);
        expect(outside.button!.above, `${name} #${arrival}: the button is cut at the top`).toBe(0);
        expect(outside.hint!.below, `${name} #${arrival}: the line under the button is cut at the bottom`).toBe(0);
      }
    }
    console.log(`ARRIVAL ${arrivals.join(" | ")}`);
  });

  test("the person who waits on the page sees the card arrive and the conversation follows it", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, PILOT_EMAIL, "pt-BR", "dark");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPilotHome(page);
    await confirmBrandAndFailDiagnosis(page, await withDb(pilotContext));
    // The conversation polls while a diagnosis is being built: the card arrives by itself, and the region follows it down.
    await expect(page.getByTestId("diagnosis-budget-exit")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    const outside = await exitOutsideTheRegion(page);
    expect(outside.button!.below, `waiting: ${JSON.stringify(outside)}`).toBe(0);
    expect(outside.hint!.below).toBe(0);
  });
});

/**
 * T7 and T8 of the screen review, in the browser: the lines the conversation answers with when the credit is over are stored once, in pt-BR, and read in the
 * language of the reader; and "Agora não" on the plan card is answered by a fixed line of its own, never by the invitation to carry on for free, with no second
 * card and no model (the model's key here is a fake one: a call to it would show as the generic error line).
 */
const LATER_LINE = { "pt-BR": "Tudo bem. Quando quiser, é só dizer “quero assinar”.", en: "That's fine. Whenever you want, just say “I want to subscribe”." } as const;
const BLOCKED_LINE = {
  "pt-BR": "O crédito grátis de IA da sua conta acabou, então não consegui montar o diagnóstico. Sua conta e sua Biblioteca continuam disponíveis; para falar sobre o plano, é só dizer “quero assinar”.",
  en: "The free AI credit on your account ran out, so I could not build the diagnosis. Your account and Library are still available; to talk about the plan, just say “I want to subscribe”.",
} as const;

async function say(page: Page, text: string) {
  const composer = page.getByTestId("assistant-chat-input");
  await composer.getByRole("textbox").fill(text);
  await composer.getByRole("button", { name: /^(Enviar|Send)$/ }).click();
}

test.describe("credit ended before the diagnosis: 'Agora não' and the language of the fixed lines", () => {
  test("the plan card's 'Agora não' gets its fixed line and the card does not come back; the stored lines read in the reader's language", async ({ page }) => {
    test.setTimeout(420_000);
    await loginAs(page, PILOT_EMAIL, "pt-BR", "dark");
    const ctx = await toCreditEnded(page);
    await openPilotHome(page);

    // The person's first message gets the plan card (the way to a person). Nothing asks a model.
    await say(page, "oi");
    const cards = page.getByTestId("equipe-plan-offer");
    await expect(cards).toHaveCount(1, { timeout: 30_000 });

    // "Agora não": the line of its own, no second card, and never the invitation to carry on for free that the button used to send.
    await cards.getByRole("button", { name: "Agora não" }).click();
    await expect(page.getByText(LATER_LINE["pt-BR"])).toBeVisible({ timeout: 30_000 });
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Continuar no grátis por enquanto")).toHaveCount(0);

    // Whatever is said next gets the line that is true for this account (there is no diagnosis), still with no card.
    await say(page, "e agora?");
    await expect(page.getByText(BLOCKED_LINE["pt-BR"])).toBeVisible({ timeout: 30_000 });
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Não consegui processar sua mensagem")).toHaveCount(0);

    // The same conversation read in English: the stored pt-BR lines are shown in English, and not a word of them in Portuguese.
    await page.context().addCookies([{ name: "locale", value: "en", url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
    await openPilotHome(page);
    await expect(page.getByText(LATER_LINE.en)).toBeVisible();
    await expect(page.getByText(BLOCKED_LINE.en)).toBeVisible();
    await expect(page.getByText(LATER_LINE["pt-BR"])).toHaveCount(0);
    await expect(page.getByText(BLOCKED_LINE["pt-BR"])).toHaveCount(0);

    // In English the button sends its own phrase and gets the line in English; asking for the plan in English brings the card back.
    await cards.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByText(LATER_LINE.en)).toHaveCount(2, { timeout: 30_000 });
    await expect(cards).toHaveCount(1);
    await say(page, "I want to subscribe");
    await expect(cards).toHaveCount(2, { timeout: 30_000 });

    // What the account keeps is the pt-BR text with its key, once per answer: the language is the screen's.
    const stored = await withDb(async (db) => (await db.query<{ content: string; payload: { fixedReply: string } }>(
      "select content, payload from adscale_app.assistant_messages where thread_id = $1 and type = 'assistant' and payload ? 'fixedReply' order by sequence",
      [ctx.threadId])).rows);
    expect(stored.map((row) => row.payload.fixedReply)).toEqual(["plan_later", "diagnosis_budget_exceeded", "plan_later"]);
    expect(stored.map((row) => row.content)).toEqual([LATER_LINE["pt-BR"], BLOCKED_LINE["pt-BR"], LATER_LINE["pt-BR"]]);
  });
});
