import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ workspace: { id: "ws-1" } })),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/assistant/artifact-version/promotion", () => ({
  acknowledgeLinkedPlanComparison: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { acknowledgeLinkedPlanComparison } from "@/server/assistant/artifact-version/promotion";
import { ArtifactVersionValidationError } from "@/server/repositories/artifact-version";

const command = {
  creativeTargetVersionId: "00000000-0000-4000-8000-000000000001",
  planLineageId: "00000000-0000-4000-8000-000000000002",
  linkedPlanVersionId: "00000000-0000-4000-8000-000000000003",
  comparedOfficialPlanVersionId: "00000000-0000-4000-8000-000000000004",
  expectedPlanRevision: 3,
};

describe("comparison acknowledgement route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAssistantThreadById).mockResolvedValue({ id: "thread-1" } as never);
  });

  it("creates only a strict server-verified acknowledgement", async () => {
    vi.mocked(acknowledgeLinkedPlanComparison).mockResolvedValue({
      id: command.creativeTargetVersionId,
      ...command,
      createdAt: new Date("2026-06-28T00:00:00Z"),
    });
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(201);
    expect(acknowledgeLinkedPlanComparison).toHaveBeenCalledWith({ workspaceId: "ws-1", threadId: "thread-1", command });
  });

  it("rejects caller assertions and unknown scope fields", async () => {
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ ...command, clientApproved: true, workspaceId: "other" }),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
    expect(acknowledgeLinkedPlanComparison).not.toHaveBeenCalled();
  });

  it("rejects a forged or stale receipt observed by the server", async () => {
    vi.mocked(acknowledgeLinkedPlanComparison).mockRejectedValue(
      new ArtifactVersionValidationError("stale acknowledgement")
    );
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ threadId: "thread-1" }) });
    expect(response.status).toBe(400);
  });

  it("requires a thread visible in the authenticated workspace", async () => {
    vi.mocked(getAssistantThreadById).mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(command),
    }), { params: Promise.resolve({ threadId: "other-thread" }) });
    expect(response.status).toBe(404);
    expect(acknowledgeLinkedPlanComparison).not.toHaveBeenCalled();
  });
});
