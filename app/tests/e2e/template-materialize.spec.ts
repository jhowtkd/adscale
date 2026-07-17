import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** A saved template now materializes as a source on the canonical Home draft. */

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = { email: string; password: string; primaryClientProfileId: string };

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

const BRIEF = {
  name: `Template Materialize ${Date.now()}`,
  client: "Acme Education",
  product: "Course X",
  objective: "Generate qualified leads",
  audience: "Founders 25-45",
  platforms: ["meta_feed", "tiktok"],
  tone: "direct",
  offer: "20% off this week",
  constraints: "No fake social proof",
  notes: "Q3 push",
  generationMode: "art_variation" as const,
  creativeLevel: "balanced" as const,
  styleIntensity: "medium" as const,
  ctaVariants: ["Buy now"],
  targetFormats: ["1:1"],
};

async function login(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  await page.goto("/login");
  await page.locator("#email").fill(fixture().email);
  await page.locator("#login-password").fill(fixture().password);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe("Template materialization", () => {
  test("Usar template attaches its full briefing to the same Home draft", async ({ page }) => {
    await login(page);
    const api = page.request;

    const profilesResponse = await api.get("/api/client-profiles");
    expect(profilesResponse.ok()).toBe(true);
    const profiles = (await profilesResponse.json()) as { profiles: Array<{ id: string; name: string }> };
    expect(profiles.profiles).toEqual([
      expect.objectContaining({ id: fixture().primaryClientProfileId, name: "Create Post E2E Brand" }),
    ]);

    const createRes = await api.post("/api/campaigns", { data: { ...BRIEF, clientProfileId: null } });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const sourceId = ((await createRes.json()) as { campaign: { id: string } }).campaign.id;
    const templateName = `Tpl ${Date.now()}`;
    const tplRes = await api.post("/api/templates", {
      data: { campaignId: sourceId, name: templateName, description: "E2E composer fixture" },
    });
    expect(tplRes.status(), await tplRes.text()).toBe(201);
    const templateId = ((await tplRes.json()) as { template: { id: string } }).template.id;
    const storedTemplateResponse = await api.get(`/api/templates/${templateId}`);
    expect(storedTemplateResponse.ok(), await storedTemplateResponse.text()).toBe(true);
    const storedTemplate = ((await storedTemplateResponse.json()) as { template: Record<string, unknown> }).template;
    expect(storedTemplate).toMatchObject({
      product: BRIEF.product,
      objective: BRIEF.objective,
      audience: BRIEF.audience,
      platforms: BRIEF.platforms,
      tone: BRIEF.tone,
      offer: BRIEF.offer,
      constraints: BRIEF.constraints,
      notes: BRIEF.notes,
      generationMode: BRIEF.generationMode,
      creativeLevel: BRIEF.creativeLevel,
      styleIntensity: BRIEF.styleIntensity,
      ctaVariants: BRIEF.ctaVariants,
      targetFormats: BRIEF.targetFormats,
    });
    const campaignIds = async () => {
      const response = await api.get(`/api/campaigns?limit=200&_=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      expect(response.ok()).toBe(true);
      return ((await response.json()) as { campaigns: Array<{ id: string }> })
        .campaigns.map((campaign) => campaign.id)
        .sort();
    };
    await expect.poll(campaignIds).toContain(sourceId);
    const campaignIdsBefore = await campaignIds();

    let materializeCalls = 0;
    let campaignMutations = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("/materialize") && request.method() === "POST") materializeCalls += 1;
      if (/^\/api\/campaigns(?:\/|$)/.test(url.pathname) && request.method() !== "GET") campaignMutations += 1;
    });

    await page.goto("/templates");
    await expect(page.getByLabel(/marca ativa|active brand/i).first()).toHaveText("Create Post E2E Brand");
    const card = page.getByTestId(`template-card-${templateId}`);
    await expect(card.getByText(templateName)).toBeVisible();
    await card.getByRole("button", { name: /Use template|Usar template/i })
      .evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    // templateId is intentionally transient: the composer consumes it after
    // attaching the source and canonicalizes the URL to workId only.
    await expect.poll(() => new URL(page.url()).searchParams.get("workId")).toBeTruthy();
    await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i })).toBeVisible();
    const source = page.locator("article").filter({ hasText: templateName });
    await expect(source).toBeVisible({ timeout: 30_000 });
    await expect(source.getByRole("button", { name: /ambos|both/i })).toHaveAttribute("aria-pressed", "true");
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i);

    const workId = new URL(page.url()).searchParams.get("workId")!;
    const detail = (await (await api.get(`/api/creative-work/${workId}`)).json()) as {
      sources: Array<{
        id: string;
        templateId: string | null;
        contentAnalysis: {
          product: string;
          offer: string;
          cta: { text: string; style: string };
          keyVisual: string;
          textContent: { headline: string; bullets: string[] };
          format: string;
        } | null;
        styleAnalysis: {
          mood: string;
          composition: string;
          typography: { personality: string };
        } | null;
      }>;
    };
    const attached = detail.sources.filter((item) => item.templateId === templateId);
    expect(attached).toHaveLength(1);
    expect(attached[0]?.contentAnalysis).toMatchObject({
      product: BRIEF.product,
      offer: BRIEF.offer,
      cta: { text: BRIEF.ctaVariants.join(", "), style: "template" },
      keyVisual: BRIEF.objective,
      textContent: { headline: BRIEF.objective, bullets: [BRIEF.audience] },
      format: BRIEF.targetFormats.join(", "),
    });
    expect(attached[0]?.styleAnalysis).toMatchObject({
      mood: BRIEF.tone,
      composition: BRIEF.styleIntensity,
      typography: { personality: BRIEF.tone },
    });
    expect(materializeCalls).toBe(0);
    expect(campaignMutations).toBe(0);
    expect(await campaignIds()).toEqual(campaignIdsBefore);
  });
});
