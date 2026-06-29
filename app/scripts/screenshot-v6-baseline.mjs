#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUTPUT_DIR = path.resolve(process.cwd(), "tests/e2e/visual-baselines/v6");

const ROUTES = [
  { slug: "topbar-promo", path: "/v6/topbar-promo" },
];

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${route.slug}.png`),
      fullPage: true,
    });
    console.log(`✓ Baseline saved: ${route.slug}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\nDone. Baselines in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
