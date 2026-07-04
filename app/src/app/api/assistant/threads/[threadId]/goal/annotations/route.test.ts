import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
  upsertAnnotationDraft: vi.fn(),
  listAnnotationsForVersion: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGoalRunScoped, upsertAnnotationDraft, listAnnotationsForVersion } from "@/server/repositories/assistant-goal";

const mockGetThread = vi.mocked(getAssistantThreadById);

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockGetGoal = vi.mocked(getGoalRunScoped);
const mockUpsert = vi.mocked(upsertAnnotationDraft);
const mockList = vi.mocked(listAnnotationsForVersion);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };
const threadId = "00000000-0000-4000-8000-0000000000t1";
const params = Promise.resolve({ threadId });
const goalRunId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000021";

function req(method: string, body: unknown, query = ""): Request {
  return new Request(
    `http://localhost/api/assistant/threads/${threadId}/goal/annotations${query}`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    }
  );
}

describe("/api/assistant/threads/[threadId]/goal/annotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockGetThread.mockResolvedValue({
      id: threadId,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as never);
    mockGetGoal.mockResolvedValue({ id: goalRunId, campaignId: "c1" } as never);
    mockUpsert.mockResolvedValue({
      id: "ann-1",
      versionId,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.2,
      comment: "Menor",
      status: "draft",
      addressedByVersionId: null,
    } as never);
    mockList.mockResolvedValue([] as never);
  });

  it("creates a draft annotation with normalized coordinates", async () => {
    const response = await POST(req("POST", {
      goalRunId,
      versionId,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.2,
      comment: "Menor",
    }), { params });

    expect(response.status).toBe(201);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ goalRunId, versionId, comment: "Menor" })
    );
  });

  it("rejects an out-of-bounds rectangle", async () => {
    const response = await POST(req("POST", {
      goalRunId,
      versionId,
      x: 0.9,
      y: 0.9,
      width: 0.5,
      height: 0.5,
      comment: "x",
    }), { params });

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects an empty comment", async () => {
    const response = await POST(req("POST", {
      goalRunId,
      versionId,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      comment: "   ",
    }), { params });

    expect(response.status).toBe(400);
  });

  it("lists annotations for a version", async () => {
    mockList.mockResolvedValue([{ id: "ann-1" }] as never);

    const response = await GET(
      req("GET", null, `?versionId=${versionId}&goalRunId=${goalRunId}`),
      { params }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.annotations).toHaveLength(1);
  });
});
