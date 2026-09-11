import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Studio Carousel — researched editorial flow (Task 8) on the controlled provider.
 *
 * Drives the researched carousel once, in one serial scenario:
 *   1. choose `Criar carrossel` with backstage notes in the input
 *   2. organize → three hooks
 *   3. edit a hook headline and choose it
 *   4. receive the script, approve it
 *   5. prepare and generate one cover
 *   6. confirmed pause (no interiors yet)
 *   7. approve cover and generate the lote
 *   8. review, approve, export ZIP (`01.png`…`NN.png` + one manifest)
 *   9. reload, then an old session tries to confirm a stale revision
 *
 * Explicit `E2E_CONTROLLED_PROVIDER`. Asserts provider dispatch counts per
 * stage. This spec never seeds and never calls a live provider.
 *
 * Requires the local app on :3000 started exactly like the Create Post gate:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true \
 *   CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true \
 *   STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100 \
 *   STUDIO_CAROUSEL_ROLLOUT_PERCENT=100 \
 *   npm run dev:next
 * plus `npm run inngest:dev` and a fresh `npm run seed:create-post-e2e`.
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");
const EVIDENCE_PATH = process.env.E2E_PROVIDER_EVIDENCE_PATH
  ?? path.resolve(__dirname, ".evidence/provider-calls.jsonl");

interface CreatePostFixture {
  workspaceId: string;
  email: string;
  password: string;
  userId: string;
  primaryClientProfileId: string;
}

interface CarouselSlideRow {
  id: string;
  lineageId: string;
  parentSlideId: string | null;
  versionNumber: number;
  deckRevision: string;
  position: number;
  role: string;
  primaryText: string;
  secondaryText: string | null;
  copyAuthority: string;
  status: string;
  hasOutput: boolean;
}

interface CarouselWorkDetail {
  work: {
    id: string;
    toolKind: string;
    carouselApprovedRevision: string | null;
    inputSnapshot: {
      carousel?: {
        preparedRevision: string;
        generationScope?: "cover" | "interiors";
        caption?: string | null;
      };
    } | null;
    settings: {
      carouselDraft: {
        plan: {
          revision: string;
          slides: Array<{ slideId: string; position: number; purpose: string; primaryText: string }>;
        } | null;
      } | null;
      carouselEditorial?: {
        hooks: Array<{ id: string; headline: string }>;
        selectedHookId: string | null;
        caption: string | null;
        approvedScriptRevision: string | null;
        storyboard: Array<{ slideId: string; representation: string }>;
      } | null;
    };
  };
  carouselSlides: CarouselSlideRow[];
}

interface ProviderCallEvidence {
  ts: string;
  outputPrefix: string;
  attempt: number;
  outcome: "success" | "failure";
  promptMarkers: string[];
}

const PUBLIC_BRIEF = [
  "O ateliê de cerâmica da Marina abre agenda para setembro com turmas noturnas de modelagem manual.",
  "Cada encontro inclui preparação da argila, orientação de torneta e queima assistida no forno do estúdio.",
  "As vagas da turma de quarta-feira são limitadas e a lista de espera abre no fim de agosto.",
  "O endereço do galpão fica na região central e o estacionamento é gratuito para alunos matriculados.",
].join(" ");

const BACKSTAGE_NOTES = "notas de bastidor: drafts/angles-hooks.md score=9 não copiar";
const OPERATOR_REQUEST = `${PUBLIC_BRIEF}\n${BACKSTAGE_NOTES}`;
const EDITED_HOOK_HEADLINE = "Agenda de setembro no ateliê de cerâmica";

function loadFixture(): CreatePostFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing create-post E2E fixture. Run: npm run seed:create-post-e2e");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as CreatePostFixture;
}

function readEvidence(): ProviderCallEvidence[] {
  if (!fs.existsSync(EVIDENCE_PATH)) return [];
  return fs.readFileSync(EVIDENCE_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProviderCallEvidence);
}

function deckEvidence(workId: string): ProviderCallEvidence[] {
  return readEvidence().filter((row) => row.outputPrefix.startsWith(`creative-work/${workId}/carousel/slides/`));
}

