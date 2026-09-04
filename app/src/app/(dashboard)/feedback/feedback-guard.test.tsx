import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks ---------------------------------------------------------------
// next-intl: return the key path so we can assert nothing operational renders.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

// Track router.replace calls across renders.
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/feedback",
}));

// @tanstack/react-query: avoid provider; feedback page uses useQuery/useMutation.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// api-client: never actually fetch.
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

// The feedback panels render operational content; stub them so a non-empty
// render would surface as a visible marker we can assert against.
vi.mock("@/components/feedback/BetaSessionsPanel", () => ({
  BetaSessionsPanel: () => <div data-testid="beta-sessions" />,
}));
vi.mock("@/components/feedback/TesterProfilesPanel", () => ({
  TesterProfilesPanel: () => <div data-testid="tester-profiles" />,
}));
vi.mock("@/components/feedback/OwnerAnalyticsPanel", () => ({
  OwnerAnalyticsPanel: () => <div data-testid="owner-analytics" />,
}));
vi.mock("@/components/feedback/GuidedFlowFeedbackPanel", () => ({
  GuidedFlowFeedbackPanel: () => <div data-testid="guided-flow-feedback" />,
}));

// Platform-owner access is independent of workspace role.
let platformOwnerAllowed = false;
vi.mock("@/lib/hooks/use-platform-owner", () => ({
  usePlatformOwnerAccess: () => ({
    data: { allowed: platformOwnerAllowed },
    isLoading: false,
  }),
}));

import FeedbackTriagePage from "./page";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("feedback route guard", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    platformOwnerAllowed = false;
  });

  it("redirects non-platform-owner workspace roles and renders only the forbidden state", async () => {
    platformOwnerAllowed = false;
    const { container } = render(<FeedbackTriagePage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/campaigns");
    });
    // No operational panels leak to a member.
    expect(container.querySelector('[data-testid="owner-analytics"]')).toBeNull();
    expect(container.querySelector('[data-testid="beta-sessions"]')).toBeNull();
    expect(container.textContent).toContain("feedback.triage.forbidden");
  });

  it("does not redirect tester roles either", async () => {
    platformOwnerAllowed = false;
    render(<FeedbackTriagePage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/campaigns");
    });
  });

  it("allows the platform owner and renders operational content", async () => {
    platformOwnerAllowed = true;
    render(<FeedbackTriagePage />);
    await flushPromises();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("beta-sessions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "feedback.triage.consoleTabs.metrics" }));
    expect(screen.getByTestId("owner-analytics")).toBeTruthy();
  });

});
