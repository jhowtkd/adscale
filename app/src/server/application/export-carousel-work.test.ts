import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselSlideStatus,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
}));
const carouselRepo = vi.hoisted(() => ({
  listCurrentCarouselSlides: vi.fn(),
  approveCarouselDeckRevision: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  objectStorage: { get: vi.fn() },
}));
const dbTxState = vi.hoisted(() => ({ selectRows: [] as unknown[] }));
const txMock = vi.hoisted(() => {
  const chain = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(dbTxState.selectRows.shift() ?? [])),
  };
  return chain;
});
const dbMock = vi.hoisted(() => ({
  transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: repo.getCreativeWork,
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: carouselRepo.listCurrentCarouselSlides,
  approveCarouselDeckRevision: carouselRepo.approveCarouselDeckRevision,
}));
vi.mock("@/server/storage", () => storage);
vi.mock("@/server/db", () => ({ db: dbMock }));

import {
  approveCarouselDeck,
  buildCarouselManifest,
  exportCarouselWork,
} from "./export-carousel-work";

const WORKSPACE = "workspace-1";
const WORK = "work-1";
const CONTRACT_HASH = "contract-hash-1";
const DECK_REVISION = "deck-r1";
const APPROVED_AT = "2026-08-30T12:00:00.000Z";

function visualContractFixture(): CarouselVisualContractV1 {
  const region = { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const };
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#112233"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: { id: "impact-v1", density: "high", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "impact" },
      development: { id: "development-v1", density: "medium", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "development" },
      respite: { id: "respite-v1", density: "low", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respite" },
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: CONTRACT_HASH,
  };
}

function deckFixture(slideCount = 5): CarouselDeckPlanV1 {
  const roles = ["hook", "context", "problem", "argument", "closing", "evidence", "method", "cta"] as const;
  return {
    version: 1,
    revision: DECK_REVISION,
    workId: WORK,
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: Array.from({ length: slideCount }, (_, index) => ({
      slideId: `slide-${index + 1}`,
      position: index + 1,
      role: roles[index],
      purpose: `Propósito ${index + 1}`,
      primaryText: `Texto primário ${index + 1} do grupo de terapia`,
      secondaryText: null,
      authority: "ai_proposal" as const,
      sourceFactIds: ["fact-1"],
      layoutFamily: index === 0 ? "impact" : index === slideCount - 1 ? "respite" : "development",
    })),
  };
}

function carouselSlideRow(
  overrides: Partial<CreativeWorkCarouselSlide>,
): CreativeWorkCarouselSlide {
  return {
    id: "slide-1",
    workspaceId: WORKSPACE,
    workItemId: WORK,
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: DECK_REVISION,
    position: 1,
    role: "hook",
    primaryText: "Gancho exato do grupo",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: ["fact-1"],
    layoutFamily: "impact",
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: CONTRACT_HASH,
    anchorKey: null,
    generationOperationKey: `${DECK_REVISION}:slide-1`,
    errorCode: null,
    quality: null,
    isCurrent: true,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    queuedAt: null,
    terminalAt: null,
    updatedAt: new Date("2026-08-30T10:00:00.000Z"),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

function completedSlideRow(position: number, overrides: Partial<CreativeWorkCarouselSlide> = {}) {
  const roles = ["hook", "context", "problem", "argument", "closing"] as const;
  return carouselSlideRow({
    id: `slide-${position}`,
    lineageId: `lineage-${position}`,
    position,
    role: roles[position - 1],
    layoutFamily: position === 1 ? "impact" : position === 5 ? "respite" : "development",
    primaryText: `Texto primário ${position} do grupo de terapia`,
    status: "completed",
    providerBaseKey: `base-${position}`,
    outputKey: `final-${position}`,
    previewKey: `final-${position}`,
    quality: { objectivePassed: true },
    ...overrides,
  });
}

function workFixture(overrides: Partial<CreativeWorkItem> = {}): { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] } {
  return {
    work: {
      id: WORK,
      workspaceId: WORKSPACE,
      toolKind: "carousel",
      status: "completed",
      clientProfileId: "profile-1",
      createdByUserId: "user-1",
      carouselApprovedRevision: null,
      carouselQuality: {
        version: 1,
        objectivePassed: true,
        advisoryWarnings: [],
        contactSheetKey: "sheet-key",
        reviewedAt: "2026-08-30T11:00:00.000Z",
      },
      updatedAt: new Date(APPROVED_AT),
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: "prep-1",
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
        },
      },
    } as CreativeWorkItem,
    outputs: [],
    sources: [],
    ...overrides,
  };
}

