import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, test, type Locator, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Persistent creative directions — deterministic journey gates (#124/#126/#128/#129/#130).
 *
 * Closes the P2 review finding: journey-level coverage for the directional
 * variations contract, without spending real credits (the dev server must run
 * with the controlled provider, exactly like the R-010 matrix):
 *
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true \
 *   CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true \
 *   E2E_PROVIDER_EVIDENCE_PATH=/tmp/adscale-e2e/provider-calls.jsonl npm run dev:next
 *   plus `npm run inngest:dev` and a fresh `npm run seed:create-post-e2e`.
 *
 *   Keep E2E_PROVIDER_EVIDENCE_PATH OUTSIDE the app tree: the default path
 *   (tests/e2e/.evidence/) is watched by the dev server and the write on every
 *   provider call triggers a mid-generation recompile, which 500s the Inngest
 *   callback ("Manifest file is empty") and fails one output with
 *   generation_interrupted. Pass the same path to `playwright test` so the
 *   spec reads the file the server writes. Cold dev routes also race the
 *   15 s suggestion wait — warm /login, /, /creative-work/[id], /campaigns/[id]
 *   and the auth endpoint once before the first run of a fresh dev server.
 *
 * Covered journeys:
 *   #128 — one chip: prepared plan quotes 1 output, generation persists one
 *          output bound 1:1 to its direction, reload keeps the same row.
 *   #128 — five chips: prepared plan quotes 5 outputs, generation persists
 *          five outputs, each bound 1:1 to its direction, in the persisted order.
 *   #128/#129 — draft reload restores pool, selection order and the manual
 *          instruction, and never fires a new automatic suggestion nor changes
 *          quantity.
 *   #130 — partial batch 4+1: the four completed outputs stay available, only
 *          the failed output offers retry, the retry re-sends only that row
 *          with the frozen direction, and the ledger shows exactly one net
 *          debit (no second charge).
 *   #126 — "Continuar de onde parei": a work without a campaign resumes on
 *          `/creative-work/[id]`; once linked it resumes on the campaign, and
 *          the aggregate is byte-identical before and after the link.
 *
 * Determinism notes:
 *   - AI direction suggestions resolve to the controlled-provider fallback
 *     (`fallbackDirections`): Conservadora, Equilibrada, Ousada,
 *     Foco no produto, Foco na oferta.
 *   - The failing direction carries the `[e2e:hard-fail-once]` marker inside
 *     its own instruction, so only that output's prompt fails (attempt 0,
 *     non-retryable); the manual retry re-sends the same frozen instruction
 *     and succeeds on attempt 1.
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");
const EVIDENCE_PATH = process.env.E2E_PROVIDER_EVIDENCE_PATH
  ?? path.resolve(__dirname, ".evidence/provider-calls.jsonl");
const E2E_DB_URL = process.env.DATABASE_URL
  ?? "postgres://test:test@localhost:5433/adscale_test";

interface CreatePostFixture {
  workspaceId: string;
  email: string;
  password: string;
  primaryClientProfileId: string;
  contentArtAssetId: string;
}

interface DirectionWire {
  id: string;
  label: string;
  instruction: string;
  order: number;
  safetyBand: "safe" | "experimental";
  provenance: "default" | "ai-suggestion" | "manual";
}

interface DirectionPoolWire {
  version: number;
  directions: DirectionWire[];
  selectedIds: string[];
  manualInstruction: string | null;
}

interface DirectionalOutputRow {
  id: string;
  status: string;
  creativeLevel: string;
  directionId: string | null;
  directionSnapshot: {
    label: string;
    instruction: string;
    order: number;
    // Frozen from the direction (#123); absent on rows persisted before the band existed.
    safetyBand?: "safe" | "experimental";
  } | null;
  outputKey: string | null;
}

interface DirectionalWorkDetail {
  work: {
    id: string;
    status: string;
    toolKind: string;
    campaignId?: string | null;
    request: string;
    settings: Record<string, unknown> & { directionPool?: DirectionPoolWire };
  };
  preparedPlan?: { workId: string; preparedRevision: string; outputCount: number } | null;
  outputs: DirectionalOutputRow[];
  sources: Array<{ id: string; status: string }>;
}

