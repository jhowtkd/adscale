import { expect, test, type Page } from "@playwright/test";

/**
 * Convergence Phase 1 — Usar template materializes the full briefing contract.
 *
 * Proves: save template → Usar template → created campaign retains
 * platforms, tone, offer, product and other briefing fields, with
 * clientProfileId left null (generic template).
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

const CAMPAIGN_URL_RE =
  /\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

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
    try {
      localStorage.setItem(
        "adscale_cookie_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    } catch {
      /* ignore */
    }
  });
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

test.describe("Template materialization", () => {
  test("Usar template creates campaign with full briefing snapshot", async ({
    page,
    request,
  }) => {
    await login(page);

    const createRes = await request.post("/api/campaigns", {
      data: {
        ...BRIEF,
        clientProfileId: null,
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const created = (await createRes.json()) as {
      campaign: { id: string };
    };
    const sourceId = created.campaign.id;

    const templateName = `Tpl ${Date.now()}`;
    const tplRes = await request.post("/api/templates", {
      data: {
        campaignId: sourceId,
        name: templateName,
        description: "E2E materialization fixture",
      },
    });
    expect(tplRes.status(), await tplRes.text()).toBe(201);
    const tplBody = (await tplRes.json()) as {
      template: {
        id: string;
        platforms: string[] | null;
        tone: string | null;
        offer: string | null;
        product: string | null;
      };
    };
    expect(tplBody.template.platforms).toEqual(BRIEF.platforms);
    expect(tplBody.template.tone).toBe(BRIEF.tone);
    expect(tplBody.template.offer).toBe(BRIEF.offer);
    expect(tplBody.template.product).toBe(BRIEF.product);

    await page.goto("/templates");
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { name: /Use template|Usar template/i })
      .first()
      .click();

    await expect(page).toHaveURL(/templateId=/);
    await expect(page.locator("#campaign-name")).toBeVisible({ timeout: 15_000 });

    await page.locator("#campaign-name").fill(`Materialized ${Date.now()}`);
    const clientValue = await page.locator("#campaign-client").inputValue();
    if (!clientValue) {
      await page.locator("#campaign-client").fill(BRIEF.client);
    }

    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST" &&
        res.status() === 201
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^(Create|Criar)$/i })
      .click();
    const postRes = await createCampaignPromise;
    const postBody = (await postRes.json()) as {
      campaign: {
        id: string;
        product: string | null;
        objective: string | null;
        audience: string | null;
        platforms: string[] | null;
        tone: string | null;
        offer: string | null;
        constraints: string | null;
        notes: string | null;
        clientProfileId: string | null;
        ctaVariants: string[] | null;
        targetFormats: string[] | null;
      };
    };

    await page.waitForURL(CAMPAIGN_URL_RE, { timeout: 30_000 });

    const detailRes = await request.get(
      `/api/campaigns/${postBody.campaign.id}`
    );
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      campaign: typeof postBody.campaign;
    };
    const campaign = detail.campaign;

    expect(campaign.product).toBe(BRIEF.product);
    expect(campaign.objective).toBe(BRIEF.objective);
    expect(campaign.audience).toBe(BRIEF.audience);
    expect(campaign.platforms).toEqual(BRIEF.platforms);
    expect(campaign.tone).toBe(BRIEF.tone);
    expect(campaign.offer).toBe(BRIEF.offer);
    expect(campaign.constraints).toBe(BRIEF.constraints);
    expect(campaign.notes).toBe(BRIEF.notes);
    expect(campaign.ctaVariants).toEqual(BRIEF.ctaVariants);
    expect(campaign.targetFormats).toEqual(BRIEF.targetFormats);
    expect(campaign.clientProfileId).toBeNull();
  });
});
