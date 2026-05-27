import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/notification", () => ({
  markNotificationAsRead: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { markNotificationAsRead } from "@/server/repositories/notification";

const mockMarkNotificationAsRead = vi.mocked(markNotificationAsRead);

describe("PATCH /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a single notification as read", async () => {
    const mockNotification = {
      id: "notif-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      type: "derivation_completed",
      title: "Derivação pronta",
      message: "Test",
      readAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockMarkNotificationAsRead.mockResolvedValue(mockNotification as unknown as typeof mockNotification);

    const res = await PATCH(
      new Request("http://localhost/api/notifications/notif-1/read"),
      { params: Promise.resolve({ id: "notif-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notification.id).toBe("notif-1");
    expect(mockMarkNotificationAsRead).toHaveBeenCalledWith("notif-1", "user-1");
  });

  it("returns 404 when notification not found", async () => {
    mockMarkNotificationAsRead.mockResolvedValue(null as unknown as typeof mockNotification);

    const res = await PATCH(
      new Request("http://localhost/api/notifications/notif-999/read"),
      { params: Promise.resolve({ id: "notif-999" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Notification not found");
  });
});
