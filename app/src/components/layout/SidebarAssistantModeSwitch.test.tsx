import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/campaigns"),
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `assistant.mode.${key}`,
}));

import { usePathname } from "next/navigation";
import SidebarAssistantModeSwitch from "./SidebarAssistantModeSwitch";

const PANEL_RETURN_KEY = "adscale:panel-return";

describe("SidebarAssistantModeSwitch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/campaigns");
    sessionStorage.clear();
  });

  it("renders stacked Painel and Chat controls", () => {
    render(<SidebarAssistantModeSwitch />);

    expect(screen.getByRole("button", { name: "assistant.mode.panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assistant\.mode\.chat/i })).toBeInTheDocument();
  });

  it("navigates to stored panel route when Painel is clicked from assistant", () => {
    vi.mocked(usePathname).mockReturnValue("/assistant");
    sessionStorage.setItem(PANEL_RETURN_KEY, "/settings");

    render(<SidebarAssistantModeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "assistant.mode.panel" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("falls back to / when no panel return path is stored", () => {
    vi.mocked(usePathname).mockReturnValue("/assistant");

    render(<SidebarAssistantModeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: "assistant.mode.panel" }));

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("marks Chat active on assistant routes", () => {
    vi.mocked(usePathname).mockReturnValue("/assistant");

    render(<SidebarAssistantModeSwitch />);

    expect(screen.getByRole("button", { name: /assistant\.mode\.chat/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "assistant.mode.panel" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("stores current route before navigating to assistant", () => {
    vi.mocked(usePathname).mockReturnValue("/library");

    render(<SidebarAssistantModeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: /assistant\.mode\.chat/i }));

    expect(sessionStorage.getItem(PANEL_RETURN_KEY)).toBe("/library");
    expect(mockPush).toHaveBeenCalledWith("/assistant");
  });
});
