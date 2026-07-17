import { expect, test, type Page } from "@playwright/test";

/** A saved template now materializes as a source on the canonical Home draft. */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

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
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe("Template materialization", () => {
  test("Usar template attaches its full briefing to the same Home draft", async ({ page }) => {
    await login(page);
    const api = page.request;

    const profilesResponse = await api.get("/api/client-profiles");
    expect(profilesResponse.ok()).toBe(true);
    const profiles = (await profilesResponse.json()) as { profiles: Array<{ id: string }> };
    const profileId = profiles.profiles[0]?.id;
    expect(profileId).toBeTruthy();
    await page.evaluate((activeClientProfileId) => {
      localStorage.setItem("adscale-storage", JSON.stringify({
        state: { sidebarCollapsed: false, activeClientProfileId },
        version: 0,
      }));
    }, profileId);

    const createRes = await api.post("/api/campaigns", { data: { ...BRIEF, clientProfileId: null } });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const sourceId = ((await createRes.json()) as { campaign: { id: string } }).campaign.id;
    const templateName = `Tpl ${Date.now()}`;
    const tplRes = await api.post("/api/templates", {
      data: { campaignId: sourceId, name: templateName, description: "E2E composer fixture" },
    });
    expect(tplRes.status(), await tplRes.text()).toBe(201);
    const templateId = ((await tplRes.json()) as { template: { id: string } }).template.id;
    const countBefore = ((await (await api.get("/api/campaigns?limit=200")).json()) as { campaigns: unknown[] }).campaigns.length;

    let materializeCalls = 0;
    let campaignMutations = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("/materialize") && request.method() === "POST") materializeCalls += 1;
      if (/^\/api\/campaigns(?:\/|$)/.test(url.pathname) && request.method() !== "GET") campaignMutations += 1;
    });

    await page.goto("/templates");
    const card = page.getByTestId(`template-card-${templateId}`);
    await expect(card.getByText(templateName)).toBeVisible();
    await card.getByRole("button", { name: /Use template|Usar template/i })
      .evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page).toHaveURL(new RegExp(`templateId=${templateId}`));
    await expect(page.getByRole("textbox", { name: /pedido criativo|creative request/i })).toBeVisible();
    const source = page.locator("article").filter({ hasText: templateName });
    await expect(source).toBeVisible({ timeout: 30_000 });
    await expect(source.getByRole("button", { name: /ambos|both/i })).toHaveAttribute("aria-pressed", "true");
    await expect(source.getByRole("status")).toHaveText(/análise concluída|analysis complete/i);

    await expect.poll(() => new URL(page.url()).searchParams.get("workId")).toBeTruthy();
    const workId = new URL(page.url()).searchParams.get("workId")!;
    const detail = (await (await api.get(`/api/creative-work/${workId}`)).json()) as {
      sources: Array<{
        id: string;
        templateId: string | null;
        contentAnalysis: { product: string; offer: string } | null;
        styleAnalysis: { mood: string } | null;
      }>;
    };
    const attached = detail.sources.filter((item) => item.templateId === templateId);
    expect(attached).toHaveLength(1);
    expect(attached[0]?.contentAnalysis).toMatchObject({ product: BRIEF.product, offer: BRIEF.offer });
    expect(attached[0]?.styleAnalysis).toMatchObject({ mood: BRIEF.tone });
    expect(materializeCalls).toBe(0);
    expect(campaignMutations).toBe(0);
    const countAfter = ((await (await api.get("/api/campaigns?limit=200")).json()) as { campaigns: unknown[] }).campaigns.length;
    expect(countAfter).toBe(countBefore);
  });
});