interface CanonicalWorkSummaryWire {
  originKind: string;
  originId: string;
  state: string;
  resumable: boolean;
  resumeHref: string;
  updatedAt: string;
}

interface ProviderCallEvidence {
  outputPrefix: string;
  attempt: number;
  promptMarkers: string[];
  outcome: "success" | "failure";
}

function loadFixture(): CreatePostFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      "Missing create-post E2E fixture. Run: npm run seed:create-post-e2e",
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as CreatePostFixture;
}

async function login(page: Page): Promise<void> {
  const fixture = loadFixture();
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
  await page.locator("#email").fill(fixture.email);
  await page.locator("#login-password").fill(fixture.password);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DB_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function dbLedgerFor(fixture: CreatePostFixture, workItemId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `select idempotency_key, type, amount from adscale_app.usage_events
       where workspace_id = $1 and idempotency_key like $2 order by created_at, id`,
      [fixture.workspaceId, `creative-work:${workItemId}%`],
    );
    return result.rows as Array<{ idempotency_key: string; type: string; amount: number }>;
  });
}

async function dbOutputRow(outputId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `select status, failure_code, image_call_count, retry_count
       from adscale_app.creative_work_outputs where id = $1`,
      [outputId],
    );
    return result.rows[0] as {
      status: string;
      failure_code: string | null;
      image_call_count: number;
      retry_count: number;
    } | undefined;
  });
}

function readProviderEvidence(): ProviderCallEvidence[] {
  if (!fs.existsSync(EVIDENCE_PATH)) return [];
  return fs.readFileSync(EVIDENCE_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProviderCallEvidence);
}

function evidenceForOutput(evidence: ProviderCallEvidence[], outputId: string): ProviderCallEvidence[] {
  return evidence.filter((row) => row.outputPrefix === `creative-work/${outputId}`);
}

async function apiGetWork(request: APIRequestContext, workId: string): Promise<DirectionalWorkDetail> {
  const res = await request.get(`/api/creative-work/${workId}`);
  expect(res.ok(), `GET work must succeed (got ${res.status()})`).toBeTruthy();
  return (await res.json()) as DirectionalWorkDetail;
}

/**
 * Creates a variations draft with the seeded content art attached. When
 * `directionPool` is omitted the draft behaves like a fresh UI draft (the
 * composer materializes the default pool and the AI suggestion applies).
 */
