import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let pathnameMock = "/campaigns";

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock,
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
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: () => ({ data: [], isLoading: false }),
}));
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
vi.mock("./ActiveBrandSwitcher", () => ({
  default: () => <div data-testid="active-brand-switcher" />,
}));

import AppSidebar from "./AppSidebar";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { authClient } from "@/lib/auth-client";

describe("AppSidebar role-aware navigation", () => {
  beforeEach(() => {
    pathnameMock = "/campaigns";
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "paid", role: "owner", label: "Owner" }, creditBalance: 10 },
    } as ReturnType<typeof useBillingStatus>);
  });

  it("marks the operational home active while a legacy create-post URL redirects", () => {
    pathnameMock = "/quick-tools/create-post";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "navigation.home" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("does not show a decorative search / ⌘K affordance", () => {
    render(<AppSidebar />);
    expect(screen.queryByText(/Buscar/i)).not.toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
  });

  it("shows the brand training highlight without the active-brand switcher", () => {
    render(<AppSidebar />);
    expect(screen.queryByText("navigation.creativeIntelligenceAdvanced")).not.toBeInTheDocument();
    expect(screen.queryByText("navigation.sectionAvancado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "assistant.mode.panel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assistant\.mode\.chat/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-brand-switcher")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "navigation.home" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "navigation.works" })).toHaveAttribute(
      "href",
      "/campaigns"
    );
    expect(screen.getByRole("link", { name: "library.title" })).toHaveAttribute(
      "href",
      "/library"
    );
    expect(screen.getByTestId("sidebar-brand-kit-feature")).toHaveAttribute(
      "href",
      "/brand-kit"
    );
    const configLink = screen.getByRole("link", { name: "navigation.config" });
    expect(configLink).toHaveAttribute(
      "href",
      "/settings"
    );
    expect(
      screen.getByRole("link", { name: "library.title" }).compareDocumentPosition(
        screen.getByTestId("sidebar-brand-kit-feature")
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getByTestId("sidebar-brand-kit-feature").compareDocumentPosition(configLink) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByText("navigation.templates")).not.toBeInTheDocument();
    expect(screen.getByTestId("campaign-map")).toBeInTheDocument();
  });

  it("does NOT show the Laboratório section header", () => {
    render(<AppSidebar />);
    expect(screen.queryByText("Laboratório")).not.toBeInTheDocument();
  });

  it("hides OPERACAO section header but keeps Feedback link for owner/admin roles", () => {
    render(<AppSidebar />);
    expect(screen.queryByText("navigation.sectionOperacao")).not.toBeInTheDocument();
    expect(screen.getByText("navigation.feedback")).toBeInTheDocument();
  });

  it("hides Feedback link for non-owner/admin roles", () => {
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "tester", label: "Tester" }, creditBalance: 10 },
    } as ReturnType<typeof useBillingStatus>);
    render(<AppSidebar />);
    expect(screen.queryByText("navigation.sectionOperacao")).not.toBeInTheDocument();
    expect(screen.queryByText("navigation.feedback")).not.toBeInTheDocument();
  });

  it("shows logout in the sidebar footer and signs out on click", () => {
    render(<AppSidebar />);

    const logoutButton = screen.getByRole("button", { name: "navigation.logout" });
    expect(logoutButton).toBeInTheDocument();

    fireEvent.click(logoutButton);

    expect(authClient.signOut).toHaveBeenCalled();
  });
});
