import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertMock,
  valuesMock,
  returningMock,
  updateMock,
  setMock,
  selectMock,
  fromMock,
  whereMock,
  orderByMock,
} = vi.hoisted(() => {
  const orderByMock = vi.fn();
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const returningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    insertMock,
    valuesMock,
    returningMock,
    updateMock,
    setMock,
    selectMock,
    fromMock,
    whereMock,
    orderByMock,
  };
});

vi.mock("../db", () => ({
  db: {
    insert: insertMock,
    update: updateMock,
    select: selectMock,
  },
}));

import {
  createLandingPage,
  completeLandingPage,
  failLandingPage,
  getLandingPagesByDerivation,
} from "./landing-page";

describe("landing page repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    returningMock.mockResolvedValue([]);
    whereMock.mockReturnValue({ orderBy: orderByMock });
    orderByMock.mockResolvedValue([]);
  });

  describe("createLandingPage", () => {
    it("inserts a queued landing page record", async () => {
      const row = {
        id: "lp-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        sourceDerivationId: "der-1",
        status: "queued",
      };
      returningMock.mockResolvedValue([row]);

      const result = await createLandingPage({
        workspaceId: "ws-1",
        campaignId: "camp-1",
        sourceDerivationId: "der-1",
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          campaignId: "camp-1",
          sourceDerivationId: "der-1",
          status: "queued",
        })
      );
      expect(result).toBe(row);
    });
  });

  describe("completeLandingPage", () => {
    it("updates record to completed with title, structure, and htmlKey", async () => {
      const row = {
        id: "lp-1",
        status: "completed",
        title: "Landing Page",
        htmlKey: "key.html",
      };
      returningMock.mockResolvedValue([row]);

      const result = await completeLandingPage({
        id: "lp-1",
        workspaceId: "ws-1",
        title: "Landing Page",
        structure: { sections: {} },
        htmlKey: "key.html",
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          title: "Landing Page",
          structure: { sections: {} },
          htmlKey: "key.html",
          error: null,
        })
      );
      expect(result).toBe(row);
    });

    it("returns null when no row matches", async () => {
      returningMock.mockResolvedValue([]);

      const result = await completeLandingPage({
        id: "missing",
        workspaceId: "ws-1",
        title: "X",
        structure: {},
        htmlKey: "key.html",
      });

      expect(result).toBeNull();
    });
  });

  describe("failLandingPage", () => {
    it("updates record to failed with error message", async () => {
      const row = { id: "lp-1", status: "failed", error: "AI timeout" };
      returningMock.mockResolvedValue([row]);

      const result = await failLandingPage({
        id: "lp-1",
        workspaceId: "ws-1",
        error: "AI timeout",
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error: "AI timeout",
        })
      );
      expect(result).toBe(row);
    });
  });

  describe("getLandingPagesByDerivation", () => {
    it("selects by workspace and source derivation ordered newest first", async () => {
      const rows = [{ id: "lp-2" }, { id: "lp-1" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getLandingPagesByDerivation("ws-1", "der-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });
});
