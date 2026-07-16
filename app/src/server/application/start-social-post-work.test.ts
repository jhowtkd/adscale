import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWork: vi.fn(),
  createCreativeWorkDraft: vi.fn(),
}));

import { getClientProfile } from "@/server/repositories/client-reference";
import { createCreativeWork, createCreativeWorkDraft } from "@/server/repositories/creative-work";
import {
  buildSocialPostCreateInput,
  SOCIAL_POST_TOOL_KIND,
  startSocialPostWork,
} from "./start-social-post-work";

const mockProfile = vi.mocked(getClientProfile);
const mockCreate = vi.mocked(createCreativeWork);
const mockCreateDraft = vi.mocked(createCreativeWorkDraft);

const profileId = "00000000-0000-4000-8000-000000000001";
const brief = {
  theme: "Novo produto",
  objective: "Gerar interesse",
  audience: "Empreendedores",
  offer: "Teste gratuito",
};

describe("buildSocialPostCreateInput", () => {
  it("always forces toolKind social_post", () => {
    const input = buildSocialPostCreateInput({
      workspaceId: "ws-1",
      userId: "u-1",
      clientProfileId: profileId,
      format: "4:5",
      brief,
    });
    expect(input.toolKind).toBe(SOCIAL_POST_TOOL_KIND);
    expect(input.toolKind).toBe("social_post");
  });
});

describe("startSocialPostWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unknown profile without creating work", async () => {
    mockProfile.mockResolvedValue(null);
    const result = await startSocialPostWork({
      workspaceId: "ws-1",
      userId: "u-1",
      clientProfileId: profileId,
      format: "4:5",
      brief,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("client_profile_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates creative_work origin with social_post intent and no campaign", async () => {
    mockProfile.mockResolvedValue({ id: profileId } as never);
    mockCreate.mockResolvedValue({
      id: "work-1",
      workspaceId: "ws-1",
      clientProfileId: profileId,
      createdByUserId: "u-1",
      toolKind: "social_post",
      status: "draft",
      brief,
      format: "4:5",
      copy: null,
      identitySnapshot: null,
      createdAt: new Date("2026-07-13T12:00:00.000Z"),
      updatedAt: new Date("2026-07-13T12:00:00.000Z"),
    } as never);

    const result = await startSocialPostWork({
      workspaceId: "ws-1",
      userId: "u-1",
      clientProfileId: profileId,
      format: "4:5",
      brief,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolKind: "social_post",
        workspaceId: "ws-1",
        format: "4:5",
      })
    );
    // Persistence path is creative_work only (no campaign id in create payload).
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("campaignId");

    expect(result.value.canonical.id).toBe("creative_work:work-1");
    expect(result.value.canonical.originKind).toBe("creative_work");
    expect(result.value.canonical.intent).toEqual({
      kind: "social_post",
      objective: "Gerar interesse",
      formatHint: "4:5",
      platforms: [],
    });
    expect(result.value.canonical.resumeHref).toContain("create-post");
    expect(result.value.work.id).toBe("work-1");
  });

  it("creates an idempotent nullable-brief draft from the one-field contract", async () => {
    mockProfile.mockResolvedValue({ id: profileId } as never);
    mockCreateDraft.mockResolvedValue({
      id: "work-draft", workspaceId: "ws-1", clientProfileId: profileId,
      createdByUserId: "u-1", draftKey: "draft-key", toolKind: "variations",
      title: "Promoção de matrícula para julho", request: "Promoção de matrícula para julho",
      status: "draft", brief: null, format: "4:5", settings: { targetFormats: [] },
      copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await startSocialPostWork({
      workspaceId: "ws-1", userId: "u-1", clientProfileId: profileId,
      draftKey: "draft-key", request: "Promoção de matrícula para julho",
      intent: "variations", format: "4:5", settings: { targetFormats: [] },
    });
    expect(result.ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: "draft-key", brief: null, title: "Promoção de matrícula para julho",
    }));
    expect(mockCreateDraft.mock.calls[0][0]).not.toHaveProperty("campaignId");
    if (result.ok) expect(result.value.quote).toMatchObject({ unitCount: 3, credits: 15 });
  });

  it("returns the same repository draft for a repeated draft key", async () => {
    const persisted = {
      id: "same-work", workspaceId: "ws-1", clientProfileId: profileId, createdByUserId: "u-1",
      draftKey: "draft-key", toolKind: "single", title: "Uma peça", request: "Uma peça",
      status: "draft", brief: null, format: "4:5", settings: { targetFormats: [] },
      copy: null, identitySnapshot: null, createdAt: new Date(), updatedAt: new Date(),
    } as never;
    mockProfile.mockResolvedValue({ id: profileId } as never);
    mockCreateDraft.mockResolvedValue(persisted);
    const input = { workspaceId: "ws-1", userId: "u-1", clientProfileId: profileId,
      draftKey: "draft-key", request: "Uma peça", intent: "single" as const,
      format: "4:5" as const, settings: { targetFormats: [] } };
    const [first, second] = await Promise.all([startSocialPostWork(input), startSocialPostWork(input)]);
    expect(first.ok && first.value.work.id).toBe("same-work");
    expect(second.ok && second.value.work.id).toBe("same-work");
    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });
});
