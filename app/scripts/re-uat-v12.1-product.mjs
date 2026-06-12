/**
 * Product-pure re-UAT for v12.1 learning loop (no SQL shortcuts).
 * Usage: node scripts/re-uat-v12.1-product.mjs
 */
import { chromium } from "playwright";
import pg from "pg";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const BASE = process.env.RE_UAT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.RE_UAT_EMAIL ?? "dev@adscale.local";
const PASSWORD = process.env.RE_UAT_PASSWORD ?? "DevAdmin123!";
const CAMPAIGN_ID =
  process.env.RE_UAT_CAMPAIGN_ID ?? "4b02912b-f59e-4792-80e0-7bf6b6b7985d";
const PROFILE_ID =
  process.env.RE_UAT_PROFILE_ID ?? "c4846246-a0db-4c51-a6ef-af108135df50";

const results = [];

function pass(step, detail) {
  results.push({ step, status: "PASS", detail });
  console.log(`✅ ${step}: ${detail}`);
}

function fail(step, detail) {
  results.push({ step, status: "FAIL", detail });
  console.error(`❌ ${step}: ${detail}`);
}

async function loginRequest() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`login failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return cookie;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function queryDerivations() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id, cta_text, status FROM adscale_app.derivations
       WHERE campaign_id = $1 AND status IN ('approved', 'completed', 'generated')
       ORDER BY created_at LIMIT 10`,
      [CAMPAIGN_ID]
    );
    return rows;
  } finally {
    await pool.end();
  }
}

async function runApiFlow() {
  const cookie = await loginRequest();
  pass("login", EMAIL);

  const cleared = await api(cookie, "PATCH", `/api/campaigns/${CAMPAIGN_ID}`, {
    clientProfileId: null,
  });
  if (cleared.status !== 200) {
    fail("patch-clear-profile", `status ${cleared.status}`);
    return false;
  }

  const attached = await api(cookie, "PATCH", `/api/campaigns/${CAMPAIGN_ID}`, {
    clientProfileId: PROFILE_ID,
  });
  if (attached.status !== 200) {
    fail("patch-attach-profile", `status ${attached.status} ${JSON.stringify(attached.json)}`);
    return false;
  }
  if (attached.json.campaign?.clientProfileId !== PROFILE_ID) {
    fail("patch-attach-profile", `expected ${PROFILE_ID}, got ${attached.json.campaign?.clientProfileId}`);
    return false;
  }
  pass("patch-attach-profile", `clientProfileId=${PROFILE_ID}`);

  const got = await api(cookie, "GET", `/api/campaigns/${CAMPAIGN_ID}`);
  if (got.json.campaign?.clientProfileId !== PROFILE_ID) {
    fail("get-campaign-profile", `persisted value missing`);
    return false;
  }
  pass("get-campaign-profile", "clientProfileId persisted after GET");

  const derivations = await queryDerivations();
  if (derivations.length < 2) {
    fail("derivations", `need >=2 derivations, found ${derivations.length}`);
    return false;
  }
  const control = derivations.find((d) => d.cta_text === "Saiba mais") ?? derivations[0];
  const variant =
    derivations.find((d) => d.cta_text === "Inscreva-se agora") ?? derivations[1];
  pass("derivations", `${derivations.length} available (control=${control.id.slice(0, 8)}…)`);

  const periodStart = "2026-06-01";
  const periodEnd = "2026-06-12";

  const previewBody = {
    manual: {
      derivationId: variant.id,
      platform: "meta",
      placementRaw: "feed",
      startDate: periodStart,
      endDate: periodEnd,
      impressions: "12000",
      clicks: "300",
      spend: "180,75",
      conversions: "40",
      conversionValue: "5.200,00",
      currency: "BRL",
    },
    parseOptions: {
      defaultCurrency: "BRL",
      locale: "pt-BR",
      decimalSeparator: ",",
      percentFormat: "percent",
      sourceTimezone: "America/Sao_Paulo",
    },
  };

  const preview = await api(
    cookie,
    "POST",
    `/api/campaigns/${CAMPAIGN_ID}/performance/import/preview`,
    previewBody
  );
  if (preview.status !== 200 || !preview.json.preview) {
    fail("import-preview", `${preview.status} ${JSON.stringify(preview.json)}`);
    return false;
  }
  const summary = preview.json.preview.summary;
  pass(
    "import-preview",
    `valid=${summary?.valid ?? "?"} wouldCreate=${summary?.wouldCreate ?? "?"} wouldUpdate=${summary?.wouldUpdate ?? "?"}`
  );

  const confirm = await api(
    cookie,
    "POST",
    `/api/campaigns/${CAMPAIGN_ID}/performance/import/confirm`,
    {
      sourceType: "manual",
      parseOptions: previewBody.parseOptions,
      preview: preview.json.preview,
    }
  );
  if (confirm.status !== 201 && confirm.status !== 200) {
    fail("import-confirm", `${confirm.status} ${JSON.stringify(confirm.json)}`);
    return false;
  }
  const importResult = confirm.json.result ?? confirm.json;
  pass(
    "import-confirm",
    `created=${importResult.createdCount ?? 0} updated=${importResult.updatedCount ?? 0} ignored=${importResult.ignoredCount ?? 0}`
  );

  const controlPreviewBody = {
    ...previewBody,
    manual: {
      ...previewBody.manual,
      derivationId: control.id,
      impressions: "7500",
      clicks: "188",
      spend: "94,25",
      conversions: "25",
      conversionValue: "2.800,00",
    },
  };
  const controlPreview = await api(
    cookie,
    "POST",
    `/api/campaigns/${CAMPAIGN_ID}/performance/import/preview`,
    controlPreviewBody
  );
  if (controlPreview.status === 200 && controlPreview.json.preview) {
    await api(cookie, "POST", `/api/campaigns/${CAMPAIGN_ID}/performance/import/confirm`, {
      sourceType: "manual",
      parseOptions: controlPreviewBody.parseOptions,
      preview: controlPreview.json.preview,
    });
  }

  const hypo = await api(cookie, "POST", `/api/campaigns/${CAMPAIGN_ID}/hypotheses`, {
    title: "Re-UAT CTA product-pure",
    rationale: "CTA com verbo de ação deve aumentar conversões vs controle neutro.",
    variableKey: "cta_text",
    primaryMetric: "conversions",
    expectedDirection: "increase",
    kind: "controlled_hypothesis",
    platform: "meta",
    periodStart,
    periodEnd,
    variants: [
      { derivationId: control.id, role: "control", label: control.cta_text ?? "control" },
      { derivationId: variant.id, role: "variant", label: variant.cta_text ?? "variant" },
    ],
  });
  if (hypo.status !== 201 && hypo.status !== 200) {
    fail("hypothesis-create", `${hypo.status} ${JSON.stringify(hypo.json)}`);
    return false;
  }
  const hypothesisId = hypo.json.hypothesis?.id ?? hypo.json.id;
  pass("hypothesis-create", hypothesisId);

  const compare = await api(
    cookie,
    "POST",
    `/api/campaigns/${CAMPAIGN_ID}/hypotheses/${hypothesisId}/compare`
  );
  if (compare.status !== 200) {
    fail("hypothesis-compare", `${compare.status} ${JSON.stringify(compare.json)}`);
    return false;
  }
  pass("hypothesis-compare", `verdict=${compare.json.comparison?.verdict ?? compare.json.verdict ?? "ok"}`);

  const learn = await api(cookie, "POST", `/api/campaigns/${CAMPAIGN_ID}/learnings`, {
    action: "recompute",
  });
  if (learn.status !== 200) {
    fail("learnings-recompute", `${learn.status} ${JSON.stringify(learn.json)}`);
    return false;
  }
  const learningCount = learn.json.upsertedCount ?? learn.json.learnings?.length ?? 0;
  pass("learnings-recompute", `upserted=${learningCount}`);

  const rec = await api(cookie, "GET", `/api/campaigns/${CAMPAIGN_ID}/recommendation`);
  if (rec.status !== 200) {
    fail("recommendation", `${rec.status} ${JSON.stringify(rec.json)}`);
    return false;
  }
  const prefill = rec.json.recommendation?.prefill;
  const recStatus = rec.json.status;
  if (recStatus !== "ready" || !prefill?.recipeId) {
    fail("recommendation", `status=${recStatus} body=${JSON.stringify(rec.json)}`);
    return false;
  }
  pass("recommendation", `status=${recStatus} recipe=${prefill.recipeId}`);

  return { cookie, prefill };
}

