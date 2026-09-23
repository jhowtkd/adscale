import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useNotifications,
  useMarkNotificationsAsRead,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
} from "./use-notifications";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper(queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })) {
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

describe("useMarkNotificationsAsRead", () => {
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

    const { result } = renderHook(() => useMarkNotificationsAsRead(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(["notif-1"]);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/notifications/notif-1/read",
      { method: "PATCH" }
    );
  });

  it("marks only supplied IDs with limited concurrency and one cache invalidation", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let peak = 0;
    mockApiFetch.mockImplementation(async (input) => {
      active++;
      peak = Math.max(peak, active);
      await gate;
      active--;
      if (String(input).includes("notif-bad")) {
        return Response.json({ error: "failed" }, { status: 500 });
      }
      return Response.json({ notification: { id: String(input), readAt: new Date().toISOString() } });
    });

    const onPartialFailure = vi.fn();
    const { result, unmount } = renderHook(() => useMarkNotificationsAsRead(onPartialFailure), {
      wrapper: createWrapper(queryClient),
    });
    const pending = result.current.mutateAsync([
      "notif-1", "notif-bad", "notif-3", "notif-4",
    ]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    expect(peak).toBe(3);
    expect(invalidateSpy).not.toHaveBeenCalled();

    unmount();
    release?.();
    expect(await pending).toEqual({
      succeededIds: ["notif-1", "notif-3", "notif-4"],
      failedIds: ["notif-bad"],
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(onPartialFailure).toHaveBeenCalledWith(1);
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
