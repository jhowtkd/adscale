import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ workspace: { id: "ws-1" } })),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/assistant/artifact-version/comparison", () => ({
  compareArtifactVersions: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { compareArtifactVersions } from "@/server/assistant/artifact-version/comparison";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";

const id = (suffix: string) => `00000000-0000-4000-8000-000000000${suffix}`;

describe("POST artifact version comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue({ id: "thread-1" } as never);
  });

  it("delegates a strict authenticated read-only selection", async () => {
    vi.mocked(compareArtifactVersions).mockResolvedValue({ type: "plan" } as never);
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({
        lineageId: id("100"), versionAId: id("101"), versionBId: id("102"), includeUnchanged: true,
      }),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });

    expect(response.status).toBe(200);
    expect(compareArtifactVersions).toHaveBeenCalledWith({
      workspaceId: "ws-1", threadId: "thread-1", lineageId: id("100"),
      versionAId: id("101"), versionBId: id("102"), includeUnchanged: true,
    });
  });

  it("rejects caller-selected scope fields", async () => {
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({
        lineageId: id("100"), versionAId: id("101"), versionBId: id("102"), workspaceId: "other",
      }),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
    expect(compareArtifactVersions).not.toHaveBeenCalled();
  });

  it("returns a safe client error for invalid scoped selection", async () => {
    const { ArtifactVersionValidationError } = await import("@/server/repositories/artifact-version");
    vi.mocked(compareArtifactVersions).mockRejectedValue(new ArtifactVersionValidationError("Cross-lineage"));
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ lineageId: id("100"), versionAId: id("101"), versionBId: id("102") }),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).not.toMatchObject({ message: "Cross-lineage" });
  });
});