function approvedWorkFixture(): { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] } {
  return workFixture({
    work: { ...(workFixture().work as CreativeWorkItem), carouselApprovedRevision: DECK_REVISION },
  } as { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] });
}

function advisoryWorkFixture(): { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] } {
  return workFixture({
    work: {
      ...(workFixture().work as CreativeWorkItem),
      carouselApprovedRevision: null,
      carouselQuality: {
        version: 1,
        objectivePassed: true,
        advisoryWarnings: ["contraste baixo no slide 3"],
        contactSheetKey: "sheet-key",
        reviewedAt: "2026-08-30T11:00:00.000Z",
      },
    },
  } as { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] });
}

function completedDeck(order: number[] = [1, 2, 3, 4, 5]): CreativeWorkCarouselSlide[] {
  return order.map((position) => completedSlideRow(position));
}

async function collectStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbTxState.selectRows.length = 0;
  repo.getCreativeWork.mockResolvedValue(approvedWorkFixture());
  carouselRepo.listCurrentCarouselSlides.mockResolvedValue(completedDeck());
  carouselRepo.approveCarouselDeckRevision.mockImplementation(async () => approvedWorkFixture().work);
  storage.objectStorage.get.mockImplementation(async (key: string) => {
    const position = Number(String(key).replace("final-", ""));
    return Buffer.from(`png-bytes-${position}`);
  });
});

describe("approveCarouselDeck", () => {
  const input = { workspaceId: WORKSPACE, workItemId: WORK, revision: DECK_REVISION };

  beforeEach(() => {
    // The approval command reads the work row through the transaction mock.
    dbTxState.selectRows.push([workFixture().work]);
  });

  it("rejects a deck with missing positions", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue(completedDeck([1, 3, 4, 5]));

    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("deck_not_ready");
    const findings = (result.error.details as { findings: Array<{ code: string }> }).findings;
    expect(findings.some((finding) => finding.code === "missing_position")).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("rejects non-contiguous order when an out-of-range position appears", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue(completedDeck([1, 2, 3, 5, 6]));

    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const findings = (result.error.details as { findings: Array<{ code: string }> }).findings;
    expect(findings.some((finding) => finding.code === "missing_position")).toBe(true);
    expect(findings.some((finding) => finding.code === "non_contiguous")).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("rejects non-completed current slides", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      ...completedDeck([1, 2, 3, 4]),
      completedSlideRow(5, { status: "processing" as CarouselSlideStatus, outputKey: null }),
    ]);

    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const findings = (result.error.details as { findings: Array<{ code: string }> }).findings;
    expect(findings.some((finding) => finding.code === "slide_not_completed")).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("rejects objective failures on current slides but accepts advisory warnings", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      ...completedDeck([1, 2, 3, 4]),
      completedSlideRow(5, { quality: { objectivePassed: false } }),
    ]);

    const blocked = await approveCarouselDeck(input);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      const findings = (blocked.error.details as { findings: Array<{ code: string }> }).findings;
      expect(findings.some((finding) => finding.code === "objective_failed")).toBe(true);
    }
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();

    dbTxState.selectRows.push([advisoryWorkFixture().work]);
    // Advisory warnings live on the deck review, not on slide QA: the same
    // deck with every objective check passing must be approved.
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue(completedDeck());
    const accepted = await approveCarouselDeck(input);
    expect(accepted.ok).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      workItemId: WORK,
      deckRevision: DECK_REVISION,
    });
  });

  it("rejects slides whose visual contract hash does not match the frozen contract", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      ...completedDeck([1, 2, 3, 4]),
      completedSlideRow(5, { visualContractHash: "other-hash" }),
    ]);

    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const findings = (result.error.details as { findings: Array<{ code: string }> }).findings;
    expect(findings.some((finding) => finding.code === "contract_hash_mismatch")).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("rejects slides that do not belong to the workspace", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      ...completedDeck([1, 2, 3, 4]),
      completedSlideRow(5, { workspaceId: "workspace-other" }),
    ]);

    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const findings = (result.error.details as { findings: Array<{ code: string }> }).findings;
    expect(findings.some((finding) => finding.code === "foreign_workspace")).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("rejects a stale deck revision", async () => {
    const result = await approveCarouselDeck({ ...input, revision: "deck-r0" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("revision_conflict");
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });

  it("approves a fully completed deck and sets only carouselApprovedRevision", async () => {
    repo.getCreativeWork.mockResolvedValue(workFixture());
    const result = await approveCarouselDeck(input);

    expect(result.ok).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).toHaveBeenCalledTimes(1);
    expect(carouselRepo.approveCarouselDeckRevision).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      workItemId: WORK,
      deckRevision: DECK_REVISION,
    });
  });

  it("replays an already approved current revision without writing again", async () => {
    dbTxState.selectRows.length = 0;
    dbTxState.selectRows.push([approvedWorkFixture().work]);
    const result = await approveCarouselDeck(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replay).toBe(true);
    expect(carouselRepo.approveCarouselDeckRevision).not.toHaveBeenCalled();
  });
});

