import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ workspace: { id: "ws-1" } })),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/assistant/artifact-version/service", async (original) => {
  const actual = await original<typeof import("@/server/assistant/artifact-version/service")>();
  return {
    ...actual,
    adoptArtifactForThread: vi.fn(),
    getThreadArtifactVersionState: vi.fn(),
  };
});
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  adoptArtifactForThread,
  getThreadArtifactVersionState,
} from "@/server/assistant/artifact-version/service";

const artifactId = "00000000-0000-4000-8000-000000000001";

describe("/api/assistant/threads/[threadId]/artifact-versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue({ id: "thread-1" } as never);
  });

  it("returns canonical thread version state", async () => {
    vi.mocked(getThreadArtifactVersionState).mockResolvedValue({ lineages: [] });
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lineages: [] });
  });

  it("adopts a strictly parsed artifact", async () => {
    vi.mocked(adoptArtifactForThread).mockResolvedValue({ lineageId: artifactId } as never);
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ artifactType: "plan", artifactId }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );
    expect(response.status).toBe(201);
    expect(adoptArtifactForThread).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      artifactType: "plan",
      artifactId,
    });
  });

  it("rejects caller-selected scope fields", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          artifactType: "plan",
          artifactId,
          workspaceId: "other",
        }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );
    expect(response.status).toBe(400);
    expect(adoptArtifactForThread).not.toHaveBeenCalled();
  });

  it("returns 404 before reading state for an unscoped thread", async () => {
    vi.mocked(getAssistantThreadById).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "missing" }),
    });
    expect(response.status).toBe(404);
    expect(getThreadArtifactVersionState).not.toHaveBeenCalled();
  });
});

