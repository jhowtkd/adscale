import { beforeEach, describe, expect, it, vi } from "vitest";

const inferBrief = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  withCreativeWorkPreparationLock: vi.fn(async (_workspaceId, _workItemId, callback) => callback()),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn() }));
vi.mock("@/server/creative-work/copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("./generate-social-post-copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("@/server/creative-work/prepare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/prepare")>()),
  inferSocialPostBrief: inferBrief,
}));

import { generateSocialPostCopy } from "@/server/creative-work/copy";
import {
  getCreativeWork,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { prepareCreativeWork } from "./prepare-creative-work";
import { generateSocialPostCopy as generatePaidCopy } from "./generate-social-post-copy";

const getWork = vi.mocked(getCreativeWork);
const updateDraft = vi.mocked(updateCreativeWorkDraftIfUnchanged);
const withLock = vi.mocked(withCreativeWorkPreparationLock);
const getKit = vi.mocked(getBrandKit);
const generateCopy = vi.mocked(generateSocialPostCopy);
const now = new Date("2026-07-16T12:00:00.000Z");
const work = {
  id: "work-1", workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
  draftKey: "draft-1", title: "Promoção", request: "Promoção de matrícula para julho", campaignId: null,
  toolKind: "variations", status: "draft", brief: null, format: "4:5", settings: { targetFormats: [] },
  inputSnapshot: null, copy: null, identitySnapshot: null, createdAt: now, updatedAt: now,
} as const;

describe("prepareCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withLock.mockImplementation(async (_workspaceId, _workItemId, callback) => callback() as never);
    getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Direto", requiredElements: null, prohibitedElements: null } as never);
    generateCopy.mockResolvedValue({ headline: "Julho", body: "Matricule-se", cta: "Saiba mais" });
    inferBrief.mockReturnValue({ theme: work.request, objective: "Promover matrícula", audience: "Público", offer: "Matrícula" });
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => ({ ...work, ...patch } as never));
  });

  it("persists inferred brief and pure copy without a billing adapter", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(generatePaidCopy).not.toHaveBeenCalled();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      brief: expect.objectContaining({ theme: "Promoção de matrícula para julho" }),
      copy: { headline: "Julho", body: "Matricule-se", cta: "Saiba mais" },
    }));
    if (result.ok) expect(result.value.quote).toMatchObject({ unitCount: 3, credits: 15 });
  });

  it("serializes identical concurrent prepares and calls copy once", async () => {
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    let tail = Promise.resolve();
    withLock.mockImplementation((_ws, _id, callback) => {
      const run = tail.then(callback);
      tail = run.then(() => undefined);
      return run as never;
    });
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });
    const [first, second] = await Promise.all([
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("returns stale input when CAS loses to autosave or source change", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    updateDraft.mockResolvedValue(null);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "stale_input" } });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.any(Object));
  });

  it("rejects a non-draft before inference or copy", async () => {
    getWork.mockResolvedValue({ work: { ...work, status: "ready" }, outputs: [], sources: [] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "work_not_draft" } });
    expect(inferBrief).not.toHaveBeenCalled();
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("rejects malformed inferred briefs before copy or persistence", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: "" });
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "invalid_preparation" } });
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["request", { request: "Pedido anterior", settings: work.settings, sources: [] }],
    ["settings", { request: work.request, settings: { targetFormats: ["1:1"] }, sources: [] }],
    ["source timestamp", { request: work.request, settings: work.settings, sources: [{ sourceId: "source-1", updatedAt: "2026-07-15T00:00:00.000Z" }] }],
  ])("invalidates cached preparation when %s changes", async (_case, inputSnapshot) => {
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: _case === "source timestamp" ? [{
      id: "source-1", status: "ready", updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      usage: "content", contentAnalysis: null, styleAnalysis: null,
    }] : [] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("reuses persisted preparation when the input snapshot is unchanged", async () => {
    const snapshot = { request: work.request, settings: work.settings, sources: [] };
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot: snapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("blocks while a source is still analyzing", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [{ status: "analyzing" }] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "sources_not_ready" } });
    expect(generateCopy).not.toHaveBeenCalled();
  });
});