async function runUiAccept(recommendationIdHint) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });

  await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}`, {
    waitUntil: "networkidle",
  });

  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.includes("next-experiment-dismiss")) sessionStorage.removeItem(key);
    }
  });

  const learnings = page.locator("#mission-learnings");
  await learnings.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await page.waitForTimeout(3000);

  const loading = page.getByText(/Carregando recomendação/i);
  if (await loading.count()) {
    await loading.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  }

  const cardText = page.getByText(/Testar CTA|Próximo experimento|performance/i).first();
  await cardText.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});

  const acceptBtn = page
    .getByRole("button", { name: /Aceitar e abrir receita|Accept and open recipe/i })
    .first();
  if (!(await acceptBtn.count())) {
    const bodySnippet = (await page.locator("body").innerText()).slice(0, 1200);
    await browser.close();
    fail("ui-accept-prefill", `Accept button not found. Body snippet: ${bodySnippet}`);
    return false;
  }

  await acceptBtn.click();
  await page.waitForTimeout(2500);

  const dialogTitle = page.getByRole("dialog").getByText(/Escolha uma estratégia|Choose a generation strategy/i);
  const generatePreviewBtn = page.getByRole("button", { name: /Gerar prévia|Generate preview/i });
  const ctaInput = page.locator('input[id^="recipe-cta-"]').first();
  const dialogOpen = (await dialogTitle.count()) > 0 || (await generatePreviewBtn.count()) > 0;
  const ctaValue = dialogOpen && (await ctaInput.count()) ? await ctaInput.inputValue() : "";
  const hasEditablePrefill =
    ctaValue.includes("Inscreva-se agora") || ctaValue.includes("Saiba mais");

  await browser.close();

  if (dialogOpen && hasEditablePrefill) {
    pass(
      "ui-accept-prefill",
      `Strategy Recipe dialog opened with editable CTA prefill (${ctaValue.slice(0, 40)})`
    );
    return true;
  }
  fail(
    "ui-accept-prefill",
    `dialog=${dialogOpen} ctaPrefill=${hasEditablePrefill} ctaValue=${ctaValue || "(empty)"}`
  );
}

async function main() {
  console.log(`Re-UAT product-pure @ ${BASE}`);
  const apiOk = await runApiFlow();
  if (!apiOk) {
    console.log("\nSummary:", JSON.stringify(results, null, 2));
    process.exit(1);
  }
  try {
    await runUiAccept();
  } catch (error) {
    fail("ui-accept-prefill", error instanceof Error ? error.message : String(error));
  }

  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n--- Summary ---");
  console.log(JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
