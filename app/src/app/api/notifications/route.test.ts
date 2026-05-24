import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/notification", () => ({
  getNotificationsByUser: vi.fn(),
  markAllNotificationsAsRead: vi.fn(),
  deleteNotificationsByUser: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getNotificationsByUser,
  markAllNotificationsAsRead,
  deleteNotificationsByUser,
} from "@/server/repositories/notification";

const mockGetNotificationsByUser = vi.mocked(getNotificationsByUser);
const mockMarkAllNotificationsAsRead = vi.mocked(markAllNotificationsAsRead);
const mockDeleteNotificationsByUser = vi.mocked(deleteNotificationsByUser);

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns notifications for the user", async () => {
    const mockNotifications = [
      {
        id: "notif-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        type: "derivation_completed",
        title: "Derivação pronta",
        message: "Test",
        derivationId: "deriv-1",
        campaignId: "camp-1",
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockGetNotificationsByUser.mockResolvedValue(mockNotifications as any);

    const res = await GET(new Request("http://localhost/api/notifications"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("notif-1");
    expect(mockGetNotificationsByUser).toHaveBeenCalledWith("user-1", "workspace-1", 50);
  });
});

describe("PATCH /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks all notifications as read", async () => {
    mockMarkAllNotificationsAsRead.mockResolvedValue(undefined);

    const res = await PATCH(new Request("http://localhost/api/notifications"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledWith("user-1", "workspace-1");
  });
});

describe("DELETE /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes all notifications for the user", async () => {
    mockDeleteNotificationsByUser.mockResolvedValue(undefined);

    const res = await DELETE(new Request("http://localhost/api/notifications"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeleteNotificationsByUser).toHaveBeenCalledWith("user-1", "workspace-1");
  });
});
