import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock("../db", () => ({ db: { insert: mocks.insert } }));

import { createExportRecords } from "./export";

describe("createExportRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
  });

  it("writes all records in one insert and skips an empty set", async () => {
    await createExportRecords("workspace-1", ["d1", "d2"], "png", "archive.zip");

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith([
      { workspaceId: "workspace-1", derivationId: "d1", format: "png", key: "archive.zip" },
      { workspaceId: "workspace-1", derivationId: "d2", format: "png", key: "archive.zip" },
    ]);

    await createExportRecords("workspace-1", [], "png", "archive.zip");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("propagates insert failure", async () => {
    mocks.values.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(createExportRecords("workspace-1", ["d1"], "png", "archive.zip"))
      .rejects.toThrow("database unavailable");

    await expect(createExportRecords("workspace-1", ["d1"], "png", "archive.zip"))
      .resolves.toBeUndefined();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });
});
