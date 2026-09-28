// LiveAdscaleGateway: every method stays inside the construction workspace.

import { describe, expect, it, vi } from "vitest";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCreativeWorkOutputInWorkspace } from "@/server/repositories/creative-work";
import { LiveAdscaleGateway } from "./gateway";

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));
vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  getCreativeWorkOutputInWorkspace: vi.fn(),
}));

const stubProfile = vi.mocked(getClientProfile);
const stubOutput = vi.mocked(getCreativeWorkOutputInWorkspace);

describe("LiveAdscaleGateway", () => {
  it("refuses a client profile read for another workspace without hitting the repository", async () => {
    stubProfile.mockResolvedValue({ id: "profile-1", workspaceId: "workspace-other" } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getClientProfile("workspace-other", "profile-1")).resolves.toBeNull();
    expect(stubProfile).not.toHaveBeenCalled();
  });

  it("reads a client profile inside its own workspace", async () => {
    stubProfile.mockResolvedValue({ id: "profile-1", workspaceId: "workspace-1" } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getClientProfile("workspace-1", "profile-1")).resolves.toEqual({
      id: "profile-1",
      workspaceId: "workspace-1",
    });
    expect(stubProfile).toHaveBeenCalledWith("workspace-1", "profile-1");
  });

  it("reads an output with its work inside its own workspace", async () => {
    stubOutput.mockResolvedValue({
      id: "output-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
    } as never);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getCreativeWorkOutput("output-1")).resolves.toEqual({
      id: "output-1",
      workspaceId: "workspace-1",
      workId: "work-1",
    });
    expect(stubOutput).toHaveBeenCalledWith("workspace-1", "output-1");
  });

  it("returns null for an unknown output", async () => {
    stubOutput.mockResolvedValue(null);
    const gateway = new LiveAdscaleGateway("workspace-1");
    await expect(gateway.getCreativeWorkOutput("missing")).resolves.toBeNull();
  });
});
