import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraft: vi.fn(),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn() }));
vi.mock("@/server/creative-work/copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("./generate-social-post-copy", () => ({ generateSocialPostCopy: vi.fn() }));

import { generateSocialPostCopy } from "@/server/creative-work/copy";
import { getCreativeWork, updateCreativeWorkDraft } from "@/server/repositories/creative-work";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { prepareCreativeWork } from "./prepare-creative-work";
import { generateSocialPostCopy as generatePaidCopy } from "./generate-social-post-copy";

const getWork = vi.mocked(getCreativeWork);
const updateDraft = vi.mocked(updateCreativeWorkDraft);
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
    getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Direto", requiredElements: null, prohibitedElements: null } as never);
    generateCopy.mockResolvedValue({ headline: "Julho", body: "Matricule-se", cta: "Saiba mais" });
    updateDraft.mockImplementation(async (_ws, _id, patch) => ({ ...work, ...patch } as never));
  });

  it("persists inferred brief and pure copy without a billing adapter", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(generatePaidCopy).not.toHaveBeenCalled();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", expect.objectContaining({
      brief: expect.objectContaining({ theme: "Promoção de matrícula para julho" }),
      copy: { headline: "Julho", body: "Matricule-se", cta: "Saiba mais" },
    }));
    if (result.ok) expect(result.value.quote).toHaveLength(3);
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
