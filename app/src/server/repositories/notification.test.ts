import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  whereMock,
  fromMock,
  selectMock,
  insertMock,
  valuesMock,
  returningMock,
  updateMock,
  setMock,
  updateWhereMock,
  deleteMock,
  deleteWhereMock,
  limitMock,
  orderByMock,
} = vi.hoisted(() => {
  const limitMock = vi.fn();
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const updateWhereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));
  return {
    whereMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    returningMock,
    updateMock,
    setMock,
    updateWhereMock,
    deleteMock,
    deleteWhereMock,
    limitMock,
    orderByMock,
  };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  },
}));

import {
  createNotification,
  getNotificationsByUser,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotificationsByUser,
} from "./notification";

describe("notification repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ orderBy: orderByMock });
    limitMock.mockResolvedValue([]);
    returningMock.mockResolvedValue([]);
  });

  describe("createNotification", () => {
    it("inserts a notification with correct data", async () => {
      const mockNotification = {
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
      };
      returningMock.mockResolvedValue([mockNotification]);

      const result = await createNotification({
        userId: "user-1",
        workspaceId: "ws-1",
        type: "derivation_completed",
        title: "Derivação pronta",
        message: "Test message",
        derivationId: "deriv-1",
        campaignId: "camp-1",
      });

      expect(insertMock).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalled();
      expect(result).toEqual(mockNotification);
    });
  });

  describe("getNotificationsByUser", () => {
    it("returns notifications ordered by createdAt desc", async () => {
      const mockNotifications = [
        { id: "notif-1", userId: "user-1", workspaceId: "ws-1", type: "derivation_completed", title: "T1", message: "M1", createdAt: new Date() },
      ];
      limitMock.mockResolvedValue(mockNotifications);

      const result = await getNotificationsByUser("user-1", "ws-1", 10);

      expect(selectMock).toHaveBeenCalled();
      expect(fromMock).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
      expect(result).toEqual(mockNotifications);
    });
  });

  describe("getUnreadNotificationCount", () => {
    it("returns count of unread notifications", async () => {
      (whereMock as any).mockResolvedValue([{ id: "notif-1" }, { id: "notif-2" }]);

      const result = await getUnreadNotificationCount("user-1", "ws-1");

      expect(result).toBe(2);
    });

    it("returns 0 when no unread notifications", async () => {
      (whereMock as any).mockResolvedValue([]);

      const result = await getUnreadNotificationCount("user-1", "ws-1");

      expect(result).toBe(0);
    });
  });

  describe("markNotificationAsRead", () => {
    it("updates readAt for the notification", async () => {
      const mockNotification = {
        id: "notif-1",
        userId: "user-1",
        readAt: new Date(),
      };
      returningMock.mockResolvedValue([mockNotification]);

      const result = await markNotificationAsRead("notif-1", "user-1");

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
      expect(result).toEqual(mockNotification);
    });

    it("returns null when notification not found", async () => {
      returningMock.mockResolvedValue([]);

      const result = await markNotificationAsRead("notif-1", "user-1");

      expect(result).toBeNull();
    });
  });

  describe("markAllNotificationsAsRead", () => {
    it("updates all unread notifications", async () => {
      await markAllNotificationsAsRead("user-1", "ws-1");

      expect(updateMock).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
    });
  });

  describe("deleteNotificationsByUser", () => {
    it("deletes all notifications for user", async () => {
      await deleteNotificationsByUser("user-1", "ws-1");

      expect(deleteMock).toHaveBeenCalled();
    });
  });
});
