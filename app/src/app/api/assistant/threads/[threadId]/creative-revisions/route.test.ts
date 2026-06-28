import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ workspace: { id: "ws-1" } })
  ),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/creative-iteration/draft", () => ({
  getCreativeFeedbackDraft: vi.fn(),
  saveCreativeFeedbackDraft: vi.fn(),
  CreativeFeedbackDraftValidationError: class CreativeFeedbackDraftValidationError extends Error {
    name = "CreativeFeedbackDraftValidationError";
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  getCreativeFeedbackDraft,
  saveCreativeFeedbackDraft,
} from "@/server/assistant/creative-iteration/draft";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetDraft = vi.mocked(getCreativeFeedbackDraft);
const mockSaveDraft = vi.mocked(saveCreativeFeedbackDraft);

const campaignThread = {
  id: "thread-1",
  clientProfileId: "profile-1",
  campaignId: "campaign-1",
};

describe("/api/assistant/threads/[threadId]/creative-revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(
      campaignThread as Awaited<ReturnType<typeof getAssistantThreadById>>
    );
  });

  it("GET returns draft text when draft exists", async () => {
    mockGetDraft.mockResolvedValue({ draftText: "unsent feedback" } as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draftText: "unsent feedback" });
  });

  it("GET returns 404 when no draft exists", async () => {
    mockGetDraft.mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("GET returns 404 when thread has no campaign", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: null,
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("GET rejects cross-workspace thread access", async () => {
    mockGetThread.mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("PUT saves draft text and returns 200", async () => {
    mockSaveDraft.mockResolvedValue({ draftText: "new draft" } as never);

    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ draftText: "new draft" }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draftText: "new draft" });
    expect(mockSaveDraft).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        campaignId: "campaign-1",
        threadId: "thread-1",
      },
      "new draft"
    );
  });

  it("PUT rejects empty body with 400", async () => {
    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(400);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("PUT rejects draftText > 2000 chars with 400", async () => {
    const longText = "a".repeat(2001);
    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ draftText: longText }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(400);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("PUT returns 404 when thread has no campaign", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: null,
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ draftText: "new draft" }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(404);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("PUT rejects cross-workspace thread access", async () => {
    mockGetThread.mockResolvedValue(null as never);

    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ draftText: "new draft" }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(404);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });
});