describe("exportCarouselWork", () => {
  it("exports an approved completed deck as ordered 01.png…NN.png plus manifest.json regardless of DB return order", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue(completedDeck([3, 1, 5, 2, 4]));

    const result = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const zipBuffer = await collectStream(result.value.stream);
    const zip = await JSZip.loadAsync(zipBuffer);
    expect(Object.keys(zip.files)).toEqual([
      "01.png", "02.png", "03.png", "04.png", "05.png", "manifest.json",
    ]);
    const manifest = JSON.parse(await zip.files["manifest.json"].async("string"));
    expect(manifest).toMatchObject({
      version: 1,
      workId: WORK,
      deckRevision: DECK_REVISION,
      format: "4:5",
      visualContractHash: CONTRACT_HASH,
      approvedAt: APPROVED_AT,
    });
    expect(manifest.slides).toHaveLength(5);
    expect(manifest.slides.map((slide: { position: number }) => slide.position)).toEqual([1, 2, 3, 4, 5]);
    expect(manifest.slides[0]).toMatchObject({
      position: 1,
      fileName: "01.png",
      slideId: "slide-1",
      lineageId: "lineage-1",
      versionNumber: 1,
      role: "hook",
      primaryText: "Texto primário 1 do grupo de terapia",
      secondaryText: null,
      copyAuthority: "ai_proposal",
      sourceFactIds: ["fact-1"],
      outputHash: createHash("sha256").update(Buffer.from("png-bytes-1")).digest("hex"),
    });
    expect(JSON.stringify(manifest)).not.toMatch(/outputKey|providerBaseKey|previewKey|anchorKey|prompt|storageKey/);
    // Buffers are loaded with bounded concurrency, once per slide, in position order.
    expect(storage.objectStorage.get).toHaveBeenCalledTimes(5);
    expect(storage.objectStorage.get).toHaveBeenCalledWith("final-1");
  });

  it("includes caption and references without changing PNG names, order or duplicating the manifest", async () => {
    const approved = approvedWorkFixture();
    const snapshot = (approved.work.inputSnapshot as { carousel: Record<string, unknown> }).carousel;
    repo.getCreativeWork.mockResolvedValue({
      ...approved,
      work: {
        ...approved.work,
        settings: {
          carouselEditorial: {
            version: 1,
            revision: "script-1",
            contextHash: "ctx-1",
            research: {
              status: "ready",
              question: "O grupo começa em agosto?",
              thesis: "Grupo de terapia começa em agosto",
              sources: [{
                id: "S1",
                url: "https://example.org/agenda",
                sourceId: null,
                title: "Agenda oficial",
                checkedOn: "2026-09-10",
                publicationDate: null,
                evidence: "Turmas em setembro",
                limitations: [],
                access: "opened",
              }],
              claims: [],
              gaps: [],
            },
            hooks: [],
            recommendedHookId: null,
            recommendation: null,
            selectedHookId: null,
            storyboard: [],
            caption: "Inscreva-se pelo direct",
            approvedScriptRevision: "script-1",
            approvedCover: null,
            confirmedInteriorsRevision: null,
          },
        },
        inputSnapshot: {
          ...approved.work.inputSnapshot,
          carousel: { ...snapshot, caption: "Inscreva-se pelo direct" },
        },
      },
    });

    const result = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const zipBuffer = await collectStream(result.value.stream);
    const zip = await JSZip.loadAsync(zipBuffer);
    expect(Object.keys(zip.files)).toEqual([
      "01.png", "02.png", "03.png", "04.png", "05.png", "manifest.json",
    ]);
    const manifest = JSON.parse(await zip.files["manifest.json"].async("string"));
    expect(manifest.version).toBe(1);
    expect(manifest.caption).toBe("Inscreva-se pelo direct");
    expect(manifest.references).toEqual([{ title: "Agenda oficial", url: "https://example.org/agenda" }]);
    expect(Object.keys(zip.files).filter((name) => name.endsWith(".json"))).toEqual(["manifest.json"]);
  });

  it("rebuilds the same manifest on replay", async () => {
    const first = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });
    const second = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.manifest).toEqual(first.value.manifest);
  });

  it("refuses to export a deck that is not approved for the current revision", async () => {
    repo.getCreativeWork.mockResolvedValue(
      workFixture({
        work: { ...(workFixture().work as CreativeWorkItem), carouselApprovedRevision: null },
      } as { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] }),
    );

    const result = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("deck_not_approved");
  });

  it("refuses an incomplete deck", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      ...completedDeck([1, 2, 3, 4]),
      completedSlideRow(5, { status: "processing" as CarouselSlideStatus, outputKey: null }),
    ]);

    const result = await exportCarouselWork({ workspaceId: WORKSPACE, workItemId: WORK });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("deck_not_ready");
  });
});

