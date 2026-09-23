import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkNotificationsAsRead,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
} from "./use-notifications";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

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

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches notifications", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          notifications: [
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
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notifications?limit=50");
    expect(result.current.data?.[0].id).toBe("notif-1");
  });
});

describe("useMarkNotificationAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PATCH to mark notification as read", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          notification: {
            id: "notif-1",
            readAt: new Date().toISOString(),
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useMarkNotificationAsRead(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("notif-1");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/notifications/notif-1/read",
      { method: "PATCH" }
    );
  });
});

describe("useMarkNotificationsAsRead", () => {
  it("marks only selected IDs with bounded concurrency and invalidates once", async () => {
    vi.clearAllMocks();
    let active = 0;
    let peak = 0;
    mockApiFetch.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return { ok: true, json: async () => ({ notification: {} }) } as Response;
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkNotificationsAsRead(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync(["n1", "n2", "n3", "n4", "n5"]));
    expect(mockApiFetch.mock.calls.map(([path]) => path)).toEqual(
      ["n1", "n2", "n3", "n4", "n5"].map((id) => `/api/notifications/${id}/read`),
    );
    expect(peak).toBe(4);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ["notifications"] });
  });
});

describe("useMarkAllNotificationsAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PATCH to mark all as read", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);

    const { result } = renderHook(() => useMarkAllNotificationsAsRead(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notifications", {
      method: "PATCH",
    });
  });
});

describe("useClearAllNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls DELETE to clear all notifications", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);

    const { result } = renderHook(() => useClearAllNotifications(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notifications", {
      method: "DELETE",
    });
  });
});