async function getDetail(request: APIRequestContext, workId: string): Promise<CarouselWorkDetail> {
  let lastStatus = 0;
  let body: CarouselWorkDetail | null = null;
  await expect(async () => {
    const res = await request.get(`/api/creative-work/${workId}`);
    lastStatus = res.status();
    if (res.status() >= 500) {
      throw new Error(`transient detail ${res.status()}`);
    }
    expect(res.ok(), `detail must succeed (got ${res.status()})`).toBeTruthy();
    body = (await res.json()) as CarouselWorkDetail;
  }).toPass({ timeout: 15_000, intervals: [300, 600, 1_000] });
  expect(body, `detail must succeed (got ${lastStatus})`).not.toBeNull();
  return body!;
}

async function login(page: Page, fixture: CreatePostFixture): Promise<void> {
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
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: fixture.email, password: fixture.password },
  });
  expect(response.ok(), `E2E login must succeed (got ${response.status()})`).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test.describe("Studio Carousel editorial controlled-provider gate", () => {
  let workId = "";

  test("researches, generates the cover, pauses, then exports the lote", async ({ page }) => {
    test.setTimeout(600_000);
    const fixture = loadFixture();
    await login(page, fixture);
    await page.addInitScript((activeClientProfileId) => {
      localStorage.setItem("adscale-storage", JSON.stringify({
        state: { sidebarCollapsed: false, activeClientProfileId }, version: 0,
      }));
    }, fixture.primaryClientProfileId);

    await page.goto("/", { waitUntil: "commit" });
    const requestBox = page.locator("#creative-composer-request");
    await expect(requestBox).toBeVisible({ timeout: 30_000 });
    const carouselCard = page.getByRole("button", { name: /criar carrossel/i }).first();
    await expect(async () => {
      await requestBox.fill(OPERATOR_REQUEST);
      await expect(requestBox).toHaveValue(OPERATOR_REQUEST, { timeout: 5_000 });
      await expect(carouselCard).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await carouselCard.click();

    let resolvedWorkId: string | null = null;
    await expect(async () => {
      resolvedWorkId = new URL(page.url()).searchParams.get("workId")
        ?? await page.evaluate((profileId) =>
          window.localStorage.getItem(`adscale:creative-draft:v1:${profileId}:carousel`),
          fixture.primaryClientProfileId);
      expect(resolvedWorkId, "created carousel draft must be resolvable").toBeTruthy();
    }).toPass({ timeout: 60_000 });
    workId = resolvedWorkId!;
    await page.goto(`/?workId=${workId}`, { waitUntil: "commit" });
    await expect(page.locator("#creative-composer-request")).toHaveValue(OPERATOR_REQUEST);

    await page.getByTestId("carousel-organize").click();
    await expect(page.getByTestId("carousel-hook-choices")).toBeVisible({ timeout: 120_000 });
    const chooseButtons = page.getByRole("button", { name: /escolher gancho/i });
    await expect(chooseButtons).toHaveCount(3);

    const firstHookInput = page.getByTestId("carousel-hook-choices").locator("input").first();
    await firstHookInput.fill(EDITED_HOOK_HEADLINE);
    await chooseButtons.first().click();

    await expect(page.getByText("Mesa de sequência")).toBeVisible({ timeout: 120_000 });
    let detail = await getDetail(page.request, workId);
    expect(detail.work.toolKind).toBe("carousel");
    expect(detail.work.settings.carouselEditorial?.selectedHookId).toBeTruthy();
    expect(detail.work.settings.carouselEditorial?.hooks).toHaveLength(3);
    const plannedSlides = detail.work.settings.carouselDraft?.plan?.slides ?? [];
    expect(plannedSlides.length).toBeGreaterThanOrEqual(5);
    const publishedBlob = JSON.stringify({
      slides: plannedSlides,
      caption: detail.work.settings.carouselEditorial?.caption ?? null,
    });
    expect(publishedBlob).not.toContain("drafts/angles-hooks.md");

    await page.getByTestId("carousel-approve-script").click();
    await expect
      .poll(async () => (await getDetail(page.request, workId)).work.settings.carouselEditorial?.approvedScriptRevision ?? "", { timeout: 60_000 })
      .not.toBe("");

    await page.getByTestId("carousel-prepare").click();
    await expect(page.getByTestId("carousel-generate")).toBeEnabled({ timeout: 120_000 });
    expect(await page.locator('[data-testid="carousel-generate"]').count()).toBe(1);
    const evidenceBeforeCover = deckEvidence(workId).length;
    await page.getByTestId("carousel-generate").click();

    await expect(page.getByTestId("carousel-generating")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          detail = await getDetail(page.request, workId);
          const cover = detail.carouselSlides.find((slide) => slide.position === 1);
          const interiors = detail.carouselSlides.filter((slide) => slide.position !== 1);
          if (cover?.status === "completed" && interiors.every((slide) => slide.status === "draft")) {
            return "cover-paused";
          }
          return `pending:${detail.carouselSlides.map((slide) => `${slide.position}:${slide.status}`).join(",") || "none"}`;
        },
        { timeout: 300_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe("cover-paused");
    expect(deckEvidence(workId)).toHaveLength(evidenceBeforeCover + 1);
    await expect(page.getByTestId("carousel-approve-cover")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("carousel-generate")).toHaveCount(0);

    const coverRevision = (await getDetail(page.request, workId)).work.inputSnapshot?.carousel?.preparedRevision;
    expect(coverRevision).toBeTruthy();

    await page.getByTestId("carousel-approve-cover").click();
    await expect
      .poll(
        async () => {
          detail = await getDetail(page.request, workId);
          const terminal = detail.carouselSlides.filter(
            (slide) => slide.status === "completed" || slide.status === "failed",
          );
          return terminal.length === plannedSlides.length && terminal.every((slide) => slide.status === "completed")
            ? "lote-complete"
            : `pending:${detail.carouselSlides.map((slide) => `${slide.position}:${slide.status}`).join(",") || "none"}`;
        },
        { timeout: 300_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe("lote-complete");
    expect(deckEvidence(workId).filter((row) => row.outcome === "success")).toHaveLength(plannedSlides.length);
    expect(deckEvidence(workId).filter((row) => row.outcome === "failure")).toHaveLength(0);

    await expect(page.getByTestId("carousel-deck-review")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("carousel-approve").click();
    await expect(page.getByText("Carrossel aprovado")).toBeVisible({ timeout: 60_000 });
    const approvedDetail = await getDetail(page.request, workId);
    const deckRevision = approvedDetail.carouselSlides[0]!.deckRevision;
    expect(approvedDetail.work.carouselApprovedRevision).toBe(deckRevision);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("carousel-export").click(),
    ]);
    const zipBuffer = fs.readFileSync(await download.path());
    const zip = await JSZip.loadAsync(zipBuffer);
    const pngNames = plannedSlides.map((_, index) => `${String(index + 1).padStart(2, "0")}.png`);
    expect(Object.keys(zip.files).sort()).toEqual([...pngNames, "manifest.json"].sort());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
      version: number;
      workId: string;
      deckRevision: string;
      caption: string | null;
      references: Array<{ title: string; url: string | null }>;
      slides: Array<{
        position: number;
        fileName: string;
        primaryText: string;
        outputHash: string;
      }>;
    };
    expect(manifest.version).toBe(1);
    expect(manifest.workId).toBe(workId);
    expect(manifest.deckRevision).toBe(deckRevision);
    expect(manifest.slides.map((slide) => slide.fileName)).toEqual(pngNames);
    expect(manifest.caption === null || typeof manifest.caption === "string").toBe(true);
    expect(Array.isArray(manifest.references)).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain("drafts/angles-hooks.md");
    const exportDetail = await getDetail(page.request, workId);
    for (const entry of manifest.slides) {
      const row = exportDetail.carouselSlides.find((slide) => slide.position === entry.position)!;
      expect(entry.primaryText).toBe(row.primaryText);
      const png = await zip.file(entry.fileName)!.async("nodebuffer");
      expect(createHash("sha256").update(png).digest("hex")).toBe(entry.outputHash);
    }

    await page.reload({ waitUntil: "commit" });
    await expect(page.getByTestId("carousel-deck-review")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Carrossel aprovado")).toBeVisible({ timeout: 60_000 });
    const reloadedDetail = await getDetail(page.request, workId);
    expect(reloadedDetail.carouselSlides.map((slide) => ({ id: slide.id, versionNumber: slide.versionNumber })))
      .toEqual(exportDetail.carouselSlides.map((slide) => ({ id: slide.id, versionNumber: slide.versionNumber })));
    expect(reloadedDetail.work.carouselApprovedRevision).toBe(deckRevision);

    const evidenceBeforeStale = deckEvidence(workId).length;
    const staleConfirm = await page.request.post(`/api/creative-work/${workId}/generate`, {
      data: { action: "initial", preparedRevision: "prep-old-session" },
    });
    expect(staleConfirm.status(), "old session confirm must be rejected").toBe(409);
    expect(deckEvidence(workId).length, "stale confirm must not dispatch").toBe(evidenceBeforeStale);
  });
});
