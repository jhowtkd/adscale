import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (s: { user: { firstName: string; lastName: string; email: string }; billing: { planName: string } }) => unknown) =>
    selector({
      user: { firstName: "Test", lastName: "User", email: "t@t.com" },
      billing: { planName: "Starter" },
    }),
}));
vi.mock("@/lib/hooks/use-campaigns", () => ({ useCampaignCount: () => ({ count: 0 }) }));
vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { name: "Test User" } } }),
    signOut: vi.fn(),
  },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./AppSidebarCampaignMap", () => ({
  default: () => <div data-testid="campaign-map" />,
}));
vi.mock("./SidebarBrandKitFeature", () => ({
  default: () => (
    <a href="/brand-kit" data-testid="sidebar-brand-kit-feature">
      navigation.brandKit
    </a>
  ),
}));
vi.mock("./SidebarAssistantModeSwitch", () => ({
  default: () => (
    <div role="group" aria-label="assistant.mode.headerTitle">
      <button type="button">assistant.mode.panel</button>
      <button type="button">assistant.mode.chat</button>
    </div>
  ),
}));

import AppSidebar from "./AppSidebar";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { authClient } from "@/lib/auth-client";

describe("AppSidebar role-aware navigation", () => {
  beforeEach(() => {
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "paid", role: "owner", label: "Owner" }, creditBalance: 10 },
    } as ReturnType<typeof useBillingStatus>);
  });

  it("does not show a decorative search / ⌘K affordance", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText(/Buscar/i)).not.toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
  });

  it("shows icon nav, Painel/Chat switch, Brand Kit feature, and campaign map", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("navigation.creativeIntelligenceAdvanced")).not.toBeInTheDocument();
    expect(screen.queryByText("navigation.sectionAvancado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "assistant.mode.panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assistant\.mode\.chat/i })).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-brand-kit-feature")).toHaveAttribute("href", "/brand-kit");
    expect(screen.getByTestId("campaign-map")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "common.create" })).toHaveAttribute(
      "href",
      "/campaigns?new=1"
    );
  });

  it("does NOT show the Laboratório section header", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("Laboratório")).not.toBeInTheDocument();
  });

  it("hides OPERACAO section header but keeps Feedback link for owner/admin roles", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("navigation.sectionOperacao")).not.toBeInTheDocument();
    expect(screen.getByText("navigation.feedback")).toBeInTheDocument();
  });

  it("hides Feedback link for non-owner/admin roles", () => {
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "tester", label: "Tester" }, creditBalance: 10 },
    } as ReturnType<typeof useBillingStatus>);
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("navigation.sectionOperacao")).not.toBeInTheDocument();
    expect(screen.queryByText("navigation.feedback")).not.toBeInTheDocument();
  });

  it("shows logout in the sidebar footer and signs out on click", () => {
    render(<AppSidebar variant="production" />);

    const logoutButton = screen.getByRole("button", { name: "navigation.logout" });
    expect(logoutButton).toBeInTheDocument();

    fireEvent.click(logoutButton);

    expect(authClient.signOut).toHaveBeenCalled();
  });
});
