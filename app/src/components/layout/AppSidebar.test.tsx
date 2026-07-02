import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/campaigns" }));
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
vi.mock("@/lib/hooks/use-campaigns", () => ({ useCampaigns: () => ({ totalCount: 0 }) }));
vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "Test User" } } }) },
}));
vi.mock("next/image", () => ({ default: () => null }));

import AppSidebar from "./AppSidebar";
import { useBillingStatus } from "@/lib/hooks/use-billing";

describe("AppSidebar role-aware navigation", () => {
  beforeEach(() => {
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "owner", label: "Owner" }, creditBalance: 10 },
    });
  });

  it("shows Curador IA under CRIAR section for all users", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.getByText("navigation.curadorIA")).toBeInTheDocument();
  });

  it("does NOT show the Laboratório section header", () => {
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("Laboratório")).not.toBeInTheDocument();
  });

  it("hides OPERACAO section and Feedback link for non-owner/admin roles", () => {
    vi.mocked(useBillingStatus).mockReturnValue({
      data: { access: { kind: "tester", label: "Tester" }, creditBalance: 10 },
    });
    render(<AppSidebar variant="production" />);
    expect(screen.queryByText("navigation.sectionOperacao")).not.toBeInTheDocument();
    expect(screen.queryByText("navigation.feedback")).not.toBeInTheDocument();
  });
});
