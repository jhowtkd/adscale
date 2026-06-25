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

vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: vi.fn(),
  useMarkNotificationAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useMarkAllNotificationsAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useClearAllNotifications: vi.fn(() => ({ mutate: vi.fn() })),
}));

const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => "/campaigns");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/ui/LanguageSwitcher", () => ({
  default: () => null,
}));

vi.mock("@/components/feedback/FeedbackTriggerButton", () => ({
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

const PANEL_RETURN_KEY = "adscale:panel-return";

describe("TopBar mode toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/campaigns");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("navigates to /assistant when Chat segment is clicked", () => {
    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "chat" }));

    expect(mockPush).toHaveBeenCalledWith("/assistant");
    expect(sessionStorage.getItem(PANEL_RETURN_KEY)).toBe("/campaigns");
  });

  it("preserves threadId search param when switching to Chat", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-42"));

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "chat" }));

    expect(mockPush).toHaveBeenCalledWith("/assistant?threadId=thread-42");
  });

  it("navigates to stored panel route when Panel is clicked from assistant", () => {
    mockUsePathname.mockReturnValue("/assistant");
    sessionStorage.setItem(PANEL_RETURN_KEY, "/settings");

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "panel" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("falls back to / when no panel return path is stored", () => {
    mockUsePathname.mockReturnValue("/assistant");

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "panel" }));

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("marks Chat segment active on assistant routes", () => {
    mockUsePathname.mockReturnValue("/assistant");

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "chat" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "panel" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("TopBar notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/campaigns");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("prefetches notifications on mount instead of waiting for panel open", () => {
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);

    render(<TopBar />, { wrapper: createWrapper() });

    expect(mockUseNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ refetchInterval: 30_000 })
    );
    expect(mockUseNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
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

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Derivação pronta")).toBeInTheDocument();
    });
  });
});
