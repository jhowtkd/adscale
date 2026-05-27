import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TopBar from "./TopBar";

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((selector: (state: { user: { firstName: string; lastName: string; email: string }; currentPageTitle: string }) => unknown) =>
    selector({
      user: { firstName: "Test", lastName: "User", email: "test@example.com" },
      currentPageTitle: "Dashboard",
    })
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { user: { id: "user-1", name: "Test User", email: "test@example.com" } },
    })),
  },
}));

vi.mock("@/lib/hooks/use-dashboard", () => ({
  useDashboard: vi.fn(() => ({ data: null })),
}));

vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: vi.fn(),
  useMarkNotificationAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useMarkAllNotificationsAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useClearAllNotifications: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/campaigns"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/components/ui/LanguageSwitcher", () => ({
  default: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => key),
  useLocale: vi.fn(() => "pt-BR"),
}));

import { useNotifications } from "@/lib/hooks/use-notifications";

const mockUseNotifications = vi.mocked(useNotifications);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("TopBar notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows unread badge when there are unread notifications", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not show badge when all notifications are read", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("opens notification panel when bell is clicked", async () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test message",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    const bell = screen.getByLabelText("notifications");
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Derivação pronta")).toBeInTheDocument();
    });
  });
});
