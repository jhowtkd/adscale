import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Studio Carousel — full controlled-provider acceptance gate (Task 10).
 *
 * Drives the whole deck lifecycle once, in one serial scenario:
 *   1. choose `Criar carrossel`
 *   2. enter a raw long text
 *   3. answer one controlled blocking question
 *   4. receive five slides
 *   5. accept one suggestion and human-edit another
 *   6. reorder with the accessible button
 *   7. prepare and click `Gerar carrossel` once
 *   8. observe cover, middle, closing, then remaining states without an
 *      intermediate button
 *   9. inject `[e2e:hard-fail-once]` into one non-anchor purpose and verify
 *      only it fails
 *  10. retry only that slide and preserve sibling IDs
 *  11. change one completed slide's copy and prove provider-call evidence
 *      count does not increase
 *  12. approve the deck
 *  13. download ZIP and assert `01.png`…`05.png` + manifest order/copy/hash
 *  14. reload the work and verify the same current versions and approval
 *
 * Requires the local app on :3000 started exactly like the Create Post gate:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true \
 *   CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true \
 *   STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100 \
 *   STUDIO_CAROUSEL_ROLLOUT_PERCENT=100 \
 *   npm run dev:next
 * plus `npm run inngest:dev` and a fresh `npm run seed:create-post-e2e`.
 * The login/profile/credits fixture is REUSED — this spec never seeds
 * anything and never calls a live provider.
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
    settings: {
      carouselDraft: {
        plan: {
          revision: string;
          slides: Array<{ slideId: string; position: number; purpose: string }>;
        } | null;
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

/** Long raw operator text — every word stays grounded for the deck copy. */
const RAW_LONG_TEXT = [
  "O ateliê de cerâmica da Marina abre agenda para setembro com turmas noturnas de modelagem manual.",
  "Cada encontro inclui preparação da argila, orientação de torneta e queima assistida no forno do estúdio.",
  "As vagas da turma de quarta-feira são limitadas e a lista de espera abre no fim de agosto.",
  "O endereço do galpão fica na região central e o estacionamento é gratuito para alunos matriculados.",
].join(" ");

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

function evidenceCount(): number {
  return readEvidence().length;
}

function slidePrefix(workId: string, slideId: string): string {
  return `creative-work/${workId}/carousel/slides/${slideId}`;
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

/**
 * The sequence board is a draggable strip whose fixed-width cards can
 * overlap at 1280px, so native pointer clicks on its buttons can start an
 * HTML5 drag that never ends. The accessible buttons are driven through
 * their real click handlers instead — same code path, no drag ghost.
 */
async function clickBoardButton(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((button: HTMLElement) => button.click());
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
  const origin = process.env.E2E_BASE_URL ?? "http://localhost:3106";
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: fixture.email, password: fixture.password },
    headers: { Origin: origin },
  });
  expect(response.ok(), `E2E login must succeed (got ${response.status()})`).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test.describe("Studio Carousel controlled-provider gate", () => {
  let workId = "";

  test("creates, generates, repairs, approves and exports the deck", async ({ page }) => {
    test.setTimeout(600_000);
    const fixture = loadFixture();
    await login(page, fixture);
    await page.addInitScript((activeClientProfileId) => {
      localStorage.setItem("adscale-storage", JSON.stringify({
        state: { sidebarCollapsed: false, activeClientProfileId }, version: 0,
      }));
    }, fixture.primaryClientProfileId);

    // -- Steps 1 + 2: choose `Criar carrossel` with a raw long text ---------
    await page.goto("/", { waitUntil: "commit" });
    const requestBox = page.locator("#creative-composer-request");
    await expect(requestBox).toBeVisible({ timeout: 30_000 });
    await expect(requestBox).toHaveCount(1);
    const carouselCard = page.getByRole("radio", { name: /criar carrossel/i });
    // The free-entry fill can race hydration; retry until the objective cards
    // confirm the composer state.
    await expect(async () => {
      await requestBox.fill(`${RAW_LONG_TEXT} [e2e:ask-once]`);
      await expect(requestBox).toHaveValue(`${RAW_LONG_TEXT} [e2e:ask-once]`, { timeout: 5_000 });
      await expect(carouselCard).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await carouselCard.click();
    // The card click itself creates the draft: progressive selectIntent ->
    // ensureDraft -> exposeWorkId rewrites the URL. In `next dev` a rebuild
    // commit can restore the stale canonical "/" and wipe that query while
    // the create request is still compiling, so resolve the id from the
    // product's own draft-resume key as a fallback, then canonicalize the
    // URL through the server-rendered resume route (same pattern as the
    // Create Post gate) so later reloads keep the work addressable.
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
    // The carousel entry keeps the same free-entry text.
    await expect(page.locator("#creative-composer-request")).toHaveValue(`${RAW_LONG_TEXT} [e2e:ask-once]`);
    await expect(page.locator("#creative-composer-request")).toHaveCount(1);

    // -- Step 3: answer one controlled blocking question --------------------
    await page.getByTestId("carousel-organize").click();
    const questions = page.getByTestId("carousel-questions");
    await expect(questions).toBeVisible({ timeout: 120_000 });
    await expect(questions.locator("input")).toHaveCount(1);
    const questionInput = questions.locator("input").first();
    await questionInput.fill("Lista de espera pelo direct do ateliê");
    const box = page.getByTestId("studio-talk-box");
    await box.getByRole("button", { name: "Recolher controles" }).click();
    await expect(box).toHaveAttribute("data-expanded", "false");
    await box.getByRole("button", { name: "Abrir controles" }).click();
    await expect(questionInput).toHaveValue("Lista de espera pelo direct do ateliê");
    await page.getByTestId("carousel-answer-submit").click();

    // -- Step 4: receive five slides ----------------------------------------
    await expect(page.getByTestId("carousel-questions")).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText("Mesa de sequência")).toBeVisible({ timeout: 30_000 });
    let detail = await getDetail(page.request, workId);
    expect(detail.work.toolKind).toBe("carousel");
    expect(detail.carouselSlides).toHaveLength(0);
    const plannedSlides = detail.work.settings.carouselDraft?.plan?.slides ?? [];
    expect(plannedSlides).toHaveLength(5);
    expect(plannedSlides.map((slide) => slide.position)).toEqual([1, 2, 3, 4, 5]);

    // -- Step 5: accept one suggestion and human-edit another ---------------
    await clickBoardButton(page, "carousel-slide-2");
    await expect(page.getByTestId("carousel-slide-2")).toHaveAttribute("aria-current", "true", { timeout: 30_000 });
    const suggestion = page.getByTestId("carousel-suggestion-change-1");
    await expect(suggestion).toBeVisible();
    await suggestion.getByRole("button", { name: "Aceitar" }).click();
    await expect(suggestion).toBeHidden({ timeout: 30_000 });

    await clickBoardButton(page, "carousel-slide-4");
    await expect(page.getByTestId("carousel-slide-4")).toHaveAttribute("aria-current", "true", { timeout: 30_000 });
    const purposeInput = page.getByLabel("Propósito");
    await purposeInput.fill("Agenda de setembro no ateliê [e2e:hard-fail-once]");
    await expect
      .poll(async () => (await getDetail(page.request, workId)).work.settings.carouselDraft?.plan?.slides
        .find((slide) => slide.position === 4)?.purpose ?? "", { timeout: 30_000 })
      .toContain("[e2e:hard-fail-once]");

    // -- Step 6: reorder with the accessible button -------------------------
    const beforeOrder = (await getDetail(page.request, workId)).work.settings.carouselDraft?.plan?.slides ?? [];
    await clickBoardButton(page, "carousel-move-down-2");
    await expect
      .poll(async () => (await getDetail(page.request, workId)).work.settings.carouselDraft?.plan?.slides ?? [], { timeout: 30_000 })
      .toEqual(beforeOrder.map((slide, index) => {
        const moved = index === 1 ? beforeOrder[2] : index === 2 ? beforeOrder[1] : slide;
        return { ...moved, position: index + 1 };
      }));

    // -- Step 7: prepare and click `Gerar carrossel` once -------------------
    await page.getByTestId("carousel-prepare").click();
    await expect(page.getByTestId("carousel-generate")).toBeEnabled({ timeout: 120_000 });
    const generateClicks = page.locator('[data-testid="carousel-generate"]');
    expect(await generateClicks.count()).toBe(1);
    await generateClicks.click();

    // -- Steps 8 + 9: cover → middle → closing → remaining; only the marked
    // slide fails -------------------------------------------------------------
    await expect(page.getByTestId("carousel-generating")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("carousel-composer")).toHaveCount(1);
    await expect(page.getByTestId("studio-results-surface").getByTestId("carousel-progress")).toBeVisible();
    await expect(page.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "false");
    // No intermediate button: the generate control disappears while the chain runs.
    await expect(page.getByTestId("carousel-generate")).toHaveCount(0);
    // Fail fast when Inngest never claims a slide, instead of waiting 300s.
    // `queued` proves nothing: the generate request writes it synchronously
    // (settlement reserve -> queueCarouselSlide), which is also what makes the
    // `carousel-generating` phase above appear. Only the job itself writes
    // `processing` (markCarouselSlideProcessing), so that -- or a terminal
    // state -- is the first evidence the worker actually picked the slide up.
    await expect
      .poll(
        async () => {
          detail = await getDetail(page.request, workId);
          return detail.carouselSlides.some((slide) =>
            slide.status === "processing"
            || slide.status === "completed"
            || slide.status === "failed",
          )
            ? "claimed"
            : `unclaimed:${detail.carouselSlides.map((slide) => `${slide.position}:${slide.status}`).join(",") || "none"}`;
        },
        { timeout: 60_000, intervals: [1_000, 2_000] },
      )
      .toBe("claimed");
    await expect
      .poll(
        async () => {
          detail = await getDetail(page.request, workId);
          const terminal = detail.carouselSlides.filter(
            (slide) => slide.status === "completed" || slide.status === "failed",
          );
          return terminal.length === 5 ? terminal.map((slide) => `${slide.position}:${slide.status}`).sort().join(",") : "pending";
        },
        { timeout: 300_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe("1:completed,2:completed,3:completed,4:failed,5:completed");

    // The deterministic chain order is proven by the provider evidence: cover,
    // middle and closing complete before the remaining pair, and the marked
    // non-anchor purpose is the ONLY provider failure with the marker. The
    // `[e2e:ask-once]` marker legitimately travels inside the frozen request
    // text (same contract as the Create Post gate markers).
    const evidence = readEvidence();
    const deckEvidence = evidence.filter((row) => row.outputPrefix.startsWith(`creative-work/${workId}/carousel/slides/`));
    const failedRows = deckEvidence.filter((row) => row.outcome === "failure");
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]!.promptMarkers).toContain("[e2e:hard-fail-once]");
    expect(failedRows[0]!.attempt).toBe(0);
    const succeededRows = deckEvidence.filter((row) => row.outcome === "success");
    expect(succeededRows).toHaveLength(4);
    for (const row of deckEvidence) {
      const expectedMarkers = row === failedRows[0] ? ["[e2e:hard-fail-once]"] : [];
      expect(
        row.promptMarkers.filter((marker) => marker !== "[e2e:ask-once]"),
        `unexpected failure marker in ${row.outputPrefix}`,
      ).toEqual(expectedMarkers);
    }
    detail = await getDetail(page.request, workId);
    const positionByPrefix = new Map(
      detail.carouselSlides.map((slide) => [slidePrefix(workId, slide.id), slide.position]),
    );
    const tsByPosition = new Map<number, string[]>();
    for (const row of deckEvidence) {
      const position = positionByPrefix.get(row.outputPrefix);
      if (!position) continue;
      tsByPosition.set(position, [...(tsByPosition.get(position) ?? []), row.ts]);
    }
    // ISO-UTC timestamps compare correctly as strings; Math.max/min would
    // coerce them to NaN and fail this check on valid evidence.
    const anchorTs = [1, 3, 5].flatMap((position) => tsByPosition.get(position) ?? []);
    const lastAnchorTs = anchorTs.length > 0 ? anchorTs.reduce((acc, ts) => (ts > acc ? ts : acc)) : "0";
    for (const position of [2, 4]) {
      const fillerTs = tsByPosition.get(position) ?? [];
      const firstTs = fillerTs.length > 0 ? fillerTs.reduce((acc, ts) => (ts < acc ? ts : acc)) : "9";
      expect(
        firstTs > lastAnchorTs,
        `position ${position} must only run after the anchor trio`,
      ).toBe(true);
    }

    // -- Step 10: retry only that slide and preserve sibling IDs ------------
    const beforeRetry = await getDetail(page.request, workId);
    const siblings = beforeRetry.carouselSlides.filter((slide) => slide.position !== 4);
    await expect(page.getByTestId("carousel-review-retry-4")).toBeVisible();
    await page.getByTestId("carousel-review-retry-4").click();
    await expect
      .poll(
        async () => {
          const current = await getDetail(page.request, workId);
          return current.carouselSlides.map((slide) => `${slide.position}:${slide.status}`).sort().join(",");
        },
        { timeout: 300_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe("1:completed,2:completed,3:completed,4:completed,5:completed");
    const afterRetry = await getDetail(page.request, workId);
    for (const sibling of siblings) {
      const current = afterRetry.carouselSlides.find((slide) => slide.position === sibling.position);
      expect(current?.id, `sibling id at position ${sibling.position} must be preserved`).toBe(sibling.id);
      expect(current?.versionNumber).toBe(sibling.versionNumber);
    }
    const retried = afterRetry.carouselSlides.find((slide) => slide.position === 4)!;
    expect(retried.id).not.toBe(beforeRetry.carouselSlides.find((slide) => slide.position === 4)!.id);
    expect(retried.parentSlideId).toBe(beforeRetry.carouselSlides.find((slide) => slide.position === 4)!.id);
    expect(retried.lineageId).toBe(beforeRetry.carouselSlides.find((slide) => slide.position === 4)!.lineageId);
    // The retry settles exactly one new provider call (attempt 1, no marker failure).
    const retryRows = readEvidence().filter((row) => row.outputPrefix === slidePrefix(workId, retried.id));
    expect(retryRows).toHaveLength(1);
    expect(retryRows[0]).toMatchObject({ attempt: 1, outcome: "success" });

    // -- Step 11: copy-only revision never calls the provider ----------------
    const evidenceBeforeCopy = evidenceCount();
    const copyTarget = afterRetry.carouselSlides.find((slide) => slide.position === 2)!;
    const revisionKey = crypto.randomUUID();
    const copyRes = await page.request.post(
      `/api/creative-work/${workId}/carousel/slides/${copyTarget.id}/revise`,
      {
        data: {
          kind: "copy",
          expectedVersion: copyTarget.versionNumber,
          revisionKey,
          primaryText: "Turmas noturnas de modelagem no ateliê",
          secondaryText: null,
        },
      },
    );
    // Copy revisions are synchronous: the slide route answers 200 (only the
    // async visual/retry kinds answer 202).
    expect(copyRes.status(), `copy revision must succeed (got ${copyRes.status()})`).toBe(200);
    const copyBody = (await copyRes.json()) as { slide: CarouselSlideRow };
    expect(copyBody.slide.copyAuthority).toBe("human_edit");
    expect(copyBody.slide.versionNumber).toBe(copyTarget.versionNumber + 1);
    expect(copyBody.slide.primaryText).toBe("Turmas noturnas de modelagem no ateliê");
    await expect
      .poll(async () => (await getDetail(page.request, workId)).carouselSlides.find((slide) => slide.position === 2)?.id, { timeout: 30_000 })
      .toBe(copyBody.slide.id);
    expect(evidenceCount(), "copy-only revision must not add provider calls").toBe(evidenceBeforeCopy);
    expect(readEvidence().some((row) => row.outputPrefix === slidePrefix(workId, copyBody.slide.id))).toBe(false);

    // -- Step 12: approve the deck -------------------------------------------
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByTestId("carousel-deck-review")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("carousel-approve").click();
    await expect(page.getByText("Carrossel aprovado")).toBeVisible({ timeout: 60_000 });
    const approvedDetail = await getDetail(page.request, workId);
    const deckRevision = approvedDetail.carouselSlides[0]!.deckRevision;
    expect(approvedDetail.work.carouselApprovedRevision).toBe(deckRevision);

    // -- Step 13: download ZIP and assert order/copy/hash --------------------
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("carousel-export").click(),
    ]);
    const zipBuffer = fs.readFileSync(await download.path());
    const zip = await JSZip.loadAsync(zipBuffer);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["01.png", "02.png", "03.png", "04.png", "05.png", "manifest.json"]);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
      version: number;
      workId: string;
      deckRevision: string;
      slides: Array<{
        position: number;
        fileName: string;
        slideId: string;
        lineageId: string;
        versionNumber: number;
        primaryText: string;
        secondaryText: string | null;
        copyAuthority: string;
        outputHash: string;
      }>;
    };
    expect(manifest.version).toBe(1);
    expect(manifest.workId).toBe(workId);
    expect(manifest.deckRevision).toBe(deckRevision);
    expect(manifest.slides.map((slide) => slide.position)).toEqual([1, 2, 3, 4, 5]);
    expect(manifest.slides.map((slide) => slide.fileName)).toEqual(["01.png", "02.png", "03.png", "04.png", "05.png"]);
    const exportDetail = await getDetail(page.request, workId);
    for (const entry of manifest.slides) {
      const row = exportDetail.carouselSlides.find((slide) => slide.position === entry.position)!;
      expect(entry.slideId).toBe(
        approvedDetail.work.settings.carouselDraft?.plan?.slides.find((plan) => plan.position === entry.position)?.slideId,
      );
      expect(entry.lineageId).toBe(row.lineageId);
      expect(entry.versionNumber).toBe(row.versionNumber);
      expect(entry.primaryText).toBe(row.primaryText);
      expect(entry.secondaryText).toBe(row.secondaryText);
      expect(entry.copyAuthority).toBe(row.copyAuthority);
      const png = await zip.file(entry.fileName)!.async("nodebuffer");
      expect(createHash("sha256").update(png).digest("hex")).toBe(entry.outputHash);
    }

    // -- Step 14: reload and verify the same current versions and approval ---
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByTestId("carousel-deck-review")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Carrossel aprovado")).toBeVisible({ timeout: 60_000 });
    const reloadedDetail = await getDetail(page.request, workId);
    expect(reloadedDetail.carouselSlides.map((slide) => ({ id: slide.id, versionNumber: slide.versionNumber })))
      .toEqual(exportDetail.carouselSlides.map((slide) => ({ id: slide.id, versionNumber: slide.versionNumber })));
    expect(reloadedDetail.work.carouselApprovedRevision).toBe(deckRevision);
    expect(reloadedDetail.work.carouselApprovedRevision).toBe(approvedDetail.work.carouselApprovedRevision);
  });
});
