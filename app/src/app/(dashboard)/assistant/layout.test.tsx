import { describe, expect, it, vi } from "vitest";

const mockGate = vi.fn<(workspaceId: string) => boolean>();
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: async () => ({ user: { id: "user-1" }, workspace: { id: "workspace-active" } }),
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: (workspaceId: string) => mockGate(workspaceId),
}));
vi.mock("@/components/assistant/AssistantShell", () => ({ default: () => null }));
vi.mock("@/components/assistant/AssistantSidebarPanel", () => ({ default: () => null }));
vi.mock("@/components/assistant/AssistantContextPanelSlot", () => ({ default: () => null }));

import AssistantLayout from "./layout";

describe("AssistantLayout workspace gate", () => {
  it.each([false, true])("passes the server gate %j to the shared sidebar", async (enabled) => {
    mockGate.mockImplementation((id) => id === "workspace-active" ? enabled : !enabled);
    const element = await AssistantLayout({ children: null });
    expect(mockGate).toHaveBeenCalledWith("workspace-active");
    expect(element.props.sidebar.props.equipeEnabled).toBe(enabled);
  });
});
