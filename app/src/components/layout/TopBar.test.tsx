import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationMenu } from "./TopBar";

vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: vi.fn(),
  useMarkNotificationsAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useMarkAllNotificationsAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useClearAllNotifications: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => key),
  useLocale: vi.fn(() => "pt-BR"),
}));

import { useMarkNotificationsAsRead, useNotifications } from "@/lib/hooks/use-notifications";

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

describe("NotificationMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("prefetches notifications on mount instead of waiting for panel open", () => {
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);

    render(<NotificationMenu />, { wrapper: createWrapper() });

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

    render(<NotificationMenu />, { wrapper: createWrapper() });

    expect(screen.getByText("1")).toHaveClass("bg-[var(--info-dot)]");
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

    render(<NotificationMenu />, { wrapper: createWrapper() });

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

    render(<NotificationMenu />, { wrapper: createWrapper() });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Derivação pronta")).toBeInTheDocument();
    });
  });

  it("keeps the notification dialog viewport-bounded from its right edge", async () => {
    render(<NotificationMenu />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const dialog = await screen.findByRole("dialog", { name: /notifications/i });
    expect(dialog).toHaveClass(
      "absolute",
      "right-0",
      "w-[360px]",
      "max-w-[calc(100vw-2rem)]",
      "flex",
      "flex-col",
      "max-h-[calc(100dvh-5rem)]",
      "overflow-hidden",
    );
    expect(dialog.querySelector("div[class*='overflow-y-auto']")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });

  it("collapses 39 identical derivation_completed notifications into a single consolidated row", async () => {
    const now = Date.now();
    const many = Array.from({ length: 39 }, (_, i) => ({
      id: `notif-${i}`,
      userId: "user-1",
      workspaceId: "ws-1",
      type: "derivation_completed",
      title: "Derivação pronta",
      message: 'Uma derivação da campanha "Cenbrap em Dobro - Teste" foi gerada com sucesso.',
      derivationId: `deriv-${i}`,
      campaignId: "camp-1",
      readAt: null,
      createdAt: new Date(now - i * 1000),
      updatedAt: new Date(now - i * 1000),
    }));
    mockUseNotifications.mockReturnValue({ data: many } as ReturnType<typeof useNotifications>);

    render(<NotificationMenu />, { wrapper: createWrapper() });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      // The title "Derivação pronta" appears exactly once (one consolidated row)
      expect(screen.getAllByText("Derivação pronta")).toHaveLength(1);
    });
    // The full list of 39 items is reflected in the header count
    expect(screen.getByText(/39/)).toBeInTheDocument();
  });

  it("marks only the clicked group's unread notifications", async () => {
    const markGroup = vi.fn();
    vi.mocked(useMarkNotificationsAsRead).mockReturnValue({ mutate: markGroup } as unknown as ReturnType<typeof useMarkNotificationsAsRead>);
    const now = new Date();
    const base = {
      userId: "user-1", workspaceId: "ws-1", type: "derivation_completed",
      title: "Ready", derivationId: null, readAt: null,
      createdAt: now, updatedAt: now,
    };
    mockUseNotifications.mockReturnValue({ data: [
      { ...base, id: "n1", campaignId: "camp-1", message: 'Work "Alpha" ready' },
      { ...base, id: "n2", campaignId: "camp-1", message: 'Work "Alpha" ready' },
      { ...base, id: "n3", campaignId: "camp-1", message: 'Work "Alpha" ready', readAt: now },
      { ...base, id: "n4", campaignId: "camp-2", message: 'Work "Beta" ready' },
    ] } as ReturnType<typeof useNotifications>);

    render(<NotificationMenu />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    const link = document.querySelector('a[href^="/campaigns/camp-1"]');
    expect(link).not.toBeNull();
    fireEvent.click(link!);

    expect(markGroup).toHaveBeenCalledTimes(1);
    expect(markGroup.mock.calls[0][0]).toEqual(["n1", "n2"]);
  });
});
