import { describe, expect, it, vi } from "vitest";

const mockGate = vi.fn<(workspaceId: string) => boolean>();
vi.mock("@/server/auth/session", () => ({
  getSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: async () => ({ id: "workspace-1" }),
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
    mockGate.mockReturnValue(enabled);
    const element = await AssistantLayout({ children: null });
    expect(mockGate).toHaveBeenCalledWith("workspace-1");
    expect(element.props.sidebar.props.equipeEnabled).toBe(enabled);
  });
});
