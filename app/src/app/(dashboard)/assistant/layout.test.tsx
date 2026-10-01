import { Fragment } from "react";
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
  it("returns only the children with the gate on: the rail shell above is the layout", async () => {
    mockGate.mockImplementation((id) => id === "workspace-active");
    const children = <p>child</p>;
    const element = await AssistantLayout({ children });
    expect(mockGate).toHaveBeenCalledWith("workspace-active");
    expect(element.type).toBe(Fragment);
    expect(element.props.children).toBe(children);
  });

  it("keeps the classic assistant shell with the gate off", async () => {
    mockGate.mockImplementation((id) => id !== "workspace-active");
    const element = await AssistantLayout({ children: null });
    expect(mockGate).toHaveBeenCalledWith("workspace-active");
    expect(element.props.sidebar.props).not.toHaveProperty("equipeEnabled");
    expect(element.props.hideDesktopSidebar).toBe(true);
  });
});
