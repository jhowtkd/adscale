import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, fromMock, selectMock, updateMock, setMock, updateWhereMock, returningMock } = vi.hoisted(() => {
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { whereMock, fromMock, selectMock, updateMock, setMock, updateWhereMock, returningMock };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
}));

import { getActivePackageChildren, updateDerivationQa } from "./derivation";

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

  describe("updateDerivationQa", () => {
    it("updates QA fields scoped by id and workspace", async () => {
      const row = { id: "derivation-id", qaStatus: "warning" };
      returningMock.mockResolvedValue([row]);

      const result = await updateDerivationQa("derivation-id", "workspace-id", {
        qaStatus: "warning",
        qaChecklist: { legibility: { status: "passed", note: "OK" } },
        qaIssues: ["Issue 1"],
        qaSuggestions: ["Suggestion 1"],
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(updateWhereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });

    it("returns null when no row matches", async () => {
      returningMock.mockResolvedValue([]);

      const result = await updateDerivationQa("missing-id", "workspace-id", {
        qaStatus: "ready",
        qaChecklist: {},
        qaIssues: [],
        qaSuggestions: [],
      });

      expect(result).toBeNull();
    });
  });
});