async function apiCreateVariationsDraft(
  request: APIRequestContext,
  fixture: CreatePostFixture,
  input: { request: string; directionPool?: DirectionPoolWire; withSource?: boolean },
): Promise<string> {
  const res = await request.post("/api/creative-work", {
    data: {
      clientProfileId: fixture.primaryClientProfileId,
      draftKey: crypto.randomUUID(),
      request: input.request,
      intent: "variations",
      format: "4:5",
      settings: {
        targetFormats: [],
        formatMode: "manual",
        ...(input.directionPool ? { directionPool: input.directionPool } : {}),
      },
      ...(input.withSource === false
        ? {}
        : { assetId: fixture.contentArtAssetId, usage: "both" }),
    },
  });
  expect(res.ok(), `create draft must succeed (got ${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { work: { id: string } };
  return body.work.id;
}

async function waitForSourcesReady(request: APIRequestContext, workId: string): Promise<void> {
  await expect.poll(
    async () => {
      const detail = await apiGetWork(request, workId);
      return detail.sources.length > 0 && detail.sources.every((source) => source.status === "ready");
    },
    { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
  ).toBe(true);
}

async function apiGenerateInitial(request: APIRequestContext, workId: string): Promise<void> {
  const preparation = await request.patch(`/api/creative-work/${workId}`, {
    data: { action: "prepare" },
  });
  expect(preparation.status(), `prepare must succeed (got ${preparation.status()})`).toBe(200);
  const detail = await apiGetWork(request, workId);
  expect(detail.preparedPlan, "prepare must return a revision-bound plan").toMatchObject({
    workId,
  });
  const res = await request.post(`/api/creative-work/${workId}/generate`, {
    data: {
      action: "initial",
      preparedRevision: detail.preparedPlan!.preparedRevision,
    },
  });
  expect(res.status(), `generate must answer 202 (got ${res.status()})`).toBe(202);
}

async function waitForTerminalOutputs(request: APIRequestContext, workId: string): Promise<DirectionalWorkDetail> {
  let detail!: DirectionalWorkDetail;
  await expect.poll(
    async () => {
      detail = await apiGetWork(request, workId);
      return detail.outputs.length > 0
        && detail.outputs.every((output) => output.status === "completed" || output.status === "failed");
    },
    { timeout: 180_000, intervals: [1_500, 2_500, 4_000] },
  ).toBe(true);
  return detail;
}

// ---------------------------------------------------------------------------
// UI helpers (locale-resilient: the app renders en by default, pt-BR via cookie;
// direction labels are server data and always pt-BR).
// ---------------------------------------------------------------------------

const FALLBACK_LABELS = ["Conservadora", "Equilibrada", "Ousada", "Foco no produto", "Foco na oferta"] as const;

function directionChips(page: Page): Locator {
  // The <fieldset> also carries the implicit "group" role and wraps extra
  // buttons ("Sugerir novamente"); the chip row is the inner div with the
  // explicit aria-label, so match it directly.
  return page
    .locator('div[role="group"][aria-label="Direcionamentos"], div[role="group"][aria-label="Directions"]')
    .locator('button[aria-pressed]');
}

function chip(page: Page, label: string): Locator {
  return directionChips(page).filter({ hasText: label }).first();
}

async function waitForSuggestionApplied(page: Page): Promise<void> {
  // The controlled suggestion auto-applies five chips; the last fallback label
  // only exists after the apply, so it is the deterministic settle signal.
  await expect(chip(page, "Foco na oferta"), "AI suggestion must apply five chips").toBeVisible();
  await expect(directionChips(page)).toHaveCount(FALLBACK_LABELS.length);
}

function generateButton(page: Page): Locator {
  return page.getByTestId("creative-generate-action").getByRole("button");
}

async function selectedPoolIds(request: APIRequestContext, workId: string): Promise<string[]> {
  const detail = await apiGetWork(request, workId);
  return detail.work.settings.directionPool?.selectedIds ?? [];
}

// ---------------------------------------------------------------------------
// #128 — selection of one and five chips: prepared output count, generation, 1:1 binding,
// persisted order, reload and resume without real credits.
// ---------------------------------------------------------------------------

test.describe("Creative directions #128 — chip selection journeys", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("um chip: plano com 1 variação, geração vinculada 1:1 e recarga preserva", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateVariationsDraft(page.request, fixture, {
      request: "Variações E2E de um direcionamento para matrículas abertas.",
    });
    await waitForSourcesReady(page.request, workId);

    await page.goto(`/?workId=${workId}&intent=variations`);
    await waitForSuggestionApplied(page);

    // Deselect down to a single chip: only "Conservadora" stays pressed.
    await chip(page, "Equilibrada").click();
    await chip(page, "Ousada").click();
    await expect(generateButton(page)).toBeEnabled();

    // The selection is autosaved to the draft before any generation.
    await expect.poll(
      () => selectedPoolIds(page.request, workId),
      { timeout: 15_000, intervals: [500, 1_000, 2_000] },
    ).toHaveLength(1);
    const [selectedId] = await selectedPoolIds(page.request, workId);
    const pool = (await apiGetWork(page.request, workId)).work.settings.directionPool!;
    const selectedDirection = pool.directions.find((direction) => direction.id === selectedId);
    expect(selectedDirection?.label).toBe("Conservadora");

    // Drive prepare + generate through the API (same commands the composer
    // issues), like the #130 test: clicking the composer's CTA right after the
    // autosave races the debounced flush and intermittently answers 409
    // (work_not_prepared/stale_input). The prepared output count is asserted
    // below; the UI click path is covered by the "cinco chips" test.
    const prepare = await page.request.patch(`/api/creative-work/${workId}`, { data: { action: "prepare" } });
    expect(prepare.status(), `prepare must succeed (got ${prepare.status()})`).toBe(200);
    expect((await prepare.json()).preparedPlan).toMatchObject({ outputCount: 1 });
    await apiGenerateInitial(page.request, workId);
    const detail = await waitForTerminalOutputs(page.request, workId);

    // Exactly one output, bound 1:1 to the selected direction.
    expect(detail.outputs).toHaveLength(1);
    const output = detail.outputs[0];
    expect(output.status).toBe("completed");
    expect(output.directionId).toBe(selectedId);
    expect(output.directionSnapshot).toMatchObject({
      label: "Conservadora",
      instruction: selectedDirection!.instruction,
      order: selectedDirection!.order,
      safetyBand: selectedDirection!.safetyBand,
    });

    // The UI renders the direction label, not a creative level. Generation was
    // API-driven, so reload to rebuild the results view from the server — the
    // same persisted row must come back: no new output, same ID.
    await page.reload();
    await expect(page.getByTestId("proposal-level")).toHaveCount(1);
    await expect(page.getByTestId("proposal-level-name")).toHaveText("Conservadora");
    const reloaded = await apiGetWork(page.request, workId);
    expect(reloaded.outputs).toHaveLength(1);
    expect(reloaded.outputs[0].id).toBe(output.id);
    expect(reloaded.outputs[0].directionId).toBe(selectedId);

    // Billing: exactly one initial debit of 5 credits, never a refund.
    const ledger = await dbLedgerFor(fixture, workId);
    const debits = ledger.filter((row) => row.idempotency_key.endsWith(":initial"));
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(5);
    expect(ledger.filter((row) => row.idempotency_key.includes("refund"))).toHaveLength(0);
  });

  test("cinco chips: plano com 5 variações, cinco outputs vinculados na ordem persistida", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateVariationsDraft(page.request, fixture, {
      request: "Variações E2E de cinco direcionamentos para matrículas abertas.",
    });
    await waitForSourcesReady(page.request, workId);

    await page.goto(`/?workId=${workId}&intent=variations`);
    await waitForSuggestionApplied(page);

    // The auto-applied pool selects the first three; select the remaining two.
    await expect(generateButton(page)).toBeEnabled();
    await chip(page, "Foco no produto").click();
    await chip(page, "Foco na oferta").click();
    await expect(generateButton(page)).toBeEnabled();

    await expect.poll(
      () => selectedPoolIds(page.request, workId),
      { timeout: 15_000, intervals: [500, 1_000, 2_000] },
    ).toHaveLength(5);
    const persistedSelectedIds = await selectedPoolIds(page.request, workId);
    const pool = (await apiGetWork(page.request, workId)).work.settings.directionPool!;
    expect(persistedSelectedIds).toEqual(pool.directions.map((direction) => direction.id));

    const prepare = await page.request.patch(`/api/creative-work/${workId}`, { data: { action: "prepare" } });
    expect(prepare.status(), `prepare must succeed (got ${prepare.status()})`).toBe(200);
    expect((await prepare.json()).preparedPlan).toMatchObject({ outputCount: 5 });
    await apiGenerateInitial(page.request, workId);
    const detail = await waitForTerminalOutputs(page.request, workId);

    // Five completed outputs, each bound 1:1 to its direction, in the
    // persisted selection order (directionSnapshot.order is the authority).
    expect(detail.outputs).toHaveLength(5);
    for (const output of detail.outputs) {
      expect(output.status).toBe("completed");
      expect(output.directionId).not.toBeNull();
      expect(output.directionSnapshot).not.toBeNull();
    }
    const uniqueDirectionIds = new Set(detail.outputs.map((output) => output.directionId));
    expect(uniqueDirectionIds.size).toBe(5);
    const ordered = [...detail.outputs].sort(
      (left, right) => left.directionSnapshot!.order - right.directionSnapshot!.order,
    );
    expect(ordered.map((output) => output.directionId)).toEqual(persistedSelectedIds);
    expect(ordered.map((output) => output.directionSnapshot!.label)).toEqual([...FALLBACK_LABELS]);
    // The frozen snapshot must match the pool direction it came from.
    for (const output of ordered) {
      const direction = pool.directions.find((candidate) => candidate.id === output.directionId);
      expect(direction, `output ${output.id} must resolve its direction`).toBeDefined();
      expect(output.directionSnapshot).toMatchObject({
        label: direction!.label,
        instruction: direction!.instruction,
        order: direction!.order,
        safetyBand: direction!.safetyBand,
      });
    }

    // The grid keeps one faithful approval surface and exposes every
    // direction through its ordered thumbnail rail.
    await expect(page.getByTestId("proposal-level")).toHaveCount(1);
    const thumbnails = page.getByRole("navigation", { name: "Miniaturas das propostas" }).getByRole("button");
    await expect(thumbnails).toHaveCount(5);
    expect(await thumbnails.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))).toEqual(
      [...FALLBACK_LABELS].map((label) => `Selecionar ${label} em 4:5`),
    );
    for (const label of FALLBACK_LABELS) {
      await page.getByRole("button", { name: `Selecionar ${label} em 4:5` }).click();
      await expect(page.getByTestId("proposal-level-name")).toHaveText(label);
    }

    // Reload resumes the same five rows — same IDs, same binding.
    const firstIds = detail.outputs.map((output) => output.id).sort();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Miniaturas das propostas" }).getByRole("button")).toHaveCount(5);
    const reloaded = await apiGetWork(page.request, workId);
    expect(reloaded.outputs.map((output) => output.id).sort()).toEqual(firstIds);

    // Billing: one initial debit of 25 credits, no refunds.
    const ledger = await dbLedgerFor(fixture, workId);
    const debits = ledger.filter((row) => row.idempotency_key.endsWith(":initial"));
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(25);
    expect(ledger.filter((row) => row.idempotency_key.includes("refund"))).toHaveLength(0);
  });

  test("recarga do rascunho preserva pool, seleção, ordem e instrução manual sem nova sugestão", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateVariationsDraft(page.request, fixture, {
      request: "Variações E2E para recarga de rascunho com instrução manual.",
    });
    await waitForSourcesReady(page.request, workId);

    await page.goto(`/?workId=${workId}&intent=variations`);
    await waitForSuggestionApplied(page);

    // Reshape the selection: drop "Ousada", add "Foco no produto".
    await chip(page, "Ousada").click();
    await chip(page, "Foco no produto").click();

    const manualInstruction = "Manter a marca no canto e reforçar o prazo de agosto.";
    await page.getByText(/^(Direcionamentos manuais|Manual directions)$/).click();
    const manualBox = page.getByRole("textbox", { name: /^(Direcionamentos manuais|Manual directions)$/ });
    await manualBox.fill(manualInstruction);

    // Wait until the autosave lands: pool of five, three selected in click
    // order, manual instruction persisted.
    await expect.poll(
      async () => {
        const detail = await apiGetWork(page.request, workId);
        const pool = detail.work.settings.directionPool;
        return pool && pool.manualInstruction === manualInstruction && pool.selectedIds.length === 3
          ? pool
          : null;
      },
      { timeout: 15_000, intervals: [500, 1_000, 2_000] },
    ).not.toBeNull();
    const persistedPool = (await apiGetWork(page.request, workId)).work.settings.directionPool!;
    const labelOf = (id: string) => persistedPool.directions.find((direction) => direction.id === id)?.label;
    expect(persistedPool.selectedIds.map(labelOf)).toEqual(["Conservadora", "Equilibrada", "Foco no produto"]);

    // Reload must not fire a new automatic suggestion (#129): persisted
    // ai-suggestion directions block the automatic fetch.
    const suggestRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(`/api/creative-work/${workId}/suggest`) && req.method() === "POST") {
        suggestRequests.push(req.url());
      }
    });
    await page.reload();
    await waitForSuggestionApplied(page);

    // Pool, selection, order and manual instruction survive the reload.
    await expect(directionChips(page)).toHaveCount(5);
    await expect(chip(page, "Conservadora")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Equilibrada")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Ousada")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page, "Foco no produto")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Foco na oferta")).toHaveAttribute("aria-pressed", "false");
    await page.getByText(/^(Direcionamentos manuais|Manual directions)$/).click();
    await expect(
      page.getByRole("textbox", { name: /^(Direcionamentos manuais|Manual directions)$/ }),
    ).toHaveValue(manualInstruction);
    // The draft remains actionable without exposing an operation price.
    await expect(generateButton(page)).toBeEnabled();
    // Give the (blocked) effect a beat to prove it stays quiet.
    await page.waitForTimeout(1_500);
    expect(suggestRequests, "reload must not fire a new automatic suggestion").toHaveLength(0);

    // The server-side pool is byte-identical after the reload.
    const reloadedPool = (await apiGetWork(page.request, workId)).work.settings.directionPool!;
    expect(reloadedPool).toEqual(persistedPool);
  });
});

// ---------------------------------------------------------------------------
// #130 — partial batch 4+1: isolated retry, frozen direction, ledger audit.
// ---------------------------------------------------------------------------

const PARTIAL_DIRECTIONS: DirectionWire[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Direção Alfa", instruction: "Composição limpa com foco no produto.", order: 0, safetyBand: "safe", provenance: "manual" },
  { id: "22222222-2222-4222-8222-222222222222", label: "Direção Beta", instruction: "Hierarquia forte na oferta principal.", order: 1, safetyBand: "safe", provenance: "manual" },
  { id: "33333333-3333-4333-8333-333333333333", label: "Direção Gama", instruction: "Fundo neutro e CTA em destaque.", order: 2, safetyBand: "safe", provenance: "manual" },
  // The marker travels inside THIS direction's instruction only, so only this
  // output's prompt fails (attempt 0, non-retryable); the frozen instruction
  // is re-sent on the manual retry and succeeds on attempt 1.
  { id: "44444444-4444-4444-8444-444444444444", label: "Direção Delta", instruction: "Contraste máximo mantendo a marca. [e2e:hard-fail-once]", order: 3, safetyBand: "experimental", provenance: "manual" },
  { id: "55555555-5555-4555-8555-555555555555", label: "Direção Épsilon", instruction: "Tom editorial com prova social sutil.", order: 4, safetyBand: "safe", provenance: "manual" },
];

test.describe("Creative directions #130 — partial failure and isolated retry", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("quatro sucessos e uma falha: retry isolado preserva o direcionamento e o ledger confere um débito líquido", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateVariationsDraft(page.request, fixture, {
      request: "Lote direcional E2E com uma falha controlada no quarto caminho.",
      directionPool: {
        version: 1,
        directions: PARTIAL_DIRECTIONS.map((direction) => ({ ...direction })),
        selectedIds: PARTIAL_DIRECTIONS.map((direction) => direction.id),
        manualInstruction: null,
      },
    });
    await waitForSourcesReady(page.request, workId);
    const prepare = await page.request.patch(`/api/creative-work/${workId}`, { data: { action: "prepare" } });
    expect(prepare.status(), `prepare must succeed (got ${prepare.status()})`).toBe(200);
    await apiGenerateInitial(page.request, workId);

    const detail = await waitForTerminalOutputs(page.request, workId);
    expect(detail.outputs).toHaveLength(5);
    expect(detail.work.status).toBe("partial");

    const byDirection = new Map(detail.outputs.map((output) => [output.directionId, output]));
    const failed = byDirection.get("44444444-4444-4444-8444-444444444444");
    expect(failed, "the marker direction must be the failed output").toBeDefined();
    expect(failed!.status).toBe("failed");
    // The direction stays frozen on the failed row, safety band included.
    expect(failed!.directionSnapshot).toEqual({
      label: "Direção Delta",
      instruction: "Contraste máximo mantendo a marca. [e2e:hard-fail-once]",
      order: 3,
      safetyBand: "experimental",
    });
    const completedBefore = detail.outputs.filter((output) => output.status === "completed");
    expect(completedBefore).toHaveLength(4);
    const completedSnapshotBefore = completedBefore
      .map((output) => ({ id: output.id, outputKey: output.outputKey }))
      .sort((left, right) => left.id.localeCompare(right.id));

    // UI: on the work's own page, the five outputs are available through one
    // faithful approval surface and only the failed direction offers retry.
    await page.goto(`/creative-work/${workId}`);
    const outputThumbnails = page.getByRole("navigation", { name: "Miniaturas das propostas" }).getByRole("button");
    await expect(outputThumbnails).toHaveCount(5);
    await page.getByRole("button", { name: "Selecionar Direção Delta em 4:5" }).click();
    const failedCard = page.locator('[data-testid="proposal-level"][data-status="failed"]');
    await expect(failedCard).toHaveCount(1);
    await expect(failedCard.getByTestId("proposal-level-name")).toHaveText("Direção Delta");
    const retryButton = failedCard.getByRole("button", { name: /repetir esta proposta/i });
    await expect(retryButton).toBeVisible();
    expect(
      await page.getByRole("button", { name: /repetir esta proposta/i }).count(),
      "only the failed output may offer retry",
    ).toBe(1);

    // Isolated retry: re-sends only the failed row.
    await retryButton.click();
    let finished = await apiGetWork(page.request, workId);
    await expect.poll(
      async () => {
        finished = await apiGetWork(page.request, workId);
        return finished.outputs.find((candidate) => candidate.id === failed!.id)?.status;
      },
      { timeout: 180_000, intervals: [1_500, 2_500, 4_000] },
    ).toBe("completed");

    // Same row, frozen direction preserved; the four siblings untouched.
    expect(finished.outputs).toHaveLength(5);
    const retried = finished.outputs.find((output) => output.id === failed!.id);
    expect(retried).toBeDefined();
    expect(retried!.directionId).toBe(failed!.directionId);
    expect(retried!.directionSnapshot).toEqual(failed!.directionSnapshot);
    const completedAfter = finished.outputs
      .filter((output) => output.id !== failed!.id)
      .map((output) => ({ id: output.id, outputKey: output.outputKey, status: output.status }))
      .sort((left, right) => left.id.localeCompare(right.id));
    expect(completedAfter.map((output) => ({ id: output.id, outputKey: output.outputKey }))).toEqual(completedSnapshotBefore);
    for (const output of completedAfter) expect(output.status).toBe("completed");

    // The retry re-sent the frozen instruction (marker present on both calls);
    // exactly two provider calls for this output: failure then success.
    const calls = evidenceForOutput(readProviderEvidence(), failed!.id);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ attempt: 0, outcome: "failure" });
    expect(calls[1]).toMatchObject({ attempt: 1, outcome: "success" });
    expect(calls[1].promptMarkers).toContain("[e2e:hard-fail-once]");
    const row = await dbOutputRow(failed!.id);
    expect(row).toMatchObject({ status: "completed", image_call_count: 2, retry_count: 1 });

    // Ledger: one batch debit, exactly one terminal refund for the failed
    // output and exactly one reactivation of the same amount — the retried
    // output holds exactly one net debit, never a second charge.
    const ledger = await dbLedgerFor(fixture, workId);
    const initialDebits = ledger.filter((entry) => entry.idempotency_key.endsWith(":initial"));
    expect(initialDebits).toHaveLength(1);
    expect(initialDebits[0].amount).toBe(25);
    const refunds = ledger.filter((entry) => entry.idempotency_key.includes("refund"));
    expect(refunds).toHaveLength(1);
    expect(refunds[0].idempotency_key).toBe(`creative-work:${workId}:output:${failed!.id}:terminal-refund`);
    expect(refunds[0].amount).toBe(-5);
    const reactivations = ledger.filter((entry) => entry.idempotency_key.includes("reactivate"));
    expect(reactivations).toHaveLength(1);
    expect(reactivations[0].idempotency_key).toBe(`creative-work:${workId}:output:${failed!.id}:reactivate-terminal`);
    expect(reactivations[0].amount).toBe(5);
    const net = ledger.reduce((sum, entry) => sum + entry.amount, 0);
    expect(net, "net ledger must equal five delivered outputs, no double charge").toBe(25);
  });
});

// ---------------------------------------------------------------------------
// #126 — "Continuar de onde parei": own page without campaign, campaign page
// when linked, aggregate preserved across the link.
// ---------------------------------------------------------------------------

test.describe("Creative directions #126 — resume destinations", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sem campanha abre /creative-work/[id]; com campanha abre a campanha; mesmo agregado", async ({ page }) => {
    const fixture = loadFixture();
    const workId = await apiCreateVariationsDraft(page.request, fixture, {
      request: "Rascunho E2E de retomada para a jornada de destino.",
      withSource: false,
    });

    const listWorks = async (): Promise<CanonicalWorkSummaryWire[]> => {
      const res = await page.request.get("/api/creative-work");
      expect(res.ok(), `list works must succeed (got ${res.status()})`).toBeTruthy();
      return ((await res.json()) as { works: CanonicalWorkSummaryWire[] }).works;
    };
    const findSummary = async () => (await listWorks()).find(
      (work) => work.originKind === "creative_work" && work.originId === workId,
    );

    // Destination 1: no campaign — the canonical resume href is the own page.
    const summaryBefore = await findSummary();
    expect(summaryBefore, "work must appear in the canonical list").toBeDefined();
    expect(summaryBefore!.resumable).toBe(true);
    expect(summaryBefore!.resumeHref).toBe(`/creative-work/${workId}`);

    // The Home card is the same destination — never an intercepted anchor.
    await page.goto("/");
    const continueCard = page.getByRole("link", { name: /Continuar de onde parei|Continue where I left off/ });
    await expect(continueCard).toBeVisible();
    expect(await continueCard.getAttribute("href")).toBe(`/creative-work/${workId}`);
    await continueCard.click();
    await page.waitForURL(new RegExp(`/creative-work/${workId}$`));
    await expect(
      page.getByRole("heading", { name: /Gere variações a partir de uma arte|Generate variations from an artwork/ }),
    ).toBeVisible();

    // Snapshot the aggregate before the link.
    const before = await apiGetWork(page.request, workId);
    expect(before.work.campaignId ?? null).toBeNull();

    // Link a campaign through the real command.
    const campaignRes = await page.request.post("/api/campaigns", {
      data: {
        name: "Campanha E2E Retomada #126",
        client: "Create Post E2E Brand",
        clientProfileId: fixture.primaryClientProfileId,
      },
    });
    expect(campaignRes.status(), `create campaign must succeed (got ${campaignRes.status()})`).toBe(201);
    const campaignId = ((await campaignRes.json()) as { campaign: { id: string } }).campaign.id;
    const link = await page.request.patch(`/api/creative-work/${workId}`, {
      data: { action: "linkCampaign", campaignId },
    });
    expect(link.ok(), `linkCampaign must succeed (got ${link.status()})`).toBeTruthy();

    // Same aggregate before and after the link — only campaignId/updatedAt move.
    const after = await apiGetWork(page.request, workId);
    expect(after.work.id).toBe(before.work.id);
    expect(after.work.campaignId).toBe(campaignId);
    expect(after.work.request).toBe(before.work.request);
    expect(after.work.toolKind).toBe(before.work.toolKind);
    expect(after.work.status).toBe(before.work.status);
    expect(after.work.settings).toEqual(before.work.settings);
    expect(after.outputs).toEqual(before.outputs);
    expect(after.sources.map((source) => source.id)).toEqual(before.sources.map((source) => source.id));

    // Destination 2: linked — the canonical resume href is the campaign page.
    const summaryAfter = await findSummary();
    expect(summaryAfter!.resumeHref).toBe(`/campaigns/${campaignId}?creativeWork=${workId}`);

    await page.goto("/");
    const linkedCard = page.getByRole("link", { name: /Continuar de onde parei|Continue where I left off/ });
    await expect(linkedCard).toBeVisible();
    expect(await linkedCard.getAttribute("href")).toBe(`/campaigns/${campaignId}?creativeWork=${workId}`);
    await linkedCard.click();
    await page.waitForURL(new RegExp(`/campaigns/${campaignId}\\?creativeWork=${workId}`));
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}\\?creativeWork=${workId}`));
  });
});
