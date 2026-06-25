import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:3001";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "pt-BR", domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dev-admin@adscale.local", password: "DevAdmin123!" }),
    });
  });
  await page.goto(`${BASE_URL}/campaigns`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const links = await page.$$eval('a[href*="/campaigns/"]', (els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href")).slice(0, 10),
  );
  console.log("Campaign links found:", links);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Page text preview:", bodyText);

  await browser.close();
}

main().catch(console.error);