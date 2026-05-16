import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, fromMock, selectMock } = vi.hoisted(() => {
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { whereMock, fromMock, selectMock };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
  },
}));

import { getActivePackageChildren } from "./derivation";

describe("derivation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockResolvedValue([]);
  });

  describe("delivery package derivation helpers", () => {
    it("returns active package children for a parent and target formats", async () => {
      const rows = [
        { id: "child-4:5", parentId: "source-id", format: "4:5", status: "queued" },
      ];
      whereMock.mockResolvedValue(rows);

      const result = await getActivePackageChildren({
        parentId: "source-id",
        workspaceId: "workspace-id",
        formats: ["4:5", "9:16"],
      });

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });

    it("does not query when formats array is empty", async () => {
      const result = await getActivePackageChildren({
        parentId: "source-id",
        workspaceId: "workspace-id",
        formats: [],
      });

      expect(result).toEqual([]);
      expect(selectMock).not.toHaveBeenCalled();
    });
  });
});
