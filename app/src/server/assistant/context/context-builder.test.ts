import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAssistantContext } from "./context-builder";

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
  AssistantThreadValidationError: class extends Error {},
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  listAssistantMessages: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/db/repositories/brand-kit", () => ({
  getBrandKit: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-context", () => ({
  getBrandMemoryContext: vi.fn(),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { listAssistantMessages } from "@/server/repositories/assistant-message";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCampaignById } from "@/server/repositories/campaign";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockListMessages = vi.mocked(listAssistantMessages);
const mockGetProfile = vi.mocked(getClientProfile);
const mockGetCampaign = vi.mocked(getCampaignById);
const mockGetBrandKit = vi.mocked(getBrandKit);
const mockGetBrandMemory = vi.mocked(getBrandMemoryContext);

const baseInput = {
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
};

describe("buildAssistantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      campaignId: "camp-1",
      name: "Main",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockGetProfile.mockResolvedValue({
      id: "profile-1",
      name: "Acme",
      description: "SaaS",
      toneNotes: "Professional",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockGetCampaign.mockResolvedValue({
      id: "camp-1",
      name: "Launch",
      objective: "Awareness",
      audience: "B2B",
      platforms: ["meta"],
      status: "active",
      clientProfileId: "profile-1",
      description: "https://bucket.r2.cloudflarestorage.com/file?X-Amz-Signature=abc",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockListMessages.mockResolvedValue([
      {
        id: "m1",
        type: "user",
        content: "Hello",
        payload: {},
      },
      {
        id: "m2",
        type: "tool",
        content: "Context loaded",
        payload: { toolName: "get_thread_context", summary: "Snapshot", rawArgs: { secret: true } },
      },
    ] as Awaited<ReturnType<typeof listAssistantMessages>>);
    mockGetBrandKit.mockResolvedValue({
      toneNotes: "Friendly",
      visualNotes: "Clean",
      constraints: "No red",
    } as Awaited<ReturnType<typeof getBrandKit>>);
    mockGetBrandMemory.mockResolvedValue({ items: [], block: "Brand prefers short CTAs." });
  });

  it("returns allowlisted context with six categories", async () => {
    const result = await buildAssistantContext(baseInput);

    expect(result.thread.name).toBe("Main");
    expect(result.clientProfile?.name).toBe("Acme");
    expect(result.campaign?.name).toBe("Launch");
    expect(result.recentMessages).toHaveLength(2);
    expect(result.brandKit?.toneNotes).toBe("Friendly");
    expect(result.brandMemory?.block).toContain("CTAs");
  });

  it("redacts signed URLs in output", async () => {
    const result = await buildAssistantContext(baseInput);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/X-Amz-Signature/);
    expect(serialized).not.toMatch(/r2\.cloudflarestorage/);
  });

  it("exposes tool summary only without rawArgs", async () => {
    const result = await buildAssistantContext(baseInput);
    const toolMessage = result.recentMessages.find((m) => m.role === "tool");
    expect(toolMessage?.toolName).toBe("get_thread_context");
    expect(toolMessage?.summary).toBe("Snapshot");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/rawArgs/);
  });

  it("throws on client profile mismatch", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "other-profile",
      name: "Main",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    await expect(buildAssistantContext(baseInput)).rejects.toThrow(
      "Thread client profile mismatch"
    );
  });

  it("serialized JSON excludes denylist keys", async () => {
    const result = await buildAssistantContext(baseInput);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/signedUrl|reasoning|thinking|internalEvidence/);
  });
});