describe("buildCarouselManifest", () => {
  it("builds the exact CarouselManifestV1 shape with no storage keys, prompts or provider metadata", () => {
    const deck = completedDeck([2, 1]);
    const manifest = buildCarouselManifest({
      work: workFixture().work,
      deckRevision: DECK_REVISION,
      approvedAt: APPROVED_AT,
      slides: [
        { ...deck[0], outputHash: createHash("sha256").update(Buffer.from("png-bytes-2")).digest("hex") },
        { ...deck[1], outputHash: createHash("sha256").update(Buffer.from("png-bytes-1")).digest("hex") },
      ],
    });

    expect(manifest.version).toBe(1);
    expect(manifest.workId).toBe(WORK);
    expect(manifest.deckRevision).toBe(DECK_REVISION);
    expect(manifest.format).toBe("4:5");
    expect(manifest.visualContractHash).toBe(CONTRACT_HASH);
    expect(manifest.approvedAt).toBe(APPROVED_AT);
    expect(manifest.slides.map((slide) => slide.position)).toEqual([1, 2]);
    expect(Object.keys(manifest.slides[0]).sort()).toEqual([
      "copyAuthority", "fileName", "lineageId", "outputHash", "position",
      "primaryText", "role", "secondaryText", "slideId", "sourceFactIds", "versionNumber",
    ].sort());
    expect(JSON.stringify(manifest)).not.toMatch(/outputKey|providerBaseKey|previewKey|anchorKey|prompt|storageKey|quality/);
  });
});
